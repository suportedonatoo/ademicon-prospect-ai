import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { leadFilterWhere, leadSqlWhere, oppFilterWhere, type AnalyticsFilters } from '../analytics/filters';
import { QUALIFIED_LEAD_WHERE } from '../leads/catalog';
import { getOrgSettings } from '../organizations/settings';
import { LOSS_CATEGORIES } from '../opportunities/health-engine';

// REVENUE INTELLIGENCE — conecta marketing → aquisição → leads → IA → consultores → oportunidades → receita.
// Regras de honestidade:
//  • Métricas de mídia (impressões, cliques, gasto) só vêm de CampaignMetric (provider/importação/seed demo)
//    e cada linha informa a origem ("provider" ou "demo").
//  • Receita = valor das oportunidades GANHAS × % configurado (settings.roi). Sem % configurado, ROI/ROAS = null.

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const PROPOSAL_KEYS = ['PROPOSTA', 'NEGOCIACAO', 'FECHADO'];

export async function roiConfig(orgId: string) {
  const s = await getOrgSettings(orgId);
  return { revenuePct: s.roi.revenuePctOfWonValue, formula: 'Receita atribuída = Σ valor das oportunidades ganhas × % de receita configurado · ROI = (Receita − Investimento) ÷ Investimento · ROAS = Receita ÷ Investimento' };
}

