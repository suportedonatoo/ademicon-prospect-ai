import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { LOSS_CATEGORIES } from '../opportunities/health-engine';
import { INTENT_LABELS } from '../lead-intelligence/signal-detector';

// AI INSIGHTS (por regra) — padrões detectados em dados reais. Cada insight guarda os dados de
// origem (sourceData), o período e uma confiança derivada do tamanho da amostra. Se não há dado
// suficiente, o insight simplesmente não é gerado (nunca inventado).

const DAY = 86_400_000;
const confidenceFor = (n: number) => Math.round(Math.min(0.95, 0.5 + n / 200) * 100) / 100;
const weekKey = (d: Date) => `${d.getUTCFullYear()}-${Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / (7 * DAY))}`;

interface Draft {
  kind: string;
  key: string;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  sourceData: Record<string, unknown>;
  periodStart: Date;
  periodEnd: Date;
  sample: number;
}

export async function detectInsights(orgId: string, now = new Date()): Promise<Draft[]> {
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d60 = new Date(now.getTime() - 60 * DAY);
  const out: Draft[] = [];

  // 1) Qualificados sem follow-up
  const cutoff = new Date(now.getTime() - DAY);
  const noFollow = await db.lead.findMany({
    where: { organizationId: orgId, deletedAt: null, temperature: { in: ['MORNO', 'QUENTE'] }, status: { in: ['ASSIGNED', 'QUALIFIED'] }, assignedAt: { lt: cutoff }, tasks: { none: { status: 'OPEN' } }, activities: { none: { actorType: 'USER', createdAt: { gte: cutoff } } } },
    select: { id: true, temperature: true },
    take: 500,
  });
  if (noFollow.length >= 3) {
    const hot = noFollow.filter((l) => l.temperature === 'QUENTE').length;
    out.push({ kind: 'QUALIFIED_NO_FOLLOWUP', key: 'all', title: `${noFollow.length} leads qualificados sem follow-up`, description: `Leads mornos/quentes distribuídos há mais de 24h sem tarefa aberta nem atividade do consultor (${hot} quentes).`, severity: hot >= 3 ? 'HIGH' : 'MEDIUM', sourceData: { count: noFollow.length, hot, sampleLeadIds: noFollow.slice(0, 10).map((l) => l.id) }, periodStart: cutoff, periodEnd: now, sample: noFollow.length });
  }

  // 2) Oportunidades paradas
  const stalled = await db.opportunity.groupBy({ by: ['consultantId'], where: { organizationId: orgId, status: 'OPEN', health: 'STALLED' }, _count: { _all: true }, _sum: { value: true } });
  const stalledTotal = stalled.reduce((s, x) => s + x._count._all, 0);
  if (stalledTotal >= 3) {
    const value = stalled.reduce((s, x) => s + (x._sum.value ?? 0), 0);
    out.push({ kind: 'STALLED_OPPORTUNITIES', key: 'all', title: `${stalledTotal} oportunidades paradas`, description: `Somam R$ ${value.toLocaleString('pt-BR')} em carta de crédito sem atividade dentro do prazo esperado da etapa.`, severity: stalledTotal >= 10 ? 'HIGH' : 'MEDIUM', sourceData: { count: stalledTotal, value, byConsultant: stalled.map((s) => ({ consultantId: s.consultantId, count: s._count._all })) }, periodStart: d30, periodEnd: now, sample: stalledTotal });
  }

  // 3) Fontes com volume e baixa qualidade
  const bySource = await db.$queryRaw<{ source: string; leads: number; qualified: number }[]>`
    SELECT "source", COUNT(*)::int AS leads,
      COUNT(*) FILTER (WHERE "temperature" IN ('MORNO','QUENTE') OR "status" IN ('QUALIFIED','ASSIGNED','OPPORTUNITY','CONVERTED'))::int AS qualified
    FROM "Lead" WHERE "organizationId" = ${orgId} AND "deletedAt" IS NULL AND "createdAt" >= ${d30}
    GROUP BY 1`;
  const totalLeads = bySource.reduce((s, r) => s + r.leads, 0);
  const avgRate = totalLeads ? bySource.reduce((s, r) => s + r.qualified, 0) / totalLeads : 0;
  for (const r of bySource) {
    const rate = r.leads ? r.qualified / r.leads : 0;
    if (r.leads >= 20 && avgRate > 0 && rate < avgRate * 0.5) {
      out.push({ kind: 'LOW_QUALITY_SOURCE', key: r.source, title: `Fonte ${r.source}: muito volume, pouca qualificação`, description: `${r.leads} leads em 30 dias com ${(rate * 100).toFixed(0)}% qualificados (média da operação: ${(avgRate * 100).toFixed(0)}%).`, severity: 'MEDIUM', sourceData: { source: r.source, leads: r.leads, qualified: r.qualified, rate, avgRate }, periodStart: d30, periodEnd: now, sample: r.leads });
    }
  }

  // 4) Aumento de CPL por campanha (14d x 14d anteriores) — só com gasto real/sincronizado
  const d14 = new Date(now.getTime() - 14 * DAY);
  const d28 = new Date(now.getTime() - 28 * DAY);
  const cplRows = await db.$queryRaw<{ id: string; name: string; spendNow: number; spendPrev: number; leadsNow: number; leadsPrev: number }[]>`
    SELECT c."id", c."name",
      COALESCE((SELECT SUM(m."spend") FROM "CampaignMetric" m WHERE m."campaignId" = c."id" AND m."date" >= ${d14}), 0)::int AS "spendNow",
      COALESCE((SELECT SUM(m."spend") FROM "CampaignMetric" m WHERE m."campaignId" = c."id" AND m."date" >= ${d28} AND m."date" < ${d14}), 0)::int AS "spendPrev",
      (SELECT COUNT(*) FROM "Lead" l WHERE l."campaignId" = c."id" AND l."createdAt" >= ${d14})::int AS "leadsNow",
      (SELECT COUNT(*) FROM "Lead" l WHERE l."campaignId" = c."id" AND l."createdAt" >= ${d28} AND l."createdAt" < ${d14})::int AS "leadsPrev"
    FROM "Campaign" c WHERE c."organizationId" = ${orgId}`;
  for (const c of cplRows) {
    if (c.leadsNow < 10 || c.leadsPrev < 10 || !c.spendNow || !c.spendPrev) continue;
    const now_ = c.spendNow / c.leadsNow;
    const prev = c.spendPrev / c.leadsPrev;
    if (now_ >= prev * 1.3) {
      out.push({ kind: 'CPL_INCREASE', key: c.id, title: `CPL subiu ${Math.round((now_ / prev - 1) * 100)}% em "${c.name}"`, description: `CPL de R$ ${prev.toFixed(0)} para R$ ${now_.toFixed(0)} (14 dias x 14 dias anteriores). Avalie também a qualidade dos leads antes de pausar.`, severity: now_ >= prev * 1.6 ? 'HIGH' : 'MEDIUM', sourceData: c, periodStart: d28, periodEnd: now, sample: c.leadsNow + c.leadsPrev });
    }
  }

  // 5) Objeção recorrente
  const objections = await db.intentEvent.findMany({ where: { organizationId: orgId, type: 'OBJECTION', createdAt: { gte: d30 } }, select: { evidence: true } });
  const objCount = new Map<string, number>();
  for (const o of objections) {
    const k = o.evidence.split(':')[0].trim();
    objCount.set(k, (objCount.get(k) ?? 0) + 1);
  }
  const topObj = [...objCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topObj && topObj[1] >= 5) {
    out.push({ kind: 'RECURRING_OBJECTION', key: topObj[0], title: `Objeção recorrente: ${topObj[0]}`, description: `${topObj[1]} ocorrências em 30 dias. Revise o material de tratamento dessa objeção na Knowledge Base e treine a equipe.`, severity: topObj[1] >= 15 ? 'HIGH' : 'MEDIUM', sourceData: { objections: Object.fromEntries(objCount) }, periodStart: d30, periodEnd: now, sample: objections.length });
  }

  // 6) Perguntas sem resposta
  const gaps = await db.knowledgeGap.findMany({ where: { organizationId: orgId, status: 'OPEN', createdAt: { gte: d30 } }, select: { question: true }, take: 500 });
  if (gaps.length >= 5) {
    out.push({ kind: 'UNANSWERED_QUESTIONS', key: 'gaps', title: `${gaps.length} perguntas sem resposta na base`, description: 'A IA encaminhou essas dúvidas por falta de conteúdo aprovado. Publicar respostas reduz handoffs desnecessários.', severity: gaps.length >= 20 ? 'HIGH' : 'MEDIUM', sourceData: { count: gaps.length, examples: gaps.slice(0, 5).map((g) => g.question.slice(0, 140)) }, periodStart: d30, periodEnd: now, sample: gaps.length });
  }

  // 7) Queda de conversão lead → oportunidade (30d x 30d anteriores)
  const [leadsNow, leadsPrev, oppsNow, oppsPrev] = await Promise.all([
    db.lead.count({ where: { organizationId: orgId, deletedAt: null, createdAt: { gte: d30 } } }),
    db.lead.count({ where: { organizationId: orgId, deletedAt: null, createdAt: { gte: d60, lt: d30 } } }),
    db.opportunity.count({ where: { organizationId: orgId, createdAt: { gte: d30 } } }),
    db.opportunity.count({ where: { organizationId: orgId, createdAt: { gte: d60, lt: d30 } } }),
  ]);
  if (leadsNow >= 50 && leadsPrev >= 50 && oppsPrev >= 10) {
    const rNow = oppsNow / leadsNow;
    const rPrev = oppsPrev / leadsPrev;
    if (rNow <= rPrev * 0.75) {
      out.push({ kind: 'CONVERSION_DROP', key: 'lead_to_opp', title: `Conversão lead → oportunidade caiu ${Math.round((1 - rNow / rPrev) * 100)}%`, description: `${(rNow * 100).toFixed(1)}% nos últimos 30 dias contra ${(rPrev * 100).toFixed(1)}% nos 30 anteriores.`, severity: 'HIGH', sourceData: { leadsNow, leadsPrev, oppsNow, oppsPrev }, periodStart: d60, periodEnd: now, sample: leadsNow + leadsPrev });
    }
  }

  // 8) Padrão de perda
  const losses = await db.lossRecord.groupBy({ by: ['category'], where: { organizationId: orgId, createdAt: { gte: d60 } }, _count: { _all: true } });
  const totalLoss = losses.reduce((s, l) => s + l._count._all, 0);
  const topLoss = [...losses].sort((a, b) => b._count._all - a._count._all)[0];
  if (topLoss && totalLoss >= 5 && topLoss._count._all / totalLoss >= 0.3) {
    const label = LOSS_CATEGORIES[topLoss.category as keyof typeof LOSS_CATEGORIES] ?? topLoss.category;
    out.push({ kind: 'LOSS_PATTERN', key: topLoss.category, title: `${Math.round((topLoss._count._all / totalLoss) * 100)}% das perdas: ${label}`, description: `${topLoss._count._all} de ${totalLoss} perdas nos últimos 60 dias têm a mesma causa.`, severity: 'MEDIUM', sourceData: { byCategory: Object.fromEntries(losses.map((l) => [l.category, l._count._all])) }, periodStart: d60, periodEnd: now, sample: totalLoss });
  }

  // 9) Intenções de alto valor sem resposta humana (sinal de oportunidade perdida)
  const hotIntents = await db.intentEvent.groupBy({ by: ['type'], where: { organizationId: orgId, createdAt: { gte: d30 }, type: { in: ['CALL_REQUEST', 'CONTACT_REQUEST', 'PURCHASE_INTENT'] } }, _count: { _all: true } });
  const hotTotal = hotIntents.reduce((s, h) => s + h._count._all, 0);
  if (hotTotal >= 10) {
    out.push({ kind: 'HIGH_INTENT_VOLUME', key: 'intents', title: `${hotTotal} sinais de alta intenção em 30 dias`, description: hotIntents.map((h) => `${INTENT_LABELS[h.type as keyof typeof INTENT_LABELS] ?? h.type}: ${h._count._all}`).join(' · '), severity: 'LOW', sourceData: Object.fromEntries(hotIntents.map((h) => [h.type, h._count._all])), periodStart: d30, periodEnd: now, sample: hotTotal });
  }
  return out;
}

