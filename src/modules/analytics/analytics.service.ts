import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { leadFilterWhere, leadSqlWhere, oppFilterWhere, type AnalyticsFilters } from './filters';
import { QUALIFIED_LEAD_WHERE } from '../leads/catalog';

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const QUALIFIED_WHERE = QUALIFIED_LEAD_WHERE;
const PROPOSAL_STAGES = ['PROPOSTA', 'NEGOCIACAO'];

/** Dashboard executivo. */
export async function executiveDashboard(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const leadWhere = leadFilterWhere(ctx, f);
  const oppWhere = oppFilterWhere(ctx, f);
  const todayStart = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00-03:00');

  const [leadsToday, leads, qualified, assigned, opportunities, proposals, conversions, wonValue, bySource, byProduct, avgResponse, series] = await Promise.all([
    db.lead.count({ where: { ...leadFilterWhere(ctx, f, 'none'), createdAt: { gte: todayStart } } }),
    db.lead.count({ where: leadWhere }),
    db.lead.count({ where: { ...leadWhere, ...QUALIFIED_WHERE } }),
    db.lead.count({ where: { ...leadWhere, consultantId: { not: null } } }),
    db.opportunity.count({ where: oppWhere }),
    db.opportunity.count({ where: { ...oppWhere, OR: [{ stage: { key: { in: PROPOSAL_STAGES } } }, { status: 'WON' }] } }),
    db.opportunity.count({ where: { ...oppFilterWhere(ctx, f, 'closedAt'), status: 'WON' } }),
    db.opportunity.aggregate({ where: { ...oppFilterWhere(ctx, f, 'closedAt'), status: 'WON' }, _sum: { value: true } }),
    db.lead.groupBy({ by: ['source'], where: leadWhere, _count: { _all: true } }),
    db.lead.groupBy({ by: ['product'], where: leadWhere, _count: { _all: true } }),
    // Tempo médio de atendimento: criação do lead → primeira mensagem enviada (IA ou consultor).
    db.$queryRaw<{ minutes: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (fm."first" - l."createdAt")) / 60)::float AS minutes
      FROM "Lead" l
      JOIN (
        SELECT c."leadId", MIN(m."createdAt") AS "first"
        FROM "Message" m JOIN "Conversation" c ON c."id" = m."conversationId"
        WHERE m."direction" = 'OUTBOUND' AND m."senderType" IN ('AI','HUMAN')
        GROUP BY c."leadId"
      ) fm ON fm."leadId" = l."id"
      WHERE ${leadSqlWhere(ctx, f)} AND fm."first" >= l."createdAt"`,
    db.$queryRaw<{ day: Date; leads: number; qualified: number }[]>`
      SELECT date_trunc('day', l."createdAt" AT TIME ZONE 'America/Sao_Paulo') AS day,
             COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE l."temperature" IN ('MORNO','QUENTE') OR l."status" IN ('QUALIFIED','ASSIGNED','OPPORTUNITY','CONVERTED'))::int AS qualified
      FROM "Lead" l WHERE ${leadSqlWhere(ctx, f)}
      GROUP BY 1 ORDER BY 1`,
  ]);

  return {
    kpis: {
      leadsToday,
      leads,
      qualified,
      assigned,
      opportunities,
      proposals,
      conversions,
      wonValue: wonValue._sum.value ?? 0,
      qualificationRate: pct(qualified, leads),
      conversionRate: pct(conversions, leads),
      avgResponseMinutes: avgResponse[0]?.minutes ?? null,
    },
    funnel: [
      { label: 'Leads', value: leads },
      { label: 'Qualificados', value: qualified },
      { label: 'Oportunidades', value: opportunities },
      { label: 'Propostas', value: proposals },
      { label: 'Conversões', value: conversions },
    ],
    bySource: bySource.map((s) => ({ key: s.source, value: s._count._all })).sort((a, b) => b.value - a.value),
    byProduct: byProduct.map((p) => ({ key: p.product ?? 'NAO_INFORMADO', value: p._count._all })).sort((a, b) => b.value - a.value),
    series: series.map((s) => ({ day: s.day, leads: s.leads, qualified: s.qualified })),
  };
}

/** Performance por PJ e por consultor (uma consulta agregada por dimensão). */
export async function performance(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const leadWhere = leadFilterWhere(ctx, f);
  const oppWhere = oppFilterWhere(ctx, f);
  const [pjs, consultants, leadsByPj, qualByPj, oppsByPj, wonByPj, leadsByC, oppsByC, wonByC] = await Promise.all([
    db.pJ.findMany({ where: { organizationId: ctx.orgId, ...(ctx.scope !== 'ORG' && ctx.pjId ? { id: ctx.pjId } : {}) }, select: { id: true, code: true, name: true, city: true } }),
    db.consultant.findMany({ where: { organizationId: ctx.orgId, ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '' } : {}), ...(ctx.scope === 'OWN' ? { id: ctx.consultantId ?? '' } : {}) }, select: { id: true, name: true, pj: { select: { code: true } } } }),
    db.lead.groupBy({ by: ['pjId'], where: leadWhere, _count: { _all: true } }),
    db.lead.groupBy({ by: ['pjId'], where: { ...leadWhere, ...QUALIFIED_WHERE }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['pjId'], where: oppWhere, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['pjId'], where: { ...oppFilterWhere(ctx, f, 'closedAt'), status: 'WON' }, _count: { _all: true }, _sum: { value: true } }),
    db.lead.groupBy({ by: ['consultantId'], where: leadWhere, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['consultantId'], where: oppWhere, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['consultantId'], where: { ...oppFilterWhere(ctx, f, 'closedAt'), status: 'WON' }, _count: { _all: true }, _sum: { value: true } }),
  ]);
  const byPj = pjs
    .map((p) => {
      const leads = leadsByPj.find((x) => x.pjId === p.id)?._count._all ?? 0;
      const won = wonByPj.find((x) => x.pjId === p.id);
      return {
        id: p.id,
        label: `${p.code} · ${p.city}`,
        name: p.name,
        leads,
        qualified: qualByPj.find((x) => x.pjId === p.id)?._count._all ?? 0,
        opportunities: oppsByPj.find((x) => x.pjId === p.id)?._count._all ?? 0,
        conversions: won?._count._all ?? 0,
        value: won?._sum.value ?? 0,
        conversionRate: pct(won?._count._all ?? 0, leads),
      };
    })
    .sort((a, b) => b.leads - a.leads);
  const byConsultant = consultants
    .map((c) => {
      const leads = leadsByC.find((x) => x.consultantId === c.id)?._count._all ?? 0;
      const won = wonByC.find((x) => x.consultantId === c.id);
      return {
        id: c.id,
        label: c.name,
        pj: c.pj.code,
        leads,
        opportunities: oppsByC.find((x) => x.consultantId === c.id)?._count._all ?? 0,
        conversions: won?._count._all ?? 0,
        value: won?._sum.value ?? 0,
        conversionRate: pct(won?._count._all ?? 0, leads),
      };
    })
    .sort((a, b) => b.conversions - a.conversions || b.leads - a.leads);
  return { byPj, byConsultant };
}

/** Oportunidades por etapa do pipeline. */
export async function opportunitiesByStage(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const [stages, groups] = await Promise.all([
    db.pipelineStage.findMany({ where: { organizationId: ctx.orgId, pipeline: { isDefault: true } }, orderBy: { order: 'asc' } }),
    db.opportunity.groupBy({ by: ['stageId'], where: { ...oppFilterWhere(ctx, f), createdAt: undefined }, _count: { _all: true }, _sum: { value: true } }),
  ]);
  return stages.map((s) => ({ key: s.key, label: s.name, value: groups.find((g) => g.stageId === s.id)?._count._all ?? 0, total: groups.find((g) => g.stageId === s.id)?._sum.value ?? 0 }));
}

/** Analytics de Marketing: investimento → cliques → leads → qualificados. */
export async function marketingAnalytics(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const campaigns = await db.campaign.findMany({ where: { organizationId: ctx.orgId, ...(f.campaignId ? { id: f.campaignId } : {}), ...(f.product ? { product: f.product } : {}) }, select: { id: true, name: true, source: true, budget: true, status: true } });
  const ids = campaigns.map((c) => c.id);
  const leadWhere = leadFilterWhere(ctx, f);
  const [metrics, leads, qualified] = await Promise.all([
    db.campaignMetric.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, date: { gte: f.from, lte: f.to } }, _sum: { impressions: true, clicks: true, spend: true } }),
    db.lead.groupBy({ by: ['campaignId'], where: { ...leadWhere, campaignId: { in: ids } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['campaignId'], where: { ...leadWhere, campaignId: { in: ids }, ...QUALIFIED_WHERE }, _count: { _all: true } }),
  ]);
  const rows = campaigns.map((c) => {
    const m = metrics.find((x) => x.campaignId === c.id)?._sum;
    const spend = m?.spend ?? 0;
    const l = leads.find((x) => x.campaignId === c.id)?._count._all ?? 0;
    const q = qualified.find((x) => x.campaignId === c.id)?._count._all ?? 0;
    const impressions = m?.impressions ?? 0;
    const clicks = m?.clicks ?? 0;
    return { id: c.id, name: c.name, source: c.source, status: c.status, spend, impressions, clicks, ctr: pct(clicks, impressions), cpc: clicks ? spend / clicks : null, leads: l, cpl: l ? spend / l : null, qualified: q, cpql: q ? spend / q : null };
  });
  const totals = rows.reduce(
    (t, r) => ({ spend: t.spend + r.spend, impressions: t.impressions + r.impressions, clicks: t.clicks + r.clicks, leads: t.leads + r.leads, qualified: t.qualified + r.qualified }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, qualified: 0 }
  );
  return {
    rows: rows.sort((a, b) => b.spend - a.spend),
    totals: { ...totals, ctr: pct(totals.clicks, totals.impressions), cpc: totals.clicks ? totals.spend / totals.clicks : null, cpl: totals.leads ? totals.spend / totals.leads : null, cpql: totals.qualified ? totals.spend / totals.qualified : null },
  };
}

/** Analytics Comercial: Leads → Contato → Respostas → Simulações → Oportunidades → Propostas → Fechamentos. */
export async function commercialAnalytics(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const w = leadSqlWhere(ctx, f);
  const [row] = await db.$queryRaw<{ leads: number; contacted: number; responded: number; simulated: number }[]>`
    SELECT COUNT(*)::int AS leads,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Conversation" c JOIN "Message" m ON m."conversationId" = c."id" WHERE c."leadId" = l."id" AND m."direction" = 'OUTBOUND' AND m."senderType" IN ('AI','HUMAN')))::int AS contacted,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Conversation" c JOIN "Message" m ON m."conversationId" = c."id" WHERE c."leadId" = l."id" AND m."direction" = 'INBOUND'))::int AS responded,
      COUNT(*) FILTER (WHERE (l."signals"->>'simulationStarted')::boolean IS TRUE)::int AS simulated
    FROM "Lead" l WHERE ${w}`;
  const oppWhere = oppFilterWhere(ctx, f);
  const [opportunities, proposals, closings] = await Promise.all([
    db.opportunity.count({ where: oppWhere }),
    db.opportunity.count({ where: { ...oppWhere, OR: [{ stage: { key: { in: PROPOSAL_STAGES } } }, { status: 'WON' }] } }),
    db.opportunity.count({ where: { ...oppFilterWhere(ctx, f, 'closedAt'), status: 'WON' } }),
  ]);
  return [
    { label: 'Leads', value: row?.leads ?? 0 },
    { label: 'Contatados', value: row?.contacted ?? 0 },
    { label: 'Responderam', value: row?.responded ?? 0 },
    { label: 'Simularam', value: row?.simulated ?? 0 },
    { label: 'Oportunidades', value: opportunities },
    { label: 'Propostas', value: proposals },
    { label: 'Fechamentos', value: closings },
  ];
}

/** Gestão: leads por região, produto, origem e campanha (com conversões). */
export async function managementBreakdown(ctx: Ctx, f: AnalyticsFilters, dim: 'region' | 'product' | 'source' | 'campaignId') {
  assertCan(ctx, 'analytics.read');
  const col = Prisma.raw(`l."${dim}"`);
  const rows = await db.$queryRaw<{ key: string | null; leads: number; qualified: number; opportunities: number; conversions: number }[]>`
    SELECT ${col} AS key,
      COUNT(DISTINCT l."id")::int AS leads,
      COUNT(DISTINCT l."id") FILTER (WHERE l."temperature" IN ('MORNO','QUENTE') OR l."status" IN ('QUALIFIED','ASSIGNED','OPPORTUNITY','CONVERTED'))::int AS qualified,
      COUNT(DISTINCT o."id")::int AS opportunities,
      COUNT(DISTINCT o."id") FILTER (WHERE o."status" = 'WON')::int AS conversions
    FROM "Lead" l LEFT JOIN "Opportunity" o ON o."leadId" = l."id"
    WHERE ${leadSqlWhere(ctx, f)}
    GROUP BY 1 ORDER BY leads DESC LIMIT 20`;
  if (dim === 'campaignId') {
    const names = await db.campaign.findMany({ where: { id: { in: rows.map((r) => r.key).filter(Boolean) as string[] } }, select: { id: true, name: true } });
    return rows.map((r) => ({ ...r, key: names.find((n) => n.id === r.key)?.name ?? 'Sem campanha' }));
  }
  return rows;
}

/** ROI: CPL, CPQL, CPO e CAC por campanha. Custo = gasto sincronizado; sem métricas, usa o orçamento configurado. */
export async function roiReport(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'roi.read');
  const campaigns = await db.campaign.findMany({ where: { organizationId: ctx.orgId, ...(f.campaignId ? { id: f.campaignId } : {}) }, select: { id: true, name: true, source: true, budget: true } });
  const ids = campaigns.map((c) => c.id);
  const leadWhere = { ...leadFilterWhere(ctx, f), campaignId: { in: ids } };
  const [spend, leads, qualified, opps, won] = await Promise.all([
    db.campaignMetric.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, date: { gte: f.from, lte: f.to } }, _sum: { spend: true } }),
    db.lead.groupBy({ by: ['campaignId'], where: leadWhere, _count: { _all: true } }),
    db.lead.groupBy({ by: ['campaignId'], where: { ...leadWhere, ...QUALIFIED_WHERE }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['campaignId'], where: { ...oppFilterWhere(ctx, f), campaignId: { in: ids } }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['campaignId'], where: { ...oppFilterWhere(ctx, f, 'closedAt'), campaignId: { in: ids }, status: 'WON' }, _count: { _all: true }, _sum: { value: true } }),
  ]);
  const rows = campaigns.map((c) => {
    const synced = spend.find((s) => s.campaignId === c.id)?._sum.spend;
    const cost = synced ?? c.budget;
    const l = leads.find((x) => x.campaignId === c.id)?._count._all ?? 0;
    const q = qualified.find((x) => x.campaignId === c.id)?._count._all ?? 0;
    const o = opps.find((x) => x.campaignId === c.id)?._count._all ?? 0;
    const w = won.find((x) => x.campaignId === c.id);
    const conv = w?._count._all ?? 0;
    return {
      id: c.id,
      name: c.name,
      source: c.source,
      cost,
      costBasis: synced != null ? 'Gasto sincronizado' : 'Orçamento configurado',
      leads: l,
      qualified: q,
      opportunities: o,
      conversions: conv,
      convertedVolume: w?._sum.value ?? 0,
      cpl: l ? cost / l : null,
      cpql: q ? cost / q : null,
      cpo: o ? cost / o : null,
      cac: conv ? cost / conv : null,
    };
  });
  const t = rows.reduce((a, r) => ({ cost: a.cost + r.cost, leads: a.leads + r.leads, qualified: a.qualified + r.qualified, opportunities: a.opportunities + r.opportunities, conversions: a.conversions + r.conversions, convertedVolume: a.convertedVolume + r.convertedVolume }), { cost: 0, leads: 0, qualified: 0, opportunities: 0, conversions: 0, convertedVolume: 0 });
  return {
    rows: rows.sort((a, b) => b.cost - a.cost),
    totals: { ...t, cpl: t.leads ? t.cost / t.leads : null, cpql: t.qualified ? t.cost / t.qualified : null, cpo: t.opportunities ? t.cost / t.opportunities : null, cac: t.conversions ? t.cost / t.conversions : null },
  };
}

/** AI Observability. */
export async function aiObservability(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'ai.read');
  const where = { organizationId: ctx.orgId, startedAt: { gte: f.from, lte: f.to } };
  const [total, byStatus, byAgent, latency, handoffs, conversations, responses, gaps, feedback, supervisor] = await Promise.all([
    db.aIExecution.count({ where }),
    db.aIExecution.groupBy({ by: ['status'], where, _count: { _all: true } }),
    db.aIExecution.groupBy({ by: ['agentKey'], where, _count: { _all: true } }),
    db.aIExecution.aggregate({ where: { ...where, latencyMs: { not: null } }, _avg: { latencyMs: true } }),
    db.conversationSummary.count({ where: { organizationId: ctx.orgId, kind: 'HANDOFF', createdAt: { gte: f.from, lte: f.to } } }),
    db.aIExecution.findMany({ where, distinct: ['conversationId'], select: { conversationId: true } }),
    db.message.count({ where: { organizationId: ctx.orgId, senderType: 'AI', createdAt: { gte: f.from, lte: f.to } } }),
    db.knowledgeGap.count({ where: { organizationId: ctx.orgId, status: 'OPEN' } }),
    db.aIFeedback.groupBy({ by: ['rating'], where: { organizationId: ctx.orgId }, _count: { _all: true } }),
    db.aIEvent.groupBy({ by: ['type'], where: { organizationId: ctx.orgId, createdAt: { gte: f.from, lte: f.to }, type: { startsWith: 'supervisor.' } }, _count: { _all: true } }),
  ]);
  const statusCount = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const top = [...byAgent].sort((a, b) => b._count._all - a._count._all)[0];
  return {
    executions: total,
    conversations: conversations.length,
    responses,
    handoffs,
    handoffRate: pct(handoffs, conversations.length),
    failures: statusCount('FAILED'),
    blocked: statusCount('BLOCKED'),
    avgLatencyMs: latency._avg.latencyMs ?? null,
    topAgent: top ? { key: top.agentKey, count: top._count._all } : null,
    byAgent: byAgent.map((a) => ({ key: a.agentKey, value: a._count._all })),
    openGaps: gaps,
    feedback: Object.fromEntries(feedback.map((x) => [x.rating, x._count._all])),
    supervisor: Object.fromEntries(supervisor.map((s) => [s.type.replace('supervisor.', ''), s._count._all])),
  };
}
