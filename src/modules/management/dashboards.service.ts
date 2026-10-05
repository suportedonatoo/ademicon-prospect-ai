import { db } from '@/lib/db';
import { Forbidden } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { OPEN_ASSIGNED_STATUSES } from '../leads/state-machine';

/**
 * PAINÉIS POR ÁREA
 * - Admin Ademicon: métricas gerais, leads entrando (orgânico × anúncio), desempenho de cada consultor.
 * - Consultor: meus leads por temperatura, minha taxa de conversão (CVR) e meus anúncios.
 * CVR = vendas fechadas no período ÷ leads recebidos no período.
 */

export type Period = 'hoje' | '7d' | '30d' | 'mes';
export const PERIOD_LABEL: Record<Period, string> = { hoje: 'Hoje', '7d': '7 dias', '30d': '30 dias', mes: 'Este mês' };

export function periodStart(p: Period, now = new Date()) {
  if (p === '7d') return new Date(now.getTime() - 7 * 86400_000);
  if (p === '30d') return new Date(now.getTime() - 30 * 86400_000);
  const [y, m, d] = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  return p === 'hoje' ? new Date(Date.UTC(y, m - 1, d, 3)) : new Date(Date.UTC(y, m - 1, 1, 3)); // 00:00 em São Paulo
}

const TEMPS = ['QUENTE', 'MORNO', 'FRIO'] as const;

/**
 * TEMPO DE RESPOSTA: do momento em que o lead foi entregue ao consultor até a 1ª mensagem HUMANA dele
 * (mediana em minutos, leads atribuídos no período). Leads ainda sem resposta não entram na mediana.
 */
export async function responseTimes(orgId: string, consultantIds: string[], since: Date) {
  if (!consultantIds.length) return new Map<string, { medianMin: number; answered: number }>();
  const rows = await db.$queryRaw<{ consultantId: string; median: number | null; answered: number }[]>`
    SELECT t."consultantId", percentile_cont(0.5) WITHIN GROUP (ORDER BY t.minutes) AS median, COUNT(*)::int AS answered
    FROM (
      SELECT l."consultantId", EXTRACT(EPOCH FROM (MIN(m."createdAt") - l."assignedAt")) / 60 AS minutes
      FROM "Lead" l
      JOIN "Conversation" c ON c."leadId" = l."id"
      JOIN "Message" m ON m."conversationId" = c."id" AND m."senderType" = 'HUMAN' AND m."createdAt" >= l."assignedAt"
      WHERE l."organizationId" = ${orgId} AND l."consultantId" = ANY(${consultantIds}) AND l."assignedAt" >= ${since} AND l."deletedAt" IS NULL
      GROUP BY l."id", l."consultantId", l."assignedAt"
    ) t
    GROUP BY t."consultantId"`;
  return new Map(rows.map((r) => [r.consultantId, { medianMin: r.median == null ? 0 : Number(r.median), answered: r.answered }]));
}

export async function adminOverview(ctx: Ctx, period: Period) {
  assertCan(ctx, 'analytics.read');
  if (ctx.scope === 'OWN') throw Forbidden('Painel da gestão.');
  const org = ctx.orgId;
  const since = periodStart(period);
  const pjFilter = ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {};
  const leadWhere = { organizationId: org, deletedAt: null, createdAt: { gte: since }, ...pjFilter };
  const twoHours = new Date(Date.now() - 2 * 3600_000);

  const [byTemp, sponsoredCampaigns, byCampaign, bySource, won, waiting, noContact, consultants] = await Promise.all([
    db.lead.groupBy({ by: ['temperature'], where: leadWhere, _count: { _all: true } }),
    db.campaign.findMany({ where: { organizationId: org, NOT: { sponsorConsultantIds: { isEmpty: true } } }, select: { id: true, sponsorConsultantIds: true } }),
    db.lead.groupBy({ by: ['campaignId'], where: leadWhere, _count: { _all: true } }),
    db.lead.groupBy({ by: ['source'], where: leadWhere, _count: { _all: true }, orderBy: { _count: { source: 'desc' } }, take: 8 }),
    db.opportunity.aggregate({ where: { organizationId: org, status: 'WON', closedAt: { gte: since }, ...pjFilter }, _count: { _all: true }, _sum: { value: true } }),
    db.lead.count({ where: { organizationId: org, status: 'QUALIFIED', consultantId: null, deletedAt: null, ...pjFilter } }),
    db.lead.count({ where: { organizationId: org, status: 'ASSIGNED', assignedAt: { lt: twoHours }, lastInteractionAt: null, deletedAt: null, ...pjFilter } }),
    consultantPerformance(ctx, since),
  ]);

  const total = byTemp.reduce((n, r) => n + r._count._all, 0);
  const kindOf = (campaignId: string | null) => {
    const c = sponsoredCampaigns.find((x) => x.id === campaignId);
    return !c ? 'organico' : c.sponsorConsultantIds.length === 1 ? 'individual' : 'grupo';
  };
  const origin = { organico: 0, grupo: 0, individual: 0, link: 0 };
  for (const r of byCampaign) origin[kindOf(r.campaignId)] += r._count._all;
  // Do orgânico, separa o que chegou pelo link próprio (bio) de cada consultor — esse não entra na divisão.
  const sponsoredIds = sponsoredCampaigns.map((c) => c.id);
  origin.link = await db.lead.count({
    where: { ...leadWhere, routingHint: { startsWith: 'LINK:' }, OR: [{ campaignId: null }, { campaignId: { notIn: sponsoredIds } }] },
  });
  origin.organico -= origin.link;

  return {
    period,
    since,
    leads: { total, ...Object.fromEntries(TEMPS.map((t) => [t, byTemp.find((r) => r.temperature === t)?._count._all ?? 0])) } as { total: number; QUENTE: number; MORNO: number; FRIO: number },
    origin,
    sources: bySource.map((s) => ({ source: s.source, count: s._count._all })),
    sales: { count: won._count._all, value: won._sum.value ?? 0, cvr: total ? won._count._all / total : 0 },
    attention: { waiting, noContact },
    consultants,
  };
}