export async function generateInsights(orgId: string, now = new Date()) {
  const drafts = await detectInsights(orgId, now);
  const wk = weekKey(now);
  for (const d of drafts) {
    const fingerprint = `${d.kind}:${d.key}:${wk}`;
    await db.aIInsight.upsert({
      where: { organizationId_fingerprint: { organizationId: orgId, fingerprint } },
      create: { organizationId: orgId, kind: d.kind, title: d.title, description: d.description, severity: d.severity, sourceData: d.sourceData as object, periodStart: d.periodStart, periodEnd: d.periodEnd, confidence: confidenceFor(d.sample), method: 'RULE', fingerprint },
      update: { title: d.title, description: d.description, severity: d.severity, sourceData: d.sourceData as object, periodStart: d.periodStart, periodEnd: d.periodEnd, confidence: confidenceFor(d.sample) },
    });
  }
  return { generated: drafts.length };
}

export async function listInsights(ctx: Ctx, status = 'OPEN') {
  assertCan(ctx, 'analytics.read');
  return db.aIInsight.findMany({ where: { organizationId: ctx.orgId, status }, orderBy: [{ createdAt: 'desc' }], take: 100 });
}

export async function setInsightStatus(ctx: Ctx, id: string, status: 'ACKNOWLEDGED' | 'DISMISSED' | 'OPEN') {
  assertCan(ctx, 'analytics.read');
  const i = await db.aIInsight.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!i) throw NotFound('Insight');
  await db.aIInsight.update({ where: { id }, data: { status } });
  await audit(ctx, 'insight.changed', { type: 'AIInsight', id }, { status });
  return { ok: true };
}
