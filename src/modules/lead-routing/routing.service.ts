import { db } from '@/lib/db';
import { baselineOf, ORGANIC_ONLY } from './equal-split';
import { withinWorkingHours } from '../consultants/capacity-engine';
import { isEnabled } from '../organizations/flags.service';
import { publish } from '@/lib/events';
import { fold } from '@/lib/normalize';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { notifyConsultant, notifyRoles } from '../notifications/notification.service';
import { OPEN_ASSIGNED_STATUSES } from '../leads/state-machine';
import { leadScope } from '../leads/scope';
import { productLabel } from '../leads/catalog';
import {
  equalSplitPeriodStart,
  filterCandidates,
  pickFewest,
  matchRule,
  preferWorkingHours,
  recommendConsultant,
  selectConsultant,
  type RoutingRecommendation,
  type Candidate,
  type RoutingMethod,
  type RoutingRuleLike,
  type Step,
} from './routing-engine';

async function loadCandidates(orgId: string, pjIds?: string[]): Promise<Candidate[]> {
  const consultants = await db.consultant.findMany({
    where: { organizationId: orgId, ...(pjIds?.length ? { pjId: { in: pjIds } } : {}), pj: { active: true } },
    select: { id: true, name: true, pjId: true, products: true, available: true, active: true, maxOpenLeads: true, maxOpenOpportunities: true, workingHours: true, priority: true, splitBaseline: true, splitBaselineAt: true },
  });
  const advanced = await isEnabled(orgId, 'ADVANCED_ROUTING');
  // Uma única consulta agregada para a carga (evita N+1).
  const loads = await db.lead.groupBy({
    by: ['consultantId'],
    where: { organizationId: orgId, consultantId: { in: consultants.map((c) => c.id) }, status: { in: OPEN_ASSIGNED_STATUSES }, deletedAt: null },
    _count: { _all: true },
  });
  const loadMap = new Map(loads.map((l) => [l.consultantId, l._count._all]));
  const opps = advanced ? await db.opportunity.groupBy({ by: ['consultantId'], where: { organizationId: orgId, consultantId: { in: consultants.map((c) => c.id) }, status: 'OPEN' }, _count: { _all: true } }) : [];
  const oppMap = new Map(opps.map((o) => [o.consultantId, o._count._all]));
  // Divisão igual: quantos leads cada um recebeu no mês corrente.
  const period = await db.lead.groupBy({
    by: ['consultantId'],
    where: { organizationId: orgId, consultantId: { in: consultants.map((c) => c.id) }, assignedAt: { gte: equalSplitPeriodStart() }, deletedAt: null, ...ORGANIC_ONLY },
    _count: { _all: true },
  });
  const periodMap = new Map(period.map((p) => [p.consultantId, p._count._all]));
  const now = new Date();
  return consultants.map(({ workingHours, maxOpenOpportunities, splitBaseline, splitBaselineAt, ...c }) => ({
    ...c,
    openLeads: loadMap.get(c.id) ?? 0,
    // Quem entrou no meio do mês começa empatado com a equipe (linha de base), não com zero.
    periodLeads: (periodMap.get(c.id) ?? 0) + baselineOf({ splitBaseline, splitBaselineAt }),
    ...(advanced ? { maxOpenOpportunities, openOpportunities: oppMap.get(c.id) ?? 0, withinWorkingHours: withinWorkingHours(workingHours as never, now) } : {}),
  }));
}

async function nextPointer(orgId: string, key: string) {
  const state = await db.routingState.upsert({
    where: { organizationId_key: { organizationId: orgId, key } },
    create: { organizationId: orgId, key, pointer: 1 },
    update: { pointer: { increment: 1 } },
  });
  return state.pointer - 1;
}