/** Desempenho de cada consultor no período (leads recebidos, em aberto, quentes, sem contato, vendas, CVR). */
export async function consultantPerformance(ctx: Ctx, since: Date) {
  const where = { organizationId: ctx.orgId, active: true, ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}) };
  const list = await db.consultant.findMany({ where, select: { id: true, name: true, available: true, pj: { select: { code: true } }, user: { select: { lastLoginAt: true } } }, orderBy: { name: 'asc' } });
  const ids = list.map((c) => c.id);
  const twoHours = new Date(Date.now() - 2 * 3600_000);
  const [received, open, hot, noContact, won, response] = await Promise.all([
    db.lead.groupBy({ by: ['consultantId'], where: { organizationId: ctx.orgId, consultantId: { in: ids }, assignedAt: { gte: since }, deletedAt: null }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['consultantId'], where: { organizationId: ctx.orgId, consultantId: { in: ids }, status: { in: OPEN_ASSIGNED_STATUSES }, deletedAt: null }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['consultantId'], where: { organizationId: ctx.orgId, consultantId: { in: ids }, status: { in: OPEN_ASSIGNED_STATUSES }, temperature: 'QUENTE', deletedAt: null }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['consultantId'], where: { organizationId: ctx.orgId, consultantId: { in: ids }, status: 'ASSIGNED', assignedAt: { lt: twoHours }, lastInteractionAt: null, deletedAt: null }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['consultantId'], where: { organizationId: ctx.orgId, consultantId: { in: ids }, status: 'WON', closedAt: { gte: since } }, _count: { _all: true }, _sum: { value: true } }),
    responseTimes(ctx.orgId, ids, since),
  ]);
  const n = (rows: { consultantId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.consultantId === id)?._count._all ?? 0;
  return list
    .map((c) => {
      const rec = n(received, c.id);
      const w = won.find((r) => r.consultantId === c.id);
      const sales = w?._count._all ?? 0;
      return {
        id: c.id,
        name: c.name,
        pj: c.pj.code,
        available: c.available,
        lastLoginAt: c.user?.lastLoginAt ?? null,
        received: rec,
        open: n(open, c.id),
        hot: n(hot, c.id),
        noContact: n(noContact, c.id),
        sales,
        soldValue: w?._sum.value ?? 0,
        cvr: rec ? sales / rec : 0,
        responseMin: response.get(c.id)?.medianMin ?? null,
      };
    })
    .sort((a, b) => b.sales - a.sales || b.cvr - a.cvr || b.received - a.received);
}

/** Painel do consultor: só os dados dele. */
export async function consultantDashboard(ctx: Ctx, period: Period) {
  if (!ctx.consultantId) throw Forbidden('Painel do consultor: seu usuário não está ligado a um consultor.');
  const me = ctx.consultantId;
  const since = periodStart(period);
  const monthStart = periodStart('mes');
  const [received, viaLink, wonPeriod, receivedMonth, wonMonth, leads, response] = await Promise.all([
    db.lead.count({ where: { organizationId: ctx.orgId, consultantId: me, assignedAt: { gte: since }, deletedAt: null } }),
    db.lead.count({ where: { organizationId: ctx.orgId, consultantId: me, routingHint: `LINK:${me}`, assignedAt: { gte: since }, deletedAt: null } }),
    db.opportunity.aggregate({ where: { organizationId: ctx.orgId, consultantId: me, status: 'WON', closedAt: { gte: since } }, _count: { _all: true }, _sum: { value: true } }),
    db.lead.count({ where: { organizationId: ctx.orgId, consultantId: me, assignedAt: { gte: monthStart }, deletedAt: null } }),
    db.opportunity.count({ where: { organizationId: ctx.orgId, consultantId: me, status: 'WON', closedAt: { gte: monthStart } } }),
    db.lead.findMany({
      where: { organizationId: ctx.orgId, consultantId: me, status: { in: OPEN_ASSIGNED_STATUSES }, deletedAt: null },
      select: { id: true, name: true, temperature: true, score: true, product: true, desiredValue: true, lastInteractionAt: true, assignedAt: true, source: true, conversations: { where: { status: 'OPEN' }, select: { id: true }, take: 1 } },
      orderBy: [{ score: 'desc' }, { assignedAt: 'desc' }],
      take: 300,
    }),
    responseTimes(ctx.orgId, [me], since),
  ]);
  const group = (t: string) => leads.filter((l) => l.temperature === t).map((l) => ({ ...l, conversationId: l.conversations[0]?.id ?? null }));
  return {
    period,
    received,
    viaLink,
    sales: wonPeriod._count._all,
    soldValue: wonPeriod._sum.value ?? 0,
    cvr: received ? wonPeriod._count._all / received : 0,
    cvrMonth: receivedMonth ? wonMonth / receivedMonth : 0,
    responseMin: response.get(me)?.medianMin ?? null,
    open: leads.length,
    hot: group('QUENTE'),
    warm: group('MORNO'),
    cold: group('FRIO'),
  };
}
