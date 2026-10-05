import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { NotFound } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { emitToUser } from '@/lib/realtime';
import type { Ctx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { isQuietNow, quietEndsAt } from './quiet-hours';

// NOTIFICATION CENTER — serviço central (único) de notificações.
//
// Fluxo: evento → preferência do usuário (categoria × canal) → horário de silêncio → persistência
// (IN_APP, com dedupeKey) → tempo real (SSE: sino + notificação DESKTOP/EXTENSÃO) → PUSH (Web Push,
// via fila) → E-MAIL (provider). Nenhum canal é "fingido": sem configuração, ele fica desativado.

export const NOTIFICATION_CHANNELS = ['IN_APP', 'DESKTOP', 'PUSH', 'EXTENSION', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type NotificationCategory = 'LEAD' | 'CONVERSATION' | 'OPPORTUNITY' | 'TASK' | 'SLA' | 'SYSTEM';

/** Chaves de preferência (tela Preferências). O `type` da notificação é mapeado para uma delas. */
export const PREFERENCE_KEYS = {
  'lead.hot': { label: 'Lead quente', group: 'Leads', defaults: ['IN_APP', 'DESKTOP', 'PUSH', 'EXTENSION'] },
  'lead.qualified': { label: 'Lead qualificado / distribuído para mim', group: 'Leads', defaults: ['IN_APP', 'DESKTOP', 'EXTENSION'] },
  'lead.warm': { label: 'Lead morno', group: 'Leads', defaults: ['IN_APP'] },
  'lead.cold': { label: 'Lead frio / novo lead', group: 'Leads', defaults: [] },
  'conversation.message': { label: 'Nova mensagem de cliente', group: 'Conversas', defaults: ['IN_APP', 'DESKTOP', 'PUSH', 'EXTENSION'] },
  'conversation.consultant_request': { label: 'Cliente pediu consultor', group: 'Conversas', defaults: ['IN_APP', 'DESKTOP', 'PUSH', 'EXTENSION'] },
  'conversation.transfer': { label: 'Transferência de conversa', group: 'Conversas', defaults: ['IN_APP', 'DESKTOP', 'PUSH', 'EXTENSION'] },
  sla: { label: 'Alertas de SLA', group: 'Conversas', defaults: ['IN_APP', 'DESKTOP', 'PUSH', 'EXTENSION'] },
  opportunity: { label: 'Oportunidades (nova / parada)', group: 'Sistema', defaults: ['IN_APP', 'DESKTOP'] },
  task: { label: 'Tarefas atribuídas / vencidas', group: 'Sistema', defaults: ['IN_APP', 'DESKTOP', 'EXTENSION'] },
  integration: { label: 'Integrações offline', group: 'Sistema', defaults: ['IN_APP', 'DESKTOP'] },
  'system.critical': { label: 'Erro crítico', group: 'Sistema', defaults: ['IN_APP', 'DESKTOP', 'PUSH', 'EMAIL'] },
} as const satisfies Record<string, { label: string; group: string; defaults: NotificationChannel[] }>;
export type PreferenceKey = keyof typeof PREFERENCE_KEYS;

/** Mapeia o tipo técnico da notificação para a chave de preferência. */
export function preferenceKeyFor(type: string): PreferenceKey {
  if (type === 'lead.hot' || type === 'lead.high_intent') return 'lead.hot';
  if (type === 'lead.assigned' || type === 'lead.qualified' || type === 'lead.reactivated') return 'lead.qualified';
  if (type === 'lead.warm') return 'lead.warm';
  if (type.startsWith('lead.')) return 'lead.cold';
  if (type === 'conversation.consultant_request' || type === 'ai.handoff') return 'conversation.consultant_request';
  if (type === 'conversation.transfer' || type === 'conversation.handoff') return 'conversation.transfer';
  if (type.startsWith('conversation.')) return 'conversation.message';
  if (type.startsWith('sla.')) return 'sla';
  if (type.startsWith('opportunity.')) return 'opportunity';
  if (type.startsWith('task.') || type === 'automation') return 'task';
  if (type.startsWith('integration.')) return 'integration';
  if (type === 'system.critical') return 'system.critical';
  return 'task';
}

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  entityType?: string;
  entityId?: string;
  /** Mesmo evento para o mesmo usuário não gera duas notificações. */
  dedupeKey?: string;
}

const CATEGORY_BY_PREFIX: [string, NotificationCategory][] = [
  ['lead.', 'LEAD'],
  ['conversation.', 'CONVERSATION'],
  ['ai.handoff', 'CONVERSATION'],
  ['opportunity.', 'OPPORTUNITY'],
  ['task.', 'TASK'],
  ['automation', 'TASK'],
  ['sla.', 'SLA'],
];
const categoryFor = (type: string): NotificationCategory => CATEGORY_BY_PREFIX.find(([p]) => type.startsWith(p))?.[1] ?? 'SYSTEM';

type Prefs = { matrix: Record<string, NotificationChannel[]>; quietEnabled: boolean; quietStart: string; quietEnd: string; quietBypass: string[]; hideSensitiveOnLockScreen: boolean };

export function defaultMatrix(): Record<PreferenceKey, NotificationChannel[]> {
  return Object.fromEntries(Object.entries(PREFERENCE_KEYS).map(([k, v]) => [k, [...v.defaults]])) as Record<PreferenceKey, NotificationChannel[]>;
}

async function loadPrefs(userId: string): Promise<Prefs> {
  const p = await db.notificationPreference.findUnique({ where: { userId } });
  const matrix = { ...defaultMatrix(), ...((p?.matrix as Record<string, NotificationChannel[]>) ?? {}) };
  return { matrix, quietEnabled: p?.quietEnabled ?? false, quietStart: p?.quietStart ?? '22:00', quietEnd: p?.quietEnd ?? '07:00', quietBypass: p?.quietBypass ?? ['lead.hot', 'sla.critical', 'system.critical'], hideSensitiveOnLockScreen: p?.hideSensitiveOnLockScreen ?? true };
}

/** Canais efetivos para um usuário/notificação (IN_APP sempre — é o registro auditável). */
export function resolveChannels(prefs: Pick<Prefs, 'matrix'>, type: string, priority: NotificationPriority): NotificationChannel[] {
  const key = preferenceKeyFor(type);
  const chosen = new Set<NotificationChannel>(prefs.matrix[key] ?? []);
  chosen.add('IN_APP');
  if (priority === 'CRITICAL' && key === 'system.critical') chosen.add('DESKTOP');
  return NOTIFICATION_CHANNELS.filter((c) => chosen.has(c));
}

export async function notifyUser(orgId: string, userId: string, n: NotificationInput) {
  try {
    const prefs = await loadPrefs(userId);
    const priority = n.priority ?? 'NORMAL';
    const channels = resolveChannels(prefs, n.type, priority);
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } });
    const now = new Date();
    const bypass = priority === 'CRITICAL' || prefs.quietBypass.includes(n.type) || prefs.quietBypass.includes(preferenceKeyFor(n.type));
    const heldUntil = prefs.quietEnabled && !bypass ? quietEndsAt(now, prefs.quietStart, prefs.quietEnd, org?.timezone) : null;

    if (n.dedupeKey && (await db.notification.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: n.dedupeKey } }, select: { id: true } }))) return null;
    let created;
    try {
      created = await db.notification.create({
        data: {
          organizationId: orgId,
          userId,
          type: n.type,
          category: n.category ?? categoryFor(n.type),
          priority,
          title: n.title.slice(0, 200),
          body: n.body?.slice(0, 500),
          link: n.link,
          entityType: n.entityType,
          entityId: n.entityId,
          dedupeKey: n.dedupeKey,
          heldUntil,
          channels,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null; // duplicada
      throw e;
    }
    // Retida pelo silêncio: fica no centro (in-app), mas sem alerta/push até liberar.
    if (!heldUntil) await dispatch(created.id, channels, prefs);
    return created;
  } catch (e) {
    logger.error('notification.failed', { userId, type: n.type, error: String(e) });
    return null;
  }
}

/** Tempo real + push + e-mail para uma notificação já persistida. */
async function dispatch(notificationId: string, channels: NotificationChannel[], prefs?: Prefs) {
  const n = await db.notification.findUnique({ where: { id: notificationId } });
  if (!n) return;
  const p = prefs ?? (await loadPrefs(n.userId));
  emitToUser(n.userId, {
    type: 'notification',
    data: {
      id: n.id,
      type: n.type,
      category: n.category,
      priority: n.priority,
      title: n.title,
      body: n.body,
      link: n.link ? `/api/v1/notifications/${n.id}/open` : null,
      desktop: channels.includes('DESKTOP'),
      extension: channels.includes('EXTENSION'),
      createdAt: n.createdAt,
    },
  });
  await db.notification.update({ where: { id: n.id }, data: { deliveredAt: new Date() } });
  if (channels.includes('PUSH')) {
    const devices = await db.userDevice.count({ where: { userId: n.userId, status: 'ACTIVE', pushEndpoint: { not: null } } });
    if (devices) {
      const { enqueue } = await import('@/lib/queue');
      await enqueue('push.send', { notificationId: n.id, hideSensitive: p.hideSensitiveOnLockScreen });
    }
  }
  if (channels.includes('EMAIL') && env.EMAIL_PROVIDER === 'log') {
    // EmailProvider de desenvolvimento: registra, não envia. Produção exige provider configurado.
    logger.info('email.log_provider', { to: n.userId, subject: n.title });
  }
}

/** Job: libera notificações retidas cujo horário de silêncio terminou. */
export async function releaseHeldNotifications(now = new Date()) {
  const held = await db.notification.findMany({ where: { heldUntil: { lte: now }, deliveredAt: null }, take: 500, select: { id: true, channels: true } });
  for (const h of held) {
    await db.notification.update({ where: { id: h.id }, data: { heldUntil: null } });
    await dispatch(h.id, h.channels as NotificationChannel[]);
  }
  return { released: held.length };
}

export async function notifyConsultant(orgId: string, consultantId: string, n: NotificationInput) {
  const user = await db.user.findFirst({ where: { organizationId: orgId, consultantId, status: 'ACTIVE' }, select: { id: true } });
  if (user) return notifyUser(orgId, user.id, n);
  return null;
}

export async function notifyRoles(orgId: string, roleKeys: string[], n: NotificationInput, opts: { pjId?: string | null } = {}) {
  const users = await db.user.findMany({
    where: {
      organizationId: orgId,
      status: 'ACTIVE',
      role: { key: { in: roleKeys } },
      ...(opts.pjId ? { OR: [{ pjId: opts.pjId }, { role: { key: { notIn: ['PJ_MANAGER'] } } }] } : {}),
    },
    select: { id: true },
  });
  await Promise.all(users.map((u) => notifyUser(orgId, u.id, n)));
}

// ───────────── Central de notificações (API do usuário) ─────────────

export const listSchema = z.object({
  status: z.enum(['all', 'unread', 'read']).default('all'),
  category: z.string().optional(),
  priority: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

export async function listNotifications(ctx: Ctx, raw: unknown = {}) {
  if (!ctx.userId) return { items: [], unread: 0, nextCursor: null };
  const f = listSchema.parse(raw ?? {});
  const where: Prisma.NotificationWhereInput = {
    userId: ctx.userId,
    organizationId: ctx.orgId,
    ...(f.status === 'unread' ? { readAt: null } : f.status === 'read' ? { readAt: { not: null } } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(f.priority ? { priority: f.priority } : {}),
  };
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: f.take + 1, ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}) }),
    db.notification.count({ where: { userId: ctx.userId, organizationId: ctx.orgId, readAt: null } }),
  ]);
  const hasMore = items.length > f.take;
  return { items: items.slice(0, f.take), unread, nextCursor: hasMore ? items[f.take - 1].id : null };
}