/** Distribui um lead automaticamente. Retorna a decisão registrada. */
export async function routeLead(ctx: Ctx, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId: ctx.orgId } });
  if (!lead) throw NotFound('Lead');

  const regions = await db.region.findMany({ where: { organizationId: ctx.orgId } });
  const region = regions.find((r) => r.name === lead.region) ?? regions.find((r) => r.cities.map(fold).includes(fold(lead.city)));
  const leadLike = { product: lead.product, city: lead.city, uf: lead.uf, source: lead.source, score: lead.score, regionId: region?.id ?? null };

  const rules = (await db.routingRule.findMany({ where: { organizationId: ctx.orgId, active: true }, orderBy: { priority: 'asc' } })) as unknown as RoutingRuleLike[];
  const pjs = await db.pJ.findMany({ where: { organizationId: ctx.orgId, active: true }, select: { id: true, code: true, name: true, city: true, uf: true, citiesServed: true } });
  const pjName = (id: string) => pjs.find((p) => p.id === id)?.code ?? id;

  const steps: Step[] = [
    { step: 'Lead', detail: `${productLabel(lead.product)} · ${lead.city ?? 'cidade não informada'}/${lead.uf ?? '—'} · região ${region?.name ?? 'não identificada'} · score ${lead.score}`, ok: true },
  ];

  let chosen: Candidate | null = null;
  let chosenPool: Candidate[] = [];
  let usedRule: RoutingRuleLike | null = null;
  let method: RoutingMethod = 'ROUND_ROBIN';

  // Anúncio PATROCINADO por consultores: o lead vai só para quem pagou (1 = individual; vários = grupo,
  // dividido igualmente entre eles). Tem prioridade sobre qualquer outra regra.
  if (lead.campaignId) {
    const sponsored = await routeSponsored(ctx, lead, steps);
    if (sponsored) return sponsored;
  }

  // Escreveu direto no WhatsApp de um consultor: o lead fica com ele (se ativo).
  // Ou chegou pela página própria do consultor (link da bio): também é dele.
  const ownHint = lead.routingHint?.match(/^(OWNER|LINK):(.+)$/);
  if (ownHint) {
    const viaLink = ownHint[1] === 'LINK';
    const label = viaLink ? 'Link do consultor' : 'Número do consultor';
    const owner = await db.consultant.findFirst({ where: { id: ownHint[2], organizationId: ctx.orgId, active: true }, select: { id: true, name: true } });
    if (owner) {
      steps.push({ step: label, detail: viaLink ? `O lead chegou pela página própria de ${owner.name}` : `O lead escreveu no WhatsApp de ${owner.name}`, ok: true });
      const decision = await applyAssignment(ctx, lead.id, owner.id, { method: viaLink ? 'CONSULTANT_LINK' : 'NUMBER_OWNER', ruleId: null, ruleName: viaLink ? 'Link do consultor' : 'WhatsApp do consultor', steps, outcome: 'ASSIGNED' });
      return { decision, consultant: owner };
    }
    steps.push({ step: label, detail: 'Consultor inativo — segue a distribuição normal', ok: false });
  }

  // Landing CENTRAL: divisão igual entre as PJs ativas e, dentro da PJ, entre os consultores.
  if (lead.routingHint === 'CENTRAL' && !lead.originPjId) {
    return routeCentral(ctx, lead, steps, pjs);
  }

  // Lead captado na landing própria de uma PJ: fica nessa PJ (divisão igual entre os consultores dela).
  if (lead.originPjId) {
    steps.push({ step: 'PJ de origem (landing própria)', detail: `${pjName(lead.originPjId)} — regras gerais não se aplicam`, ok: true });
    const candidates = await loadCandidates(ctx.orgId, [lead.originPjId]);
    const filtered = filterCandidates(candidates, { product: lead.product });
    const rejected = filtered.rejected;
    const { eligible } = preferWorkingHours(filtered.eligible);
    steps.push({
      step: 'Consultores da PJ',
      detail: `${eligible.length} elegível(is)${rejected.length ? ` · ${rejected.length} descartado(s): ${rejected.slice(0, 4).map((r) => `${r.name} (${r.reason})`).join('; ')}` : ''}`,
      ok: eligible.length > 0,
    });
    const pointer = await nextPointer(ctx.orgId, `pj:${lead.originPjId}`);
    const pick = selectConsultant(eligible, 'EQUAL_SPLIT', pointer);
    if (!pick) {
      steps.push({ step: 'Resultado', detail: 'Nenhum consultor da PJ disponível — lead fica na PJ aguardando distribuição pelo gestor', ok: false });
      const decision = await db.routingDecision.create({ data: { organizationId: ctx.orgId, leadId, outcome: 'NO_ELIGIBLE', steps: steps as object, method: null } });
      await notifyPjManagers(ctx.orgId, lead.originPjId, lead.id, lead.name);
      return { decision, consultant: null };
    }
    steps.push({ step: 'Método: divisão igual', detail: `${pick.name} (${pjName(pick.pjId)}) · ${pick.periodLeads ?? 0} lead(s) no mês · carga ${pick.openLeads}/${pick.maxOpenLeads}`, ok: true });
    const rec = withRecommendation(steps, eligible, lead, pick.id);
    const decision = await applyAssignment(ctx, lead.id, pick.id, { method: 'EQUAL_SPLIT', ruleId: null, ruleName: 'Landing da PJ', steps, outcome: 'ASSIGNED', aiRecommendation: rec });
    return { decision, consultant: pick };
  }

  for (const rule of rules) {
    const m = matchRule(rule, leadLike);
    steps.push({ step: `Regra "${rule.name}" (prioridade ${rule.priority})`, detail: m.reasons.join(' · '), ok: m.matched });
    if (!m.matched) continue;
    const candidates = await loadCandidates(ctx.orgId, rule.pjIds.length ? rule.pjIds : undefined);
    steps.push({ step: 'PJs elegíveis', detail: rule.pjIds.length ? rule.pjIds.map(pjName).join(', ') : 'todas as PJs ativas', ok: true });
    const filtered = filterCandidates(candidates, { product: lead.product, capacity: rule.capacity, pjIds: rule.pjIds });
    const rejected = filtered.rejected;
    const hours = preferWorkingHours(filtered.eligible);
    const eligible = hours.eligible;
    if (hours.filtered) steps.push({ step: 'Horário de trabalho', detail: `${hours.filtered} consultor(es) fora do expediente preteridos`, ok: true });
    steps.push({
      step: 'Consultores elegíveis',
      detail: `${eligible.length} elegível(is)${rejected.length ? ` · ${rejected.length} descartado(s): ${rejected.slice(0, 4).map((r) => `${r.name} (${r.reason})`).join('; ')}` : ''}`,
      ok: eligible.length > 0,
    });
    if (!eligible.length) continue;
    const pointer = rule.method === 'ROUND_ROBIN' || rule.method === 'EQUAL_SPLIT' ? await nextPointer(ctx.orgId, `rule:${rule.id}`) : 0;
    chosen = selectConsultant(eligible, rule.method, pointer, rule.consultantId);
    if (chosen) {
      chosenPool = eligible;
      usedRule = rule;
      method = rule.method;
      break;
    }
  }

  // Nenhuma regra atendeu → divisão igual entre todas as PJs ativas e seus consultores
  // (a cidade não pesa: o atendimento é remoto, inclusive para brasileiros no exterior).
  if (!chosen) return routeCentral(ctx, lead, steps, pjs, 'Fallback padrão');

  steps.push({ step: `Método: ${method === 'EQUAL_SPLIT' ? 'divisão igual' : method}`, detail: `${chosen.name} (${pjName(chosen.pjId)}) · ${chosen.periodLeads ?? 0} lead(s) no mês · carga ${chosen.openLeads}/${chosen.maxOpenLeads}`, ok: true });
  const rec = withRecommendation(steps, chosenPool, lead, chosen.id);
  const decision = await applyAssignment(ctx, lead.id, chosen.id, {
    aiRecommendation: rec,
    method,
    ruleId: usedRule?.id ?? null,
    ruleName: usedRule?.name ?? null,
    steps,
    outcome: 'ASSIGNED',
  });
  return { decision, consultant: chosen };
}