/** Funil de receita completo com taxa de passagem e tempo médio até cada etapa. */
export async function revenueFunnel(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const lw = leadFilterWhere(ctx, f);
  const ow = oppFilterWhere(ctx, f);
  const campaignIds = f.campaignId ? [f.campaignId] : undefined;
  const pjFilter = ctx.scope === 'PJ' ? ctx.pjId : f.pjId;
  const [media, visits, simulations, leads, qualified, hot, contacted, opps, proposals, negotiations, won, times] = await Promise.all([
    ctx.scope === 'ORG'
      ? db.campaignMetric.aggregate({ where: { organizationId: ctx.orgId, date: { gte: f.from, lte: f.to }, ...(campaignIds ? { campaignId: { in: campaignIds } } : {}) }, _sum: { impressions: true, clicks: true, spend: true } })
      : Promise.resolve(null),
    db.attributionSession.count({ where: { organizationId: ctx.orgId, firstSeenAt: { gte: f.from, lte: f.to }, ...(pjFilter ? { pjId: pjFilter } : {}) } }),
    db.simulation.count({ where: { organizationId: ctx.orgId, createdAt: { gte: f.from, lte: f.to }, ...(pjFilter ? { pjId: pjFilter } : {}), ...(f.product ? { product: f.product } : {}) } }),
    db.lead.count({ where: lw }),
    db.lead.count({ where: { ...lw, ...QUALIFIED_LEAD_WHERE } }),
    db.lead.count({ where: { ...lw, temperature: 'QUENTE' } }),
    db.lead.count({ where: { ...lw, conversations: { some: { messages: { some: { direction: 'OUTBOUND', senderType: { in: ['AI', 'HUMAN'] } } } } } } }),
    db.opportunity.count({ where: ow }),
    db.opportunity.count({ where: { ...ow, OR: [{ stage: { key: { in: PROPOSAL_KEYS } } }, { status: 'WON' }] } }),
    db.opportunity.count({ where: { ...ow, OR: [{ stage: { key: { in: ['NEGOCIACAO', 'FECHADO'] } } }, { status: 'WON' }] } }),
    db.opportunity.aggregate({ where: { ...ow, status: 'WON' }, _count: { _all: true }, _sum: { value: true } }),
    db.$queryRaw<{ toOpp: number | null; toWin: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (o."createdAt" - l."createdAt")) / 86400)::float AS "toOpp",
             AVG(EXTRACT(EPOCH FROM (o."closedAt" - l."createdAt")) / 86400) FILTER (WHERE o."status" = 'WON')::float AS "toWin"
      FROM "Opportunity" o JOIN "Lead" l ON l."id" = o."leadId"
      WHERE ${leadSqlWhere(ctx, f)}`,
  ]);
  const cfg = await roiConfig(ctx.orgId);
  const wonValue = won._sum.value ?? 0;
  const revenue = cfg.revenuePct != null ? Math.round((wonValue * cfg.revenuePct) / 100) : null;
  const steps = [
    { key: 'impressions', label: 'Impressões', value: media?._sum.impressions ?? null, source: 'CampaignMetric' },
    { key: 'clicks', label: 'Cliques', value: media?._sum.clicks ?? null, source: 'CampaignMetric' },
    { key: 'visits', label: 'Visitas', value: visits, source: 'AttributionSession' },
    { key: 'simulations', label: 'Simulações', value: simulations, source: 'Simulation' },
    { key: 'leads', label: 'Leads', value: leads, source: 'Lead' },
    { key: 'qualified', label: 'Qualificados', value: qualified, source: 'Lead (morno/quente ou status qualificado)' },
    { key: 'hot', label: 'Quentes', value: hot, source: 'Lead.temperature' },
    { key: 'contacted', label: 'Contatados', value: contacted, source: 'Message (IA/consultor)' },
    { key: 'opportunities', label: 'Oportunidades', value: opps, source: 'Opportunity' },
    { key: 'proposals', label: 'Propostas', value: proposals, source: 'Opportunity (etapa ≥ Proposta)' },
    { key: 'negotiations', label: 'Negociação', value: negotiations, source: 'Opportunity (etapa ≥ Negociação)' },
    { key: 'conversions', label: 'Conversões', value: won._count._all, source: 'Opportunity WON' },
  ];
  const withRates = steps.map((s, i) => {
    const prev = steps.slice(0, i).reverse().find((p) => p.value != null);
    return { ...s, rateFromPrevious: s.value != null && prev?.value ? pct(s.value, prev.value) : null };
  });
  return {
    steps: withRates,
    avgDaysLeadToOpportunity: times[0]?.toOpp ?? null,
    avgDaysLeadToConversion: times[0]?.toWin ?? null,
    wonValue,
    revenue,
    spend: media?._sum.spend ?? null,
    roi: revenue != null && media?._sum.spend ? Math.round(((revenue - media._sum.spend) / media._sum.spend) * 1000) / 10 : null,
    roas: revenue != null && media?._sum.spend ? Math.round((revenue / media._sum.spend) * 100) / 100 : null,
    roiFormula: cfg.formula,
    roiConfigured: cfg.revenuePct != null,
  };
}

/** Funil por dimensão: onde cada origem/produto/região/PJ/consultor/campanha perde leads. */
export async function funnelBy(ctx: Ctx, f: AnalyticsFilters, dim: 'source' | 'product' | 'region' | 'pjId' | 'consultantId' | 'campaignId') {
  assertCan(ctx, 'analytics.read');
  const col = Prisma.raw(`l."${dim}"`);
  const rows = await db.$queryRaw<{ key: string | null; leads: number; qualified: number; hot: number; opportunities: number; proposals: number; conversions: number; wonValue: number }[]>`
    SELECT ${col} AS key,
      COUNT(DISTINCT l."id")::int AS leads,
      COUNT(DISTINCT l."id") FILTER (WHERE l."temperature" IN ('MORNO','QUENTE') OR l."status" IN ('QUALIFIED','ASSIGNED','OPPORTUNITY','CONVERTED'))::int AS qualified,
      COUNT(DISTINCT l."id") FILTER (WHERE l."temperature" = 'QUENTE')::int AS hot,
      COUNT(DISTINCT o."id")::int AS opportunities,
      COUNT(DISTINCT o."id") FILTER (WHERE s."key" IN ('PROPOSTA','NEGOCIACAO','FECHADO') OR o."status" = 'WON')::int AS proposals,
      COUNT(DISTINCT o."id") FILTER (WHERE o."status" = 'WON')::int AS conversions,
      COALESCE(SUM(o."value") FILTER (WHERE o."status" = 'WON'), 0)::bigint::int AS "wonValue"
    FROM "Lead" l
    LEFT JOIN "Opportunity" o ON o."leadId" = l."id"
    LEFT JOIN "PipelineStage" s ON s."id" = o."stageId"
    WHERE ${leadSqlWhere(ctx, f)}
    GROUP BY 1 ORDER BY leads DESC LIMIT 30`;
  const names = await labelsFor(ctx.orgId, dim, rows.map((r) => r.key).filter(Boolean) as string[]);
  return rows.map((r) => ({
    ...r,
    label: r.key ? names.get(r.key) ?? r.key : 'Não informado',
    qualificationRate: pct(r.qualified, r.leads),
    opportunityRate: pct(r.opportunities, r.leads),
    winRate: pct(r.conversions, r.opportunities),
    // Onde mais perde: a maior queda relativa entre etapas consecutivas
    biggestDrop: biggestDrop([
      ['Lead → Qualificado', r.leads, r.qualified],
      ['Qualificado → Oportunidade', r.qualified, r.opportunities],
      ['Oportunidade → Proposta', r.opportunities, r.proposals],
      ['Proposta → Conversão', r.proposals, r.conversions],
    ]),
  }));
}

function biggestDrop(stages: [string, number, number][]) {
  let worst: { stage: string; lossPct: number } | null = null;
  for (const [stage, a, b] of stages) {
    if (a < 5) continue;
    const loss = Math.round((1 - b / a) * 1000) / 10;
    if (!worst || loss > worst.lossPct) worst = { stage, lossPct: loss };
  }
  return worst;
}

async function labelsFor(orgId: string, dim: string, keys: string[]) {
  const map = new Map<string, string>();
  if (!keys.length) return map;
  if (dim === 'pjId') for (const p of await db.pJ.findMany({ where: { organizationId: orgId, id: { in: keys } }, select: { id: true, code: true, name: true } })) map.set(p.id, `${p.code} · ${p.name}`);
  if (dim === 'consultantId') for (const c of await db.consultant.findMany({ where: { organizationId: orgId, id: { in: keys } }, select: { id: true, name: true } })) map.set(c.id, c.name);
  if (dim === 'campaignId') for (const c of await db.campaign.findMany({ where: { organizationId: orgId, id: { in: keys } }, select: { id: true, name: true } })) map.set(c.id, c.name);
  return map;
}

/** Campaign Intelligence: mídia + qualidade do lead + qualidade da oportunidade + receita. */
export async function campaignIntelligence(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const campaigns = await db.campaign.findMany({ where: { organizationId: ctx.orgId, ...(f.campaignId ? { id: f.campaignId } : {}), ...(f.product ? { product: f.product } : {}), ...(f.source ? { source: f.source } : {}) }, select: { id: true, name: true, source: true, status: true, product: true, budget: true } });
  const ids = campaigns.map((c) => c.id);
  if (!ids.length) return { rows: [], roiConfigured: false, formula: (await roiConfig(ctx.orgId)).formula };
  const cfg = await roiConfig(ctx.orgId);
  const [metrics, providers, leadAgg] = await Promise.all([
    db.campaignMetric.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids }, date: { gte: f.from, lte: f.to } }, _sum: { impressions: true, clicks: true, spend: true } }),
    db.campaignMetric.findMany({ where: { campaignId: { in: ids } }, distinct: ['campaignId'], select: { campaignId: true, provider: true } }),
    db.$queryRaw<{ campaignId: string; leads: number; qualified: number; hot: number; avgScore: number; opportunities: number; proposals: number; conversions: number; wonValue: number; avgOppValue: number | null }[]>`
      SELECT l."campaignId",
        COUNT(DISTINCT l."id")::int AS leads,
        COUNT(DISTINCT l."id") FILTER (WHERE l."temperature" IN ('MORNO','QUENTE') OR l."status" IN ('QUALIFIED','ASSIGNED','OPPORTUNITY','CONVERTED'))::int AS qualified,
        COUNT(DISTINCT l."id") FILTER (WHERE l."temperature" = 'QUENTE')::int AS hot,
        COALESCE(AVG(l."score"), 0)::float AS "avgScore",
        COUNT(DISTINCT o."id")::int AS opportunities,
        COUNT(DISTINCT o."id") FILTER (WHERE s."key" IN ('PROPOSTA','NEGOCIACAO','FECHADO') OR o."status" = 'WON')::int AS proposals,
        COUNT(DISTINCT o."id") FILTER (WHERE o."status" = 'WON')::int AS conversions,
        COALESCE(SUM(o."value") FILTER (WHERE o."status" = 'WON'), 0)::bigint::int AS "wonValue",
        AVG(o."value")::float AS "avgOppValue"
      FROM "Lead" l LEFT JOIN "Opportunity" o ON o."leadId" = l."id" LEFT JOIN "PipelineStage" s ON s."id" = o."stageId"
      WHERE ${leadSqlWhere(ctx, f)} AND l."campaignId" IN (${Prisma.join(ids)})
      GROUP BY 1`,
  ]);
  const rows = campaigns.map((c) => {
    const m = metrics.find((x) => x.campaignId === c.id)?._sum;
    const a = leadAgg.find((x) => x.campaignId === c.id);
    const spend = m?.spend ?? null;
    const provider = providers.find((p) => p.campaignId === c.id)?.provider ?? null;
    const revenue = cfg.revenuePct != null && a ? Math.round((a.wonValue * cfg.revenuePct) / 100) : null;
    const div = (x: number | null | undefined, y: number | null | undefined) => (x != null && y ? Math.round((x / y) * 100) / 100 : null);
    return {
      id: c.id,
      name: c.name,
      source: c.source,
      status: c.status,
      product: c.product,
      dataSource: provider ? (/mock|demo/i.test(provider) ? 'demo' : 'provider') : 'sem métricas',
      spend,
      impressions: m?.impressions ?? null,
      clicks: m?.clicks ?? null,
      ctr: m?.impressions ? pct(m.clicks ?? 0, m.impressions) : null,
      cpc: div(spend, m?.clicks),
      leads: a?.leads ?? 0,
      qualified: a?.qualified ?? 0,
      hot: a?.hot ?? 0,
      opportunities: a?.opportunities ?? 0,
      proposals: a?.proposals ?? 0,
      conversions: a?.conversions ?? 0,
      cpl: div(spend, a?.leads),
      cpql: div(spend, a?.qualified),
      cpo: div(spend, a?.opportunities),
      cac: div(spend, a?.conversions),
      revenue,
      roi: revenue != null && spend ? Math.round(((revenue - spend) / spend) * 1000) / 10 : null,
      roas: revenue != null && spend ? div(revenue, spend) : null,
      // Qualidade — o sucesso não é medido só por volume.
      leadQuality: { avgScore: a ? Math.round(a.avgScore) : null, qualifiedRate: a ? pct(a.qualified, a.leads) : null, hotRate: a ? pct(a.hot, a.leads) : null },
      opportunityQuality: { opportunityRate: a ? pct(a.opportunities, a.leads) : null, winRate: a ? pct(a.conversions, a.opportunities) : null, avgValue: a?.avgOppValue ? Math.round(a.avgOppValue) : null },
    };
  });
  return { rows: rows.sort((x, y) => (y.opportunities - x.opportunities) || (y.leads - x.leads)), roiConfigured: cfg.revenuePct != null, formula: cfg.formula };
}

/** Product Intelligence: procura, intenção, conversão, objeções, campanhas, regiões e PJs por produto. */
export async function productIntelligence(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const w = leadSqlWhere(ctx, f);
  const [base, objections, regions, pjs, campaigns] = await Promise.all([
    db.$queryRaw<{ product: string | null; leads: number; avgIntent: number; highIntent: number; qualified: number; opportunities: number; conversions: number; wonValue: number; simulations: number }[]>`
      SELECT l."product",
        COUNT(DISTINCT l."id")::int AS leads,
        COALESCE(AVG(l."intentScore"), 0)::float AS "avgIntent",
        COUNT(DISTINCT l."id") FILTER (WHERE l."intent" = 'HIGH')::int AS "highIntent",
        COUNT(DISTINCT l."id") FILTER (WHERE l."temperature" IN ('MORNO','QUENTE') OR l."status" IN ('QUALIFIED','ASSIGNED','OPPORTUNITY','CONVERTED'))::int AS qualified,
        COUNT(DISTINCT o."id")::int AS opportunities,
        COUNT(DISTINCT o."id") FILTER (WHERE o."status" = 'WON')::int AS conversions,
        COALESCE(SUM(o."value") FILTER (WHERE o."status" = 'WON'), 0)::bigint::int AS "wonValue",
        COUNT(DISTINCT sim."id")::int AS simulations
      FROM "Lead" l LEFT JOIN "Opportunity" o ON o."leadId" = l."id" LEFT JOIN "Simulation" sim ON sim."leadId" = l."id"
      WHERE ${w} GROUP BY 1 ORDER BY leads DESC`,
    db.$queryRaw<{ product: string | null; objection: string; n: number }[]>`
      SELECT l."product", unnest(m."objections") AS objection, COUNT(*)::int AS n
      FROM "LeadMemory" m JOIN "Lead" l ON l."id" = m."leadId" WHERE ${w} GROUP BY 1, 2 ORDER BY n DESC`,
    db.$queryRaw<{ product: string | null; city: string | null; n: number }[]>`SELECT l."product", l."city", COUNT(*)::int AS n FROM "Lead" l WHERE ${w} GROUP BY 1, 2 ORDER BY n DESC`,
    db.$queryRaw<{ product: string | null; pjId: string | null; n: number }[]>`SELECT l."product", l."pjId", COUNT(*)::int AS n FROM "Lead" l WHERE ${w} GROUP BY 1, 2 ORDER BY n DESC`,
    db.$queryRaw<{ product: string | null; campaignId: string | null; n: number }[]>`SELECT l."product", l."campaignId", COUNT(*)::int AS n FROM "Lead" l WHERE ${w} AND l."campaignId" IS NOT NULL GROUP BY 1, 2 ORDER BY n DESC`,
  ]);
  const pjNames = await labelsFor(ctx.orgId, 'pjId', [...new Set(pjs.map((p) => p.pjId).filter(Boolean) as string[])]);
  const campNames = await labelsFor(ctx.orgId, 'campaignId', [...new Set(campaigns.map((c) => c.campaignId).filter(Boolean) as string[])]);
  return base.map((b) => ({
    ...b,
    avgIntent: Math.round(b.avgIntent),
    qualificationRate: pct(b.qualified, b.leads),
    conversionRate: pct(b.conversions, b.leads),
    topObjections: objections.filter((o) => o.product === b.product).slice(0, 3).map((o) => ({ label: o.objection, count: o.n })),
    topCities: regions.filter((r) => r.product === b.product && r.city).slice(0, 3).map((r) => ({ label: r.city!, count: r.n })),
    topPjs: pjs.filter((p) => p.product === b.product && p.pjId).slice(0, 3).map((p) => ({ label: pjNames.get(p.pjId!) ?? p.pjId!, count: p.n })),
    topCampaigns: campaigns.filter((c) => c.product === b.product).slice(0, 3).map((c) => ({ label: campNames.get(c.campaignId!) ?? c.campaignId!, count: c.n })),
  }));
}

/** Loss Intelligence: perdas classificadas, agrupadas e com padrões. */
export async function lossIntelligence(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const where: Prisma.LossRecordWhereInput = {
    organizationId: ctx.orgId,
    createdAt: { gte: f.from, lte: f.to },
    ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}),
    ...(ctx.scope === 'OWN' ? { consultantId: ctx.consultantId ?? '__none__' } : {}),
    ...(f.product ? { product: f.product } : {}),
    ...(f.pjId ? { pjId: f.pjId } : {}),
    ...(f.consultantId ? { consultantId: f.consultantId } : {}),
    ...(f.campaignId ? { campaignId: f.campaignId } : {}),
  };
  const [byCategory, byStage, byProduct, byConsultant, competitors, recent, total, lostValue] = await Promise.all([
    db.lossRecord.groupBy({ by: ['category'], where, _count: { _all: true }, _sum: { value: true } }),
    db.lossRecord.groupBy({ by: ['stageKey'], where, _count: { _all: true } }),
    db.lossRecord.groupBy({ by: ['product'], where, _count: { _all: true } }),
    db.lossRecord.groupBy({ by: ['consultantId'], where, _count: { _all: true } }),
    db.lossRecord.groupBy({ by: ['competitor'], where: { ...where, competitor: { not: null } }, _count: { _all: true } }),
    db.lossRecord.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20 }),
    db.lossRecord.count({ where }),
    db.lossRecord.aggregate({ where, _sum: { value: true } }),
  ]);
  const consultantNames = await labelsFor(ctx.orgId, 'consultantId', byConsultant.map((b) => b.consultantId).filter(Boolean) as string[]);
  const leadNames = new Map((await db.lead.findMany({ where: { id: { in: recent.map((r) => r.leadId) } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
  const cats = byCategory.map((c) => ({ key: c.category, label: LOSS_CATEGORIES[c.category as keyof typeof LOSS_CATEGORIES] ?? c.category, count: c._count._all, value: c._sum.value ?? 0, share: pct(c._count._all, total) })).sort((a, b) => b.count - a.count);
  const patterns = await db.aIInsight.findMany({ where: { organizationId: ctx.orgId, kind: 'LOSS_PATTERN', status: { not: 'DISMISSED' } }, orderBy: { createdAt: 'desc' }, take: 3 });
  return {
    total,
    lostValue: lostValue._sum.value ?? 0,
    byCategory: cats,
    byStage: byStage.map((s) => ({ key: s.stageKey ?? '—', count: s._count._all })).sort((a, b) => b.count - a.count),
    byProduct: byProduct.map((p) => ({ key: p.product ?? 'NAO_INFORMADO', count: p._count._all })).sort((a, b) => b.count - a.count),
    byConsultant: byConsultant.map((c) => ({ key: c.consultantId ? consultantNames.get(c.consultantId) ?? c.consultantId : 'Sem consultor', count: c._count._all })).sort((a, b) => b.count - a.count),
    competitors: competitors.map((c) => ({ key: c.competitor!, count: c._count._all })).sort((a, b) => b.count - a.count),
    recent: recent.map((r) => ({ ...r, leadName: leadNames.get(r.leadId) ?? '—', categoryLabel: LOSS_CATEGORIES[r.category as keyof typeof LOSS_CATEGORIES] ?? r.category })),
    patterns,
  };
}

/** Onde a IA ajuda e onde entra o humano. */
export async function aiContribution(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const w = leadSqlWhere(ctx, f);
  const [row] = await db.$queryRaw<{ withAi: number; aiOnlyQualified: number; handoffs: number; humanTouched: number; oppsWithAi: number; oppsWithoutAi: number; leadsWithoutAi: number }[]>`
    WITH lx AS (
      SELECT l."id", l."temperature", l."status",
        EXISTS (SELECT 1 FROM "Message" m JOIN "Conversation" c ON c."id" = m."conversationId" WHERE c."leadId" = l."id" AND m."senderType" = 'AI') AS ai,
        EXISTS (SELECT 1 FROM "Message" m JOIN "Conversation" c ON c."id" = m."conversationId" WHERE c."leadId" = l."id" AND m."senderType" = 'HUMAN') AS human,
        EXISTS (SELECT 1 FROM "ConversationSummary" s WHERE s."leadId" = l."id" AND s."kind" = 'HANDOFF') AS handoff,
        EXISTS (SELECT 1 FROM "Opportunity" o WHERE o."leadId" = l."id") AS opp
      FROM "Lead" l WHERE ${w}
    )
    SELECT COUNT(*) FILTER (WHERE ai)::int AS "withAi",
      COUNT(*) FILTER (WHERE ai AND NOT human AND ("temperature" IN ('MORNO','QUENTE')))::int AS "aiOnlyQualified",
      COUNT(*) FILTER (WHERE handoff)::int AS handoffs,
      COUNT(*) FILTER (WHERE human)::int AS "humanTouched",
      COUNT(*) FILTER (WHERE ai AND opp)::int AS "oppsWithAi",
      COUNT(*) FILTER (WHERE NOT ai AND opp)::int AS "oppsWithoutAi",
      COUNT(*) FILTER (WHERE NOT ai)::int AS "leadsWithoutAi"
    FROM lx`;
  return {
    ...row,
    opportunityRateWithAi: row ? pct(row.oppsWithAi, row.withAi) : null,
    opportunityRateWithoutAi: row ? pct(row.oppsWithoutAi, row.leadsWithoutAi) : null,
    handoffRate: row ? pct(row.handoffs, row.withAi) : null,
    note: 'Comparação observacional (não é teste controlado): leads atendidos pela IA x sem IA no mesmo período e filtros.',
  };
}

/** Comercial: conversão e tempo médio entre etapas (Lead→Qualificado→Oportunidade→Proposta→Fechado). */
export async function commercialStages(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const [row] = await db.$queryRaw<{ leads: number; qualified: number; opps: number; proposals: number; won: number; dLeadOpp: number | null; dOppProposal: number | null; dProposalWon: number | null }[]>`
    SELECT COUNT(DISTINCT l."id")::int AS leads,
      COUNT(DISTINCT l."id") FILTER (WHERE l."temperature" IN ('MORNO','QUENTE') OR l."status" IN ('QUALIFIED','ASSIGNED','OPPORTUNITY','CONVERTED'))::int AS qualified,
      COUNT(DISTINCT o."id")::int AS opps,
      COUNT(DISTINCT o."id") FILTER (WHERE EXISTS (SELECT 1 FROM "OpportunityActivity" a WHERE a."opportunityId" = o."id" AND a."toStage" IN ('PROPOSTA','NEGOCIACAO','FECHADO')))::int AS proposals,
      COUNT(DISTINCT o."id") FILTER (WHERE o."status" = 'WON')::int AS won,
      AVG(EXTRACT(EPOCH FROM (o."createdAt" - l."createdAt")) / 86400)::float AS "dLeadOpp",
      AVG(EXTRACT(EPOCH FROM ((SELECT MIN(a."createdAt") FROM "OpportunityActivity" a WHERE a."opportunityId" = o."id" AND a."toStage" = 'PROPOSTA') - o."createdAt")) / 86400)::float AS "dOppProposal",
      AVG(EXTRACT(EPOCH FROM (o."closedAt" - (SELECT MIN(a."createdAt") FROM "OpportunityActivity" a WHERE a."opportunityId" = o."id" AND a."toStage" = 'PROPOSTA'))) / 86400) FILTER (WHERE o."status" = 'WON')::float AS "dProposalWon"
    FROM "Lead" l LEFT JOIN "Opportunity" o ON o."leadId" = l."id"
    WHERE ${leadSqlWhere(ctx, f)}`;
  if (!row) return [];
  return [
    { from: 'Lead', to: 'Qualificado', rate: pct(row.qualified, row.leads), avgDays: null, dropOff: row.leads - row.qualified },
    { from: 'Qualificado', to: 'Oportunidade', rate: pct(row.opps, row.qualified), avgDays: row.dLeadOpp, dropOff: Math.max(0, row.qualified - row.opps) },
    { from: 'Oportunidade', to: 'Proposta', rate: pct(row.proposals, row.opps), avgDays: row.dOppProposal, dropOff: row.opps - row.proposals },
    { from: 'Proposta', to: 'Fechado', rate: pct(row.won, row.proposals), avgDays: row.dProposalWon, dropOff: row.proposals - row.won },
  ];
}

/**
 * COHORT ANALYSIS: leads agrupados pelo mês de entrada (dentro do filtro/escopo) e o que cada
 * coorte alcançou ATÉ HOJE — qualificação, oportunidade, venda — e o tempo médio até a venda.
 * Coortes recentes ainda estão "amadurecendo": comparar taxas entre meses exige esse cuidado.
 */
export async function cohortAnalysis(ctx: Ctx, f: AnalyticsFilters) {
  assertCan(ctx, 'analytics.read');
  const rows = await db.$queryRaw<{ cohort: Date; leads: number; qualified: number; opportunities: number; won: number; won_value: number | null; avg_days: number | null }[]>(
    Prisma.sql`
      SELECT date_trunc('month', l."createdAt") AS cohort,
             COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE l."temperature" IN ('MORNO','QUENTE') OR l."status" IN ('QUALIFIED','ASSIGNED','OPPORTUNITY','CONVERTED'))::int AS qualified,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Opportunity" o WHERE o."leadId" = l."id"))::int AS opportunities,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Opportunity" o WHERE o."leadId" = l."id" AND o."status" = 'WON'))::int AS won,
             SUM((SELECT SUM(o."value") FROM "Opportunity" o WHERE o."leadId" = l."id" AND o."status" = 'WON'))::float AS won_value,
             AVG((SELECT EXTRACT(EPOCH FROM (MIN(o."closedAt") - l."createdAt")) / 86400 FROM "Opportunity" o WHERE o."leadId" = l."id" AND o."status" = 'WON'))::float AS avg_days
      FROM "Lead" l
      WHERE ${leadSqlWhere(ctx, f)}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 24`
  );
  const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  return rows.map((r) => ({
    cohort: r.cohort,
    leads: r.leads,
    qualified: r.qualified,
    opportunities: r.opportunities,
    won: r.won,
    wonValue: Math.round(r.won_value ?? 0),
    qualifiedRate: rate(r.qualified, r.leads),
    opportunityRate: rate(r.opportunities, r.leads),
    wonRate: rate(r.won, r.leads),
    avgDaysToWin: r.avg_days == null ? null : Math.round(r.avg_days * 10) / 10,
  }));
}