export async function markAllRead(ctx: Ctx) {
  if (!ctx.userId) return;
  await db.notification.updateMany({ where: { userId: ctx.userId, organizationId: ctx.orgId, readAt: null }, data: { readAt: new Date() } });
}

export async function markRead(ctx: Ctx, id: string) {
  if (!ctx.userId) return;
  const r = await db.notification.updateMany({ where: { id, userId: ctx.userId, organizationId: ctx.orgId, readAt: null }, data: { readAt: new Date() } });
  return { updated: r.count };
}

/** Clique (sino, desktop, push, extensão): marca lida + clicada e devolve o destino. */
export async function openNotification(ctx: Ctx, id: string, via: string) {
  if (!ctx.userId) throw NotFound('Notificação');
  const n = await db.notification.findFirst({ where: { id, userId: ctx.userId, organizationId: ctx.orgId } });
  if (!n) throw NotFound('Notificação');
  const now = new Date();
  await db.notification.update({ where: { id }, data: { clickedAt: n.clickedAt ?? now, readAt: n.readAt ?? now } });
  if (!n.clickedAt) await audit(ctx, 'notification.clicked', { type: 'Notification', id }, { via, type: n.type });
  // Destino sempre interno (evita open redirect).
  const link = n.link && n.link.startsWith('/') && !n.link.startsWith('//') ? n.link : '/notificacoes';
  return { link };
}