/**
 * Anúncio patrocinado: divisão igual entre os consultores que pagaram, contando os leads DESTE anúncio.
 * Quem está indisponível/no limite fica de fora da vez; se nenhum puder agora, o lead vai mesmo assim
 * para o patrocinador com menos leads do anúncio (eles pagaram por esses leads).
 */
async function routeSponsored(ctx: Ctx, lead: { id: string; product: string | null; campaignId: string | null }, steps: Step[]) {
  const campaign = await db.campaign.findFirst({ where: { id: lead.campaignId!, organizationId: ctx.orgId }, select: { id: true, name: true, sponsorConsultantIds: true } });
  if (!campaign?.sponsorConsultantIds.length) return null;
  const sponsors = await db.consultant.findMany({ where: { organizationId: ctx.orgId, id: { in: campaign.sponsorConsultantIds }, active: true }, select: { id: true } });
  if (!sponsors.length) {
    steps.push({ step: `Anúncio "${campaign.name}"`, detail: 'Nenhum patrocinador ativo — segue a divisão geral', ok: false });
    return null;
  }
  const kind = campaign.sponsorConsultantIds.length === 1 ? 'individual' : `em grupo (${sponsors.length} consultores)`;
  steps.push({ step: `Anúncio ${kind}: "${campaign.name}"`, detail: 'Leads vão só para quem pagou o anúncio', ok: true });
  const candidates = await loadCandidates(ctx.orgId);
  const pool = candidates.filter((c) => sponsors.some((s) => s.id === c.id));
  const { eligible } = filterCandidates(pool, { product: lead.product });
  const counts = await db.lead.groupBy({ by: ['consultantId'], where: { organizationId: ctx.orgId, campaignId: campaign.id, consultantId: { in: sponsors.map((s) => s.id) }, deletedAt: null }, _count: { _all: true } });
  const countOf = (id: string) => counts.find((c) => c.consultantId === id)?._count._all ?? 0;
  const pointer = await nextPointer(ctx.orgId, `campaign:${campaign.id}`);
  const pick = pickFewest(eligible.length ? eligible : pool, (c) => countOf(c.id), pointer);
  if (!pick) return null;
  steps.push({
    step: 'Método: divisão igual no anúncio',
    detail: `${pick.name} · ${countOf(pick.id)} lead(s) deste anúncio${eligible.length ? '' : ' · nenhum patrocinador disponível agora: entregue mesmo assim'}`,
    ok: true,
  });
  const decision = await applyAssignment(ctx, lead.id, pick.id, { method: 'EQUAL_SPLIT', ruleId: null, ruleName: `Anúncio: ${campaign.name}`, steps, outcome: 'ASSIGNED' });
  return { decision, consultant: pick };
}

