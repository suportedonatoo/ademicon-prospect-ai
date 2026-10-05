import { QUALIFIED_LEAD_WHERE } from '../leads/catalog';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { classifyChannel } from './channel';
import { signalFromTracking } from '../lead-intelligence/signal-detector';

/**
 * AttributionEngine — rastreia a jornada:
 * Source → Medium → Campaign → Content → Term → Landing → Lead → Consultor → Opportunity → Conversion
 */

export const trackInput = z.object({
  slug: z.string().max(80),
  sessionKey: z.string().max(100).optional().nullable(),
  utm_source: z.string().max(100).optional().nullable(),
  utm_medium: z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(100).optional().nullable(),
  utm_content: z.string().max(100).optional().nullable(),
  utm_term: z.string().max(100).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  gbraid: z.string().max(200).optional().nullable(),
  wbraid: z.string().max(200).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
  event: z.enum(['PAGE_VIEW', 'SIMULATION_STARTED', 'WHATSAPP_CLICK', 'PHONE_CLICK']).default('PAGE_VIEW'),
});

export type VisitInput = Omit<z.infer<typeof trackInput>, 'slug'>;

/**
 * Registra uma visita/interação: cria a AttributionSession na primeira visita (com o CANAL já
 * classificado — Google pago x orgânico etc.) e grava o evento. Usado pelas landings do builder
 * e pelo serviço de landing das PJs.
 */
export async function recordVisit(orgId: string, t: VisitInput, where: { landingPageId?: string | null; pjId?: string | null }) {
  let session = t.sessionKey ? await db.attributionSession.findUnique({ where: { sessionKey: t.sessionKey } }) : null;
  if (session && session.organizationId !== orgId) session = null;
  const adClick = t.gclid ?? t.gbraid ?? t.wbraid ?? null;
  const channel = classifyChannel(t);
  if (!session) {
    session = await db.attributionSession.create({
      data: {
        organizationId: orgId,
        sessionKey: t.sessionKey && t.sessionKey.length >= 16 ? t.sessionKey : crypto.randomUUID(),
        landingPageId: where.landingPageId ?? null,
        pjId: where.pjId ?? null,
        source: t.utm_source ?? (adClick ? 'google' : t.fbclid ? 'meta' : channel === 'GOOGLE_ORGANIC' ? 'google' : null),
        medium: t.utm_medium ?? (adClick || t.fbclid ? 'cpc' : channel === 'GOOGLE_ORGANIC' ? 'organic' : null),
        campaign: t.utm_campaign,
        content: t.utm_content,
        term: t.utm_term,
        referrer: t.referrer,
        gclid: adClick,
        fbclid: t.fbclid,
        channel,
      },
    });
  } else {
    await db.attributionSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  const campaign = session.campaign ? await db.campaign.findFirst({ where: { organizationId: orgId, utmCampaign: session.campaign }, select: { id: true } }) : null;
  const previousViews = session.leadId && t.event === 'PAGE_VIEW' ? await db.attributionEvent.count({ where: { sessionId: session.id, type: 'PAGE_VIEW', createdAt: { lt: new Date(Date.now() - 30 * 60_000) } } }) : 0;
  await db.attributionEvent.create({ data: { organizationId: orgId, sessionId: session.id, type: t.event, campaignId: campaign?.id, leadId: session.leadId } });
  // Visitante já identificado (lead) → sinal de compra (voltou ao site, clicou no WhatsApp…)
  if (session.leadId) {
    const signal = signalFromTracking(t.event, { sessionsBefore: previousViews });
    if (signal) {
      const { recordBuyingSignal } = await import('../lead-intelligence/intelligence-v2.service');
      const created = await recordBuyingSignal(orgId, session.leadId, signal, 'TRACKING');
      if (created) {
        const { enqueue } = await import('@/lib/queue');
        await enqueue('intelligence.refresh', { orgId, leadId: session.leadId }, { jobId: `intel:${session.leadId}:${Math.floor(Date.now() / 60_000)}` });
      }
    }
  }
  return session;
}

/** Registro público de visita/interação na landing do builder. */
export async function track(raw: unknown) {
  const t = trackInput.parse(raw);
  const page = await db.landingPage.findUnique({ where: { slug: t.slug }, select: { id: true, organizationId: true, status: true } });
  if (!page) return { sessionKey: null };
  const session = await recordVisit(page.organizationId, t, { landingPageId: page.id });
  if (t.event === 'PAGE_VIEW') await db.landingPage.update({ where: { id: page.id }, data: { views: { increment: 1 } } });
  return { sessionKey: session.sessionKey };
}

/** Funil de atribuição por fonte/campanha (valores agregados, sem N+1). */
export async function attributionReport(ctx: Ctx, opts: { from?: Date; to?: Date } = {}) {
  assertCan(ctx, 'attribution.read');
  const createdAt = { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) };
  const [bySource, qualifiedBySource, oppsBySource, wonBySource, sessions, events] = await Promise.all([
    db.lead.groupBy({ by: ['source'], where: { organizationId: ctx.orgId, deletedAt: null, createdAt }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['source'], where: { organizationId: ctx.orgId, deletedAt: null, createdAt, ...QUALIFIED_LEAD_WHERE }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['source'], where: { organizationId: ctx.orgId, createdAt }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['source'], where: { organizationId: ctx.orgId, createdAt, status: 'WON' }, _count: { _all: true }, _sum: { value: true } }),
    db.attributionSession.count({ where: { organizationId: ctx.orgId, firstSeenAt: createdAt } }),
    db.attributionEvent.groupBy({ by: ['type'], where: { organizationId: ctx.orgId, createdAt }, _count: { _all: true } }),
  ]);
  const rows = bySource
    .map((s) => {
      const src = s.source;
      const won = wonBySource.find((w) => w.source === src);
      return {
        source: src,
        leads: s._count._all,
        qualified: qualifiedBySource.find((q) => q.source === src)?._count._all ?? 0,
        opportunities: oppsBySource.find((o) => o.source === src)?._count._all ?? 0,
        conversions: won?._count._all ?? 0,
        revenue: won?._sum.value ?? 0,
      };
    })
    .sort((a, b) => b.leads - a.leads);
  return { rows, sessions, events: Object.fromEntries(events.map((e) => [e.type, e._count._all])) };
}