// ───────────── Preferências ─────────────

export const preferencesInput = z.object({
  matrix: z.record(z.array(z.enum(NOTIFICATION_CHANNELS))).optional(),
  quietEnabled: z.boolean().optional(),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  quietBypass: z.array(z.string().max(60)).max(20).optional(),
  hideSensitiveOnLockScreen: z.boolean().optional(),
});

export async function getPreferences(ctx: Ctx) {
  if (!ctx.userId) throw NotFound('Usuário');
  const p = await loadPrefs(ctx.userId);
  return { ...p, keys: PREFERENCE_KEYS, channels: NOTIFICATION_CHANNELS, pushConfigured: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY), emailConfigured: env.EMAIL_PROVIDER !== 'none' };
}

export async function updatePreferences(ctx: Ctx, raw: unknown) {
  if (!ctx.userId) throw NotFound('Usuário');
  const input = preferencesInput.parse(raw);
  const allowed = new Set(Object.keys(PREFERENCE_KEYS));
  const matrix = input.matrix ? Object.fromEntries(Object.entries(input.matrix).filter(([k]) => allowed.has(k))) : undefined;
  const before = await db.notificationPreference.findUnique({ where: { userId: ctx.userId } });
  const data = { ...(matrix ? { matrix } : {}), ...(input.quietEnabled != null ? { quietEnabled: input.quietEnabled } : {}), ...(input.quietStart ? { quietStart: input.quietStart } : {}), ...(input.quietEnd ? { quietEnd: input.quietEnd } : {}), ...(input.quietBypass ? { quietBypass: input.quietBypass } : {}), ...(input.hideSensitiveOnLockScreen != null ? { hideSensitiveOnLockScreen: input.hideSensitiveOnLockScreen } : {}) };
  await db.notificationPreference.upsert({ where: { userId: ctx.userId }, create: { organizationId: ctx.orgId, userId: ctx.userId, ...data }, update: data });
  await audit(ctx, 'notification.preferences_changed', { type: 'NotificationPreference', id: ctx.userId }, { before: before ? { quietEnabled: before.quietEnabled, quietStart: before.quietStart, quietEnd: before.quietEnd } : null, after: data });
  return getPreferences(ctx);
}