/**
 * Landing central → 1º escolhe a PJ que recebeu MENOS leads no mês (entre as que têm consultor
 * elegível agora), depois o consultor dela que recebeu menos. Cidade não pesa (atendimento remoto).
 */
async function routeCentral(
  ctx: Ctx,
  lead: { id: string; name: string; product: string | null },
  steps: Step[],
  pjs: { id: string; code: string }[],
  label = 'Landing central'
) {
  steps.push({ step: label, detail: 'Divisão igual entre as PJs ativas e, dentro da PJ, entre os consultores (cidade não pesa)', ok: true });
  const candidates = await loadCandidates(ctx.orgId, pjs.map((p) => p.id));
  const filtered = filterCandidates(candidates, { product: lead.product });
  const { eligible } = preferWorkingHours(filtered.eligible);
  const pjIdsWithEligible = new Set(eligible.map((c) => c.pjId));
  const pjCounts = await db.lead.groupBy({
    by: ['pjId'],
    where: { organizationId: ctx.orgId, pjId: { in: [...pjIdsWithEligible] }, assignedAt: { gte: equalSplitPeriodStart() }, deletedAt: null, ...ORGANIC_ONLY },
    _count: { _all: true },
  });
  const countOf = new Map(pjCounts.map((p) => [p.pjId, p._count._all]));
  const pool = pjs.filter((p) => pjIdsWithEligible.has(p.id));
  steps.push({
    step: 'PJs com consultor disponível',
    detail: pool.length ? pool.map((p) => `${p.code}: ${countOf.get(p.id) ?? 0} no mês`).join(' · ') : 'nenhuma',
    ok: pool.length > 0,
  });
  const pj = pickFewest(pool, (p) => countOf.get(p.id) ?? 0, await nextPointer(ctx.orgId, 'central:pj'));
  if (!pj) {
    steps.push({ step: 'Resultado', detail: 'Nenhum consultor disponível — lead aguardando distribuição manual', ok: false });
    const decision = await db.routingDecision.create({ data: { organizationId: ctx.orgId, leadId: lead.id, outcome: 'NO_ELIGIBLE', steps: steps as object, method: null } });
    await notifyRoles(ctx.orgId, ['ADMIN', 'MANAGER'], { type: 'lead.unassigned', priority: 'HIGH', title: `Lead sem consultor disponível: ${lead.name}`, body: 'Distribua manualmente.', link: `/leads/${lead.id}`, entityType: 'Lead', entityId: lead.id });
    return { decision, consultant: null };
  }
  const inPj = eligible.filter((c) => c.pjId === pj.id);
  const pick = selectConsultant(inPj, 'EQUAL_SPLIT', await nextPointer(ctx.orgId, `pj:${pj.id}`))!;
  steps.push({ step: 'Método: divisão igual', detail: `${pj.code} → ${pick.name} · ${pick.periodLeads ?? 0} lead(s) no mês · carga ${pick.openLeads}/${pick.maxOpenLeads}`, ok: true });
  const rec = withRecommendation(steps, inPj, lead, pick.id);
  const decision = await applyAssignment(ctx, lead.id, pick.id, { method: 'EQUAL_SPLIT', ruleId: null, ruleName: label, steps, outcome: 'ASSIGNED', aiRecommendation: rec });
  return { decision, consultant: pick };
}

