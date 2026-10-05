import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { Forbidden } from '@/lib/errors';
import { CHANNEL_LABELS, type Channel } from '../attribution/channel';

/**
 * Relatório das landings das PJs + Google orgânico x pago.
 * Funil por PJ: visitas → simulações → FRIO (só simulou) → MORNO → QUENTE → convertidos.
 */
export async function landingReport(ctx: Ctx, opts: { from: Date; to: Date }) {
  assertCan(ctx, 'analytics.read');
  if (ctx.scope === 'OWN') throw Forbidden('Relatório disponível para gestores.');
  const orgId = ctx.orgId;
  const pjFilter = ctx.scope === 'PJ' ? { id: ctx.pjId ?? '__none__' } : {};
  const pjIdFilter = ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {};
  const period = { gte: opts.from, lte: opts.to };

  const [pjs, visits, sims, leads, converted, gSessions, gSims, gLeads, gHot, gWon] = await Promise.all([
    db.pJ.findMany({ where: { organizationId: orgId, active: true, ...pjFilter }, select: { id: true, code: true, name: true, subdomain: true, landingActive: true }, orderBy: { code: 'asc' } }),
    db.attributionSession.groupBy({ by: ['pjId'], where: { organizationId: orgId, pjId: { not: null }, firstSeenAt: period, ...pjIdFilter }, _count: { _all: true } }),
    db.simulation.groupBy({ by: ['pjId', 'heat'], where: { organizationId: orgId, pjId: { not: null }, createdAt: period, ...pjIdFilter }, _count: { _all: true } }),
    db.lead.groupBy({
      by: ['originPjId', 'landingHeat'],
      where: { organizationId: orgId, deletedAt: null, landingHeat: { not: null }, createdAt: period, ...(ctx.scope === 'PJ' ? { originPjId: ctx.pjId ?? '__none__' } : {}) },
      _count: { _all: true },
    }),
    db.lead.groupBy({
      by: ['originPjId'],
      where: { organizationId: orgId, deletedAt: null, landingHeat: { not: null }, status: 'CONVERTED', createdAt: period, ...(ctx.scope === 'PJ' ? { originPjId: ctx.pjId ?? '__none__' } : {}) },
      _count: { _all: true },
    }),
    // Google orgânico x pago (todas as landings: das PJs e do builder)
    db.attributionSession.groupBy({ by: ['channel'], where: { organizationId: orgId, channel: { in: ['GOOGLE_ADS', 'GOOGLE_ORGANIC'] }, firstSeenAt: period, ...pjIdFilter }, _count: { _all: true } }),
    db.simulation.groupBy({ by: ['channel'], where: { organizationId: orgId, channel: { in: ['GOOGLE_ADS', 'GOOGLE_ORGANIC'] }, createdAt: period, ...pjIdFilter }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['source'], where: { organizationId: orgId, deletedAt: null, source: { in: ['GOOGLE_ADS', 'GOOGLE_ORGANIC'] }, createdAt: period, ...scopeLead(ctx) }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['source'], where: { organizationId: orgId, deletedAt: null, source: { in: ['GOOGLE_ADS', 'GOOGLE_ORGANIC'] }, landingHeat: 'QUENTE', createdAt: period, ...scopeLead(ctx) }, _count: { _all: true } }),
    db.opportunity.groupBy({
      by: ['source'],
      where: { organizationId: orgId, source: { in: ['GOOGLE_ADS', 'GOOGLE_ORGANIC'] }, status: 'WON', createdAt: period, ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}) },
      _count: { _all: true },
      _sum: { value: true },
    }),
  ]);

  // Cliques nos botões de contato da unidade (WhatsApp / ligar), por PJ.
  const contactClicks = await db.$queryRaw<{ pjId: string; type: string; n: number }[]>`
    SELECT s."pjId", e."type", COUNT(*)::int AS n
    FROM "AttributionEvent" e JOIN "AttributionSession" s ON s."id" = e."sessionId"
    WHERE e."organizationId" = ${orgId} AND e."type" IN ('WHATSAPP_CLICK', 'PHONE_CLICK')
      AND e."createdAt" >= ${opts.from} AND e."createdAt" <= ${opts.to} AND s."pjId" IS NOT NULL
    GROUP BY s."pjId", e."type"`;
  const clicks = (pjId: string, type: string) => contactClicks.find((c) => c.pjId === pjId && c.type === type)?.n ?? 0;

  const count = <T extends { _count: { _all: number } }>(rows: T[], pred: (r: T) => boolean) => rows.filter(pred).reduce((a, r) => a + r._count._all, 0);

  const byPj = pjs.map((pj) => {
    const simulations = count(sims, (r) => r.pjId === pj.id);
    const frio = count(sims, (r) => r.pjId === pj.id && r.heat === 'FRIO');
    const morno = count(leads, (r) => r.originPjId === pj.id && r.landingHeat === 'MORNO');
    const quente = count(leads, (r) => r.originPjId === pj.id && r.landingHeat === 'QUENTE');
    const conv = count(converted, (r) => r.originPjId === pj.id);
    return {
      ...pj,
      visits: count(visits, (r) => r.pjId === pj.id),
      simulations,
      frio,
      morno,
      quente,
      converted: conv,
      whatsappClicks: clicks(pj.id, 'WHATSAPP_CLICK'),
      phoneClicks: clicks(pj.id, 'PHONE_CLICK'),
      contactRate: simulations ? (morno + quente) / simulations : 0,
    };
  });

  const google = (['GOOGLE_ORGANIC', 'GOOGLE_ADS'] as Channel[]).map((ch) => {
    const leadsN = count(gLeads, (r) => r.source === ch);
    const won = gWon.find((r) => r.source === ch);
    return {
      channel: ch,
      label: CHANNEL_LABELS[ch],
      visits: count(gSessions, (r) => r.channel === ch),
      simulations: count(gSims, (r) => r.channel === ch),
      leads: leadsN,
      hot: count(gHot, (r) => r.source === ch),
      won: won?._count._all ?? 0,
      wonValue: won?._sum.value ?? 0,
    };
  });

  // Landing CENTRAL (sem PJ): simulações com temperatura e sem PJ; leads marcados como CENTRAL.
  let central = null as null | { simulations: number; frio: number; morno: number; quente: number; converted: number; contactRate: number };
  if (ctx.scope !== 'PJ') {
    const [cSims, cLeads, cConv] = await Promise.all([
      db.simulation.groupBy({ by: ['heat'], where: { organizationId: orgId, pjId: null, heat: { not: null }, createdAt: period }, _count: { _all: true } }),
      db.lead.groupBy({ by: ['landingHeat'], where: { organizationId: orgId, deletedAt: null, routingHint: 'CENTRAL', landingHeat: { not: null }, createdAt: period }, _count: { _all: true } }),
      db.lead.count({ where: { organizationId: orgId, deletedAt: null, routingHint: 'CENTRAL', status: 'CONVERTED', createdAt: period } }),
    ]);
    const simulations = count(cSims, () => true);
    const morno = count(cLeads, (r) => r.landingHeat === 'MORNO');
    const quente = count(cLeads, (r) => r.landingHeat === 'QUENTE');
    central = { simulations, frio: count(cSims, (r) => r.heat === 'FRIO'), morno, quente, converted: cConv, contactRate: simulations ? (morno + quente) / simulations : 0 };
  }

  const totals = [...byPj, ...(central ? [{ ...central, visits: 0 }] : [])].reduce(
    (a, r) => ({ visits: a.visits + r.visits, simulations: a.simulations + r.simulations, frio: a.frio + r.frio, morno: a.morno + r.morno, quente: a.quente + r.quente, converted: a.converted + r.converted }),
    { visits: 0, simulations: 0, frio: 0, morno: 0, quente: 0, converted: 0 }
  );

  return { byPj, central, google, totals };
}

function scopeLead(ctx: Ctx) {
  return ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {};
}
