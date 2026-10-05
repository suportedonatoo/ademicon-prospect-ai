import { authed } from '@/lib/api';
import { db } from '@/lib/db';
import { can } from '@/modules/auth/context';
import { conversationScope, leadScope, opportunityScope } from '@/modules/leads/scope';
import { listNotifications } from '@/modules/notifications/notification.service';

/**
 * GET /api/v1/extension/summary — resumo para a extensão "Ademicon Sales Assistant":
 * notificações recentes, leads quentes, conversas aguardando e oportunidades. Somente leitura.
 */
export const GET = authed({ device: true, rate: 120 }, async ({ ctx }) => {
  const [notifications, hot, waiting, opps] = await Promise.all([
    listNotifications(ctx, { status: 'all', take: 10 }),
    can(ctx, 'lead.read') ? db.lead.findMany({ where: { ...leadScope(ctx), temperature: 'QUENTE', status: { notIn: ['CONVERTED', 'LOST', 'BLOCKED'] }, optOut: false }, orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }], take: 8, select: { id: true, name: true, score: true, product: true } }) : Promise.resolve([]),
    can(ctx, 'conversation.read')
      ? db.conversation.findMany({ where: { ...conversationScope(ctx), status: 'OPEN', mode: 'HUMAN' }, orderBy: { lastMessageAt: 'desc' }, take: 20, select: { id: true, lastMessageAt: true, lead: { select: { name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { direction: true, createdAt: true } } } })
      : Promise.resolve([]),
    can(ctx, 'opportunity.read') ? db.opportunity.groupBy({ by: ['health'], where: { ...opportunityScope(ctx), status: 'OPEN' }, _count: { _all: true }, _sum: { value: true } }) : Promise.resolve([]),
  ]);
  return {
    user: { name: ctx.userName, role: ctx.roleKey },
    unread: notifications.unread,
    notifications: notifications.items.map((n) => ({ id: n.id, title: n.title, body: n.body, priority: n.priority, category: n.category, readAt: n.readAt, createdAt: n.createdAt, open: `/api/v1/notifications/${n.id}/open?via=extension` })),
    hotLeads: hot.map((l) => ({ ...l, open: `/leads/${l.id}` })),
    awaiting: waiting.filter((c) => c.messages[0]?.direction === 'INBOUND').map((c) => ({ id: c.id, leadName: c.lead.name, since: c.messages[0].createdAt, open: `/conversas?c=${c.id}` })),
    opportunities: { open: opps.reduce((s, o) => s + o._count._all, 0), value: opps.reduce((s, o) => s + (o._sum.value ?? 0), 0), stalled: opps.find((o) => o.health === 'STALLED')?._count._all ?? 0, atRisk: opps.find((o) => o.health === 'AT_RISK')?._count._all ?? 0 },
  };
});