/** Atribuição manual (gestor/PJ) — também gera decisão registrada. */
export async function assignLeadManually(ctx: Ctx, leadId: string, consultantId: string) {
  assertCan(ctx, 'lead.assign');
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: leadId } });
  if (!lead) throw NotFound('Lead');
  const consultant = await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId } });
  if (!consultant) throw NotFound('Consultor');
  if (ctx.scope === 'PJ' && consultant.pjId !== ctx.pjId) throw BadRequest('Consultor de outra PJ.');
  const steps: Step[] = [{ step: 'Atribuição manual', detail: `${ctx.userName} atribuiu a ${consultant.name}`, ok: true }];
  return applyAssignment(ctx, leadId, consultantId, { method: 'MANUAL', ruleId: null, ruleName: null, steps, outcome: 'MANUAL' });
}

async function applyAssignment(
  ctx: Ctx,
  leadId: string,
  consultantId: string,
  d: { method: string; ruleId: string | null; ruleName: string | null; steps: Step[]; outcome: string; aiRecommendation?: RoutingRecommendation | null }
) {
  const consultant = await db.consultant.findUniqueOrThrow({ where: { id: consultantId }, include: { pj: true } });
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const previousConsultant = lead.consultantId;
  const keepStatus = ['IN_CONVERSATION', 'OPPORTUNITY'].includes(lead.status);

  const [decision] = await db.$transaction([
    db.routingDecision.create({
      data: {
        organizationId: ctx.orgId,
        leadId,
        ruleId: d.ruleId,
        ruleName: d.ruleName,
        pjId: consultant.pjId,
        consultantId,
        method: d.method,
        outcome: d.outcome,
        steps: d.steps as object,
        aiRecommendation: d.aiRecommendation ? (d.aiRecommendation as object) : undefined,
      },
    }),
    db.lead.update({
      where: { id: leadId },
      data: { consultantId, pjId: consultant.pjId, assignedAt: new Date(), ...(keepStatus ? {} : { status: 'ASSIGNED' }) },
    }),
    db.leadActivity.create({
      data: {
        organizationId: ctx.orgId,
        leadId,
        type: 'ASSIGNED',
        description: `${previousConsultant ? 'Redistribuído' : 'Distribuído'} para ${consultant.name} (${consultant.pj.code}) · ${d.method === 'MANUAL' ? 'manual' : d.ruleName}`,
        actorType: ctx.via === 'system' ? 'SYSTEM' : 'USER',
        actorId: ctx.userId,
        metadata: { method: d.method, ruleId: d.ruleId },
      },
    }),
    db.attributionEvent.create({ data: { organizationId: ctx.orgId, type: 'ASSIGNED', leadId, consultantId, campaignId: lead.campaignId } }),
  ]);

  // Conversas ativas do lead passam a ter o novo consultor como responsável.
  await db.conversation.updateMany({ where: { leadId, organizationId: ctx.orgId }, data: { assignedConsultantId: consultantId } });

  await audit(ctx, previousConsultant ? 'lead.transferred' : 'lead.assigned', { type: 'Lead', id: leadId }, { consultantId, pjId: consultant.pjId, method: d.method });
  await publish(ctx.orgId, 'lead.assigned', { leadId, consultantId, pjId: consultant.pjId, method: d.method, previousConsultantId: previousConsultant });
  await notifyConsultant(ctx.orgId, consultantId, {
    type: lead.temperature === 'QUENTE' ? 'lead.hot' : 'lead.assigned',
    priority: lead.temperature === 'QUENTE' ? 'HIGH' : 'NORMAL',
    title: lead.temperature === 'QUENTE' ? '🔥 Lead quente distribuído para você' : 'Novo lead distribuído para você',
    body: `${lead.name} · ${productLabel(lead.product)} · score ${lead.score}`,
    link: `/leads/${leadId}`,
    entityType: 'Lead',
    entityId: leadId,
  });
  return decision;
}

