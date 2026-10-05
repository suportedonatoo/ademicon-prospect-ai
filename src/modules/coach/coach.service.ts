import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { leadScope } from '../leads/scope';
import { LOSS_CATEGORIES } from '../opportunities/health-engine';

// AI SALES COACH — indicadores operacionais por consultor + sugestões de treinamento.
// Uso: desenvolvimento da equipe. NÃO é ranking nem base para decisão trabalhista automatizada;
// os números mostram contexto (volume, carteira) ao lado de cada taxa.

const DAY = 86_400_000;

export async function salesCoach(ctx: Ctx, from: Date, to: Date) {
  assertCan(ctx, 'consultant.read');
  const consultants = await db.consultant.findMany({
    where: { organizationId: ctx.orgId, active: true, ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}), ...(ctx.scope === 'OWN' ? { id: ctx.consultantId ?? '__none__' } : {}) },
    select: { id: true, name: true, pj: { select: { code: true } } },
  });
  if (!consultants.length) return { rows: [], note: '' };
  const ids = consultants.map((c) => c.id);
  const rows = await db.$queryRaw<{ consultantId: string; leads: number; firstResponseMin: number | null; abandoned: number; followupsDone: number; followupsOverdue: number; idleOpps: number; openOpps: number; won: number; lost: number }[]>`
    SELECT c."id" AS "consultantId",
      (SELECT COUNT(*) FROM "Lead" l WHERE l."consultantId" = c."id" AND l."assignedAt" BETWEEN ${from} AND ${to})::int AS leads,
      (SELECT AVG(EXTRACT(EPOCH FROM (fm."first" - l."assignedAt")) / 60) FROM "Lead" l
         JOIN LATERAL (SELECT MIN(m."createdAt") AS "first" FROM "Message" m JOIN "Conversation" cv ON cv."id" = m."conversationId"
                       WHERE cv."leadId" = l."id" AND m."senderType" = 'HUMAN' AND m."createdAt" >= l."assignedAt") fm ON true
        WHERE l."consultantId" = c."id" AND l."assignedAt" BETWEEN ${from} AND ${to} AND fm."first" IS NOT NULL)::float AS "firstResponseMin",
      (SELECT COUNT(*) FROM "Conversation" cv WHERE cv."assignedConsultantId" = c."id" AND cv."mode" = 'HUMAN' AND cv."status" = 'OPEN'
         AND (SELECT m."direction" FROM "Message" m WHERE m."conversationId" = cv."id" ORDER BY m."createdAt" DESC LIMIT 1) = 'INBOUND'
         AND cv."lastMessageAt" < now() - interval '24 hours')::int AS abandoned,
      (SELECT COUNT(*) FROM "Task" t WHERE t."consultantId" = c."id" AND t."status" = 'DONE' AND t."completedAt" BETWEEN ${from} AND ${to})::int AS "followupsDone",
      (SELECT COUNT(*) FROM "Task" t WHERE t."consultantId" = c."id" AND t."status" = 'OPEN' AND t."dueAt" < now())::int AS "followupsOverdue",
      (SELECT COUNT(*) FROM "Opportunity" o WHERE o."consultantId" = c."id" AND o."status" = 'OPEN' AND COALESCE(o."lastActivityAt", o."updatedAt") < now() - interval '7 days')::int AS "idleOpps",
      (SELECT COUNT(*) FROM "Opportunity" o WHERE o."consultantId" = c."id" AND o."status" = 'OPEN')::int AS "openOpps",
      (SELECT COUNT(*) FROM "Opportunity" o WHERE o."consultantId" = c."id" AND o."status" = 'WON' AND o."closedAt" BETWEEN ${from} AND ${to})::int AS won,
      (SELECT COUNT(*) FROM "Opportunity" o WHERE o."consultantId" = c."id" AND o."status" = 'LOST' AND o."closedAt" BETWEEN ${from} AND ${to})::int AS lost
    FROM "Consultant" c WHERE c."id" IN (${Prisma.join(ids)})`;
  const [lossStages, objections, playbookRuns] = await Promise.all([
    db.lossRecord.groupBy({ by: ['consultantId', 'stageKey', 'category'], where: { organizationId: ctx.orgId, consultantId: { in: ids }, createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
    db.$queryRaw<{ consultantId: string; objection: string; n: number }[]>`
      SELECT l."consultantId", unnest(m."objections") AS objection, COUNT(*)::int AS n
      FROM "LeadMemory" m JOIN "Lead" l ON l."id" = m."leadId"
      WHERE l."consultantId" IN (${Prisma.join(ids)}) AND l."assignedAt" BETWEEN ${from} AND ${to}
      GROUP BY 1, 2 ORDER BY n DESC`,
    db.$queryRaw<{ consultantId: string; completed: number; cancelled: number }[]>`
      SELECT l."consultantId", COUNT(*) FILTER (WHERE r."status" = 'COMPLETED')::int AS completed, COUNT(*) FILTER (WHERE r."status" = 'CANCELLED')::int AS cancelled
      FROM "PlaybookRun" r JOIN "Lead" l ON l."id" = r."leadId" WHERE l."consultantId" IN (${Prisma.join(ids)}) AND r."startedAt" BETWEEN ${from} AND ${to} GROUP BY 1`,
  ]);
  const out = consultants.map((c) => {
    const r = rows.find((x) => x.consultantId === c.id)!;
    const losses = lossStages.filter((l) => l.consultantId === c.id);
    const topLoss = [...losses].sort((a, b) => b._count._all - a._count._all)[0];
    const objs = objections.filter((o) => o.consultantId === c.id).slice(0, 3);
    const pb = playbookRuns.find((p) => p.consultantId === c.id);
    const suggestions: { area: string; text: string; evidence: string }[] = [];
    if (r.firstResponseMin != null && r.firstResponseMin > 60) suggestions.push({ area: 'Tempo de resposta', text: 'Priorizar o primeiro contato dos leads recém-distribuídos (ative notificações no celular).', evidence: `1ª resposta média de ${Math.round(r.firstResponseMin)} min` });
    if (r.abandoned > 0) suggestions.push({ area: 'Conversas', text: 'Retomar conversas em que o cliente escreveu e ficou sem resposta.', evidence: `${r.abandoned} conversa(s) sem resposta há 24h+` });
    if (r.followupsOverdue > 2) suggestions.push({ area: 'Follow-up', text: 'Revisar a agenda de tarefas e reagendar o que não será feito.', evidence: `${r.followupsOverdue} tarefa(s) vencida(s)` });
    if (r.idleOpps > 0) suggestions.push({ area: 'Pipeline', text: 'Definir próximo passo para oportunidades paradas.', evidence: `${r.idleOpps} de ${r.openOpps} oportunidade(s) sem atividade há 7+ dias` });
    if (topLoss && topLoss._count._all >= 2) suggestions.push({ area: 'Perdas', text: `Treinar a etapa ${topLoss.stageKey ?? '—'}: perdas recorrentes por "${LOSS_CATEGORIES[topLoss.category as keyof typeof LOSS_CATEGORIES] ?? topLoss.category}".`, evidence: `${topLoss._count._all} perda(s) no período` });
    if (objs[0] && objs[0].n >= 3) suggestions.push({ area: 'Objeções', text: `Praticar o tratamento de "${objs[0].objection}" com o material da Knowledge Base.`, evidence: `${objs[0].n} ocorrência(s)` });
    return {
      id: c.id,
      name: c.name,
      pj: c.pj.code,
      leads: r.leads,
      firstResponseMin: r.firstResponseMin != null ? Math.round(r.firstResponseMin) : null,
      abandoned: r.abandoned,
      followupsDone: r.followupsDone,
      followupsOverdue: r.followupsOverdue,
      openOpps: r.openOpps,
      idleOpps: r.idleOpps,
      won: r.won,
      lost: r.lost,
      topObjections: objs.map((o) => ({ label: o.objection, count: o.n })),
      lossStages: losses.map((l) => ({ stage: l.stageKey, category: l.category, count: l._count._all })),
      playbook: pb ? { completed: pb.completed, cancelled: pb.cancelled } : null,
      suggestions,
    };
  });
  return { rows: out, note: 'Indicadores para desenvolvimento da equipe — leia sempre com o contexto (carteira, região, produto). Não é ranking nem avaliação automática.' };
}

/** CUSTOMER JOURNEY — linha do tempo única: origem → landing → simulação → lead → conversa → consultor → oportunidade → conversão. */
export async function customerJourney(ctx: Ctx, leadId: string) {
  assertCan(ctx, 'lead.read');
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: leadId }, select: { id: true, name: true, source: true, createdAt: true, campaign: { select: { name: true } } } });
  if (!lead) throw NotFound('Lead');
  const [sessions, attrEvents, activities, sims, convs, opps] = await Promise.all([
    db.attributionSession.findMany({ where: { leadId }, orderBy: { firstSeenAt: 'asc' } }),
    // Eventos do lead + os da sessão anônima antes da identificação (visita, simulação iniciada).
    db.attributionEvent.findMany({ where: { OR: [{ leadId }, { session: { leadId } }] }, orderBy: { createdAt: 'asc' } }),
    db.leadActivity.findMany({ where: { leadId, type: { in: ['ASSIGNED', 'HANDOFF', 'STATUS_CHANGED', 'MERGED', 'OPPORTUNITY', 'PROACTIVE_CONTACT'] } }, orderBy: { createdAt: 'asc' } }),
    db.simulation.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, product: true, value: true, channel: true } }),
    db.conversation.findMany({ where: { leadId }, select: { id: true, channel: true, createdAt: true, messages: { where: { senderType: { in: ['LEAD', 'AI', 'HUMAN'] } }, orderBy: { createdAt: 'asc' }, select: { senderType: true, createdAt: true, senderName: true } } } }),
    db.opportunity.findMany({ where: { leadId }, include: { activities: { orderBy: { createdAt: 'asc' } }, consultant: { select: { name: true } } } }),
  ]);
  type Step = { at: Date; stage: string; label: string; channel: string | null; source: string | null; campaign: string | null; actor: string | null; entity: string };
  const steps: Step[] = [];
  for (const s of sessions) steps.push({ at: s.firstSeenAt, stage: 'FIRST_TOUCH', label: `Primeiro contato (${s.channel ?? s.source ?? 'direto'})`, channel: s.channel, source: s.source, campaign: s.campaign, actor: null, entity: 'AttributionSession' });
  for (const e of attrEvents) if (['PAGE_VIEW', 'SIMULATION_STARTED', 'WHATSAPP_CLICK', 'PHONE_CLICK', 'QUALIFIED', 'CONVERSION'].includes(e.type)) steps.push({ at: e.createdAt, stage: e.type === 'PAGE_VIEW' ? 'LANDING' : e.type === 'CONVERSION' ? 'CONVERSION' : e.type === 'QUALIFIED' ? 'QUALIFICATION' : 'LANDING', label: { PAGE_VIEW: 'Visitou a landing', SIMULATION_STARTED: 'Iniciou simulação', WHATSAPP_CLICK: 'Clicou no WhatsApp', PHONE_CLICK: 'Clicou para ligar', QUALIFIED: 'Qualificado', CONVERSION: 'Conversão' }[e.type] ?? e.type, channel: null, source: null, campaign: null, actor: null, entity: 'AttributionEvent' });
  for (const s of sims) steps.push({ at: s.createdAt, stage: 'SIMULATOR', label: `Simulação ${s.product} · R$ ${s.value.toLocaleString('pt-BR')}`, channel: s.channel, source: null, campaign: null, actor: null, entity: 'Simulation' });
  steps.push({ at: lead.createdAt, stage: 'LEAD', label: `Lead criado (${lead.source})`, channel: null, source: lead.source, campaign: lead.campaign?.name ?? null, actor: null, entity: 'Lead' });
  for (const c of convs) {
    const firstLead = c.messages.find((m) => m.senderType === 'LEAD');
    const firstAi = c.messages.find((m) => m.senderType === 'AI');
    const firstHuman = c.messages.find((m) => m.senderType === 'HUMAN');
    if (firstAi) steps.push({ at: firstAi.createdAt, stage: 'BOT', label: 'Assistente iniciou o atendimento', channel: c.channel, source: null, campaign: null, actor: 'IA', entity: 'Conversation' });
    if (firstLead) steps.push({ at: firstLead.createdAt, stage: 'WHATSAPP', label: 'Cliente respondeu', channel: c.channel, source: null, campaign: null, actor: lead.name, entity: 'Conversation' });
    if (firstHuman) steps.push({ at: firstHuman.createdAt, stage: 'CONSULTANT', label: `Consultor respondeu${firstHuman.senderName ? ` (${firstHuman.senderName})` : ''}`, channel: c.channel, source: null, campaign: null, actor: firstHuman.senderName, entity: 'Conversation' });
  }
  for (const a of activities) steps.push({ at: a.createdAt, stage: a.type === 'ASSIGNED' ? 'CONSULTANT' : a.type === 'HANDOFF' ? 'QUALIFICATION' : a.type === 'OPPORTUNITY' ? 'OPPORTUNITY' : 'LEAD', label: a.description, channel: null, source: null, campaign: null, actor: a.actorType, entity: 'LeadActivity' });
  for (const o of opps) {
    for (const act of o.activities) if (['CREATED', 'STAGE_CHANGED', 'CLOSED_WON', 'CLOSED_LOST'].includes(act.type)) steps.push({ at: act.createdAt, stage: act.type === 'CLOSED_WON' ? 'CONVERSION' : act.toStage === 'PROPOSTA' ? 'PROPOSAL' : 'OPPORTUNITY', label: `#${o.code}: ${act.description}`, channel: null, source: null, campaign: null, actor: o.consultant?.name ?? null, entity: 'Opportunity' });
  }
  steps.sort((a, b) => a.at.getTime() - b.at.getTime());
  const ORDER = ['FIRST_TOUCH', 'LANDING', 'SIMULATOR', 'LEAD', 'WHATSAPP', 'BOT', 'QUALIFICATION', 'CONSULTANT', 'OPPORTUNITY', 'PROPOSAL', 'CONVERSION'];
  const reached = new Set(steps.map((s) => s.stage));
  const lastIdx = Math.max(...[...reached].map((s) => ORDER.indexOf(s)));
  return {
    lead: { id: lead.id, name: lead.name },
    stages: ORDER.map((k, i) => ({ key: k, reached: reached.has(k), current: i === lastIdx })),
    stoppedAt: ORDER[lastIdx] ?? 'LEAD',
    daysSinceLastStep: steps.length ? Math.floor((Date.now() - steps[steps.length - 1].at.getTime()) / DAY) : null,
    steps,
  };
}