/** Jornadas recentes (lead a lead) para inspeção. */
export async function recentJourneys(ctx: Ctx, take = 20) {
  assertCan(ctx, 'attribution.read');
  const sessions = await db.attributionSession.findMany({
    where: { organizationId: ctx.orgId, leadId: { not: null } },
    orderBy: { lastSeenAt: 'desc' },
    take,
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  const leadIds = sessions.map((s) => s.leadId!).filter(Boolean);
  const leads = await db.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, name: true, source: true, status: true, consultant: { select: { name: true } }, campaign: { select: { name: true } }, landingPage: { select: { name: true } }, opportunities: { select: { status: true, value: true } } },
  });
  // Eventos pós-sessão (qualificação, consultor, oportunidade, conversão) são ligados ao lead.
  const leadEvents = await db.attributionEvent.findMany({ where: { organizationId: ctx.orgId, leadId: { in: leadIds }, sessionId: null }, orderBy: { createdAt: 'asc' } });
  return sessions.map((s) => ({
    session: { ...s, events: [...s.events, ...leadEvents.filter((e) => e.leadId === s.leadId)].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) },
    lead: leads.find((l) => l.id === s.leadId),
  }));
}

/**
 * ATTRIBUTION 2.0 — crédito das CONVERSÕES (oportunidades ganhas no período) entre os canais que
 * tocaram o lead: sessões de landing (canal classificado) + registros de origem do lead (LeadSource).
 * Calcula os 5 modelos lado a lado para comparação; `model` define o destaque.
 */
export async function multiTouchAttribution(ctx: Ctx, opts: { from: Date; to: Date }) {
  assertCan(ctx, 'attribution.read');
  const { opportunityScope } = await import('../leads/scope');
  const { ATTRIBUTION_MODELS, creditFor, dedupeTouches } = await import('./models');
  const won = await db.opportunity.findMany({
    where: { ...opportunityScope(ctx), status: 'WON', closedAt: { gte: opts.from, lte: opts.to } },
    select: { id: true, leadId: true, value: true, closedAt: true },
    take: 5000,
  });
  const leadIds = [...new Set(won.map((o) => o.leadId))];
  const [sessions, sources] = await Promise.all([
    db.attributionSession.findMany({ where: { organizationId: ctx.orgId, leadId: { in: leadIds } }, select: { leadId: true, channel: true, source: true, firstSeenAt: true } }),
    db.leadSource.findMany({ where: { organizationId: ctx.orgId, leadId: { in: leadIds } }, select: { leadId: true, source: true, receivedAt: true } }),
  ]);
  const touchesByLead = new Map<string, { channel: string; at: Date }[]>();
  const push = (leadId: string | null, channel: string, at: Date) => {
    if (!leadId) return;
    const list = touchesByLead.get(leadId) ?? [];
    list.push({ channel, at });
    touchesByLead.set(leadId, list);
  };
  for (const s of sessions) push(s.leadId, s.channel && s.channel !== 'LANDING' ? s.channel : (s.source ?? 'LANDING').toUpperCase(), s.firstSeenAt);
  for (const s of sources) push(s.leadId, s.source, s.receivedAt);

  const models = Object.keys(ATTRIBUTION_MODELS) as (keyof typeof ATTRIBUTION_MODELS)[];
  const table = new Map<string, Record<string, { conversions: number; revenue: number }>>();
  let withoutTouches = 0;
  for (const o of won) {
    const touches = dedupeTouches(touchesByLead.get(o.leadId) ?? []);
    if (!touches.length) {
      withoutTouches++;
      continue;
    }
    for (const m of models) {
      for (const [channel, share] of creditFor(touches, m, o.closedAt ?? opts.to)) {
        const row = table.get(channel) ?? {};
        const cell = row[m] ?? { conversions: 0, revenue: 0 };
        cell.conversions += share;
        cell.revenue += share * o.value;
        row[m] = cell;
        table.set(channel, row);
      }
    }
  }
  const rows = [...table.entries()]
    .map(([channel, byModel]) => ({
      channel,
      byModel: Object.fromEntries(models.map((m) => [m, { conversions: Math.round((byModel[m]?.conversions ?? 0) * 100) / 100, revenue: Math.round(byModel[m]?.revenue ?? 0) }])),
    }))
    .sort((a, b) => b.byModel.LINEAR.revenue - a.byModel.LINEAR.revenue);
  return { conversions: won.length, withoutTouches, models: ATTRIBUTION_MODELS, rows };
}