export async function listDecisions(ctx: Ctx, opts: { leadId?: string; take?: number } = {}) {
  assertCan(ctx, 'routing.read');
  return db.routingDecision.findMany({
    where: { organizationId: ctx.orgId, ...(opts.leadId ? { leadId: opts.leadId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 50,
  });
}

/** Lead da landing da PJ sem consultor disponível: avisa o(s) gestor(es) daquela PJ. */
async function notifyPjManagers(orgId: string, pjId: string, leadId: string, leadName: string) {
  await notifyRoles(orgId, ['PJ_MANAGER'], { type: 'lead.unassigned', priority: 'HIGH', title: `Lead da landing sem consultor disponível: ${leadName}`, body: 'Distribua manualmente para um consultor da PJ.', link: `/leads/${leadId}`, entityType: 'Lead', entityId: leadId }, { pjId });
}

/** AI Routing Assistant: registra a sugestão (e se a regra a seguiu) como passo auditável da decisão. */
function withRecommendation(steps: Step[], pool: Candidate[], lead: { product: string | null }, chosenId: string): RoutingRecommendation | null {
  const rec = recommendConsultant(pool, lead);
  if (!rec) return null;
  rec.followed = rec.consultantId === chosenId;
  steps.push({
    step: 'Sugestão do Assistente de Distribuição (sinal por regra)',
    detail: `${rec.consultantName} — ${rec.reason} · confiança ${rec.confidence}${rec.followed ? ' · seguida' : ' · a regra configurada escolheu outro consultor'}`,
    ok: true,
  });
  return rec;
}