export async function isUserInQuietHours(userId: string, timeZone?: string) {
  const p = await loadPrefs(userId);
  return p.quietEnabled && isQuietNow(new Date(), p.quietStart, p.quietEnd, timeZone);
}

// ───────────── Notification Intelligence ─────────────

/** EVENTO → NOTIFICAÇÃO → ENTREGA → ABERTURA → AÇÃO. Ação = atividade/mensagem do usuário na entidade até 2h após o clique. */
export async function notificationMetrics(ctx: Ctx, from: Date, to: Date) {
  const scopeUser = ctx.scope === 'ORG' ? {} : { userId: ctx.userId ?? '__none__' };
  const where = { organizationId: ctx.orgId, createdAt: { gte: from, lte: to }, ...scopeUser };
  const [total, delivered, clicked, read, byType, pushOk, pushFail] = await Promise.all([
    db.notification.count({ where }),
    db.notification.count({ where: { ...where, deliveredAt: { not: null } } }),
    db.notification.count({ where: { ...where, clickedAt: { not: null } } }),
    db.notification.count({ where: { ...where, readAt: { not: null } } }),
    db.notification.groupBy({ by: ['type'], where, _count: { _all: true } }),
    db.auditLog.count({ where: { organizationId: ctx.orgId, action: 'push.sent', createdAt: { gte: from, lte: to } } }),
    db.auditLog.count({ where: { organizationId: ctx.orgId, action: 'push.failed', createdAt: { gte: from, lte: to } } }),
  ]);
  const [row] = await db.$queryRaw<{ acted: number; avgMinutes: number | null }[]>`
    SELECT COUNT(*) FILTER (WHERE a.first_action IS NOT NULL)::int AS acted,
           AVG(EXTRACT(EPOCH FROM (a.first_action - a."clickedAt")) / 60)::float AS "avgMinutes"
    FROM (
      SELECT n."clickedAt",
        (SELECT MIN(la."createdAt") FROM "LeadActivity" la
          WHERE n."entityType" = 'Lead' AND la."leadId" = n."entityId" AND la."actorType" = 'USER'
            AND la."createdAt" BETWEEN n."clickedAt" AND n."clickedAt" + interval '2 hours') AS first_action
      FROM "Notification" n
      WHERE n."organizationId" = ${ctx.orgId} AND n."clickedAt" IS NOT NULL AND n."createdAt" BETWEEN ${from} AND ${to}
        ${ctx.scope === 'ORG' ? Prisma.empty : Prisma.sql`AND n."userId" = ${ctx.userId ?? '__none__'}`}
    ) a`;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    total,
    delivered,
    read,
    clicked,
    acted: row?.acted ?? 0,
    deliveryRate: pct(delivered, total),
    openRate: pct(read, total),
    clickRate: pct(clicked, total),
    actionRate: pct(row?.acted ?? 0, clicked),
    avgMinutesToAction: row?.avgMinutes ?? null,
    push: { sent: pushOk, failed: pushFail },
    byType: byType.map((b) => ({ key: b.type, value: b._count._all })).sort((a, b) => b.value - a.value),
  };
}
