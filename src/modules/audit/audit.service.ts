import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { logger } from '@/lib/logger';

export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.denied'
  | 'lead.created'
  | 'lead.updated'
  | 'lead.merged'
  | 'lead.assigned'
  | 'lead.transferred'
  | 'lead.status_changed'
  | 'lead.deleted'
  | 'opportunity.created'
  | 'opportunity.stage_changed'
  | 'opportunity.closed'
  | 'ai.configured'
  | 'knowledge.changed'
  | 'campaign.changed'
  | 'landing.changed'
  | 'simulator.changed'
  | 'permission.changed'
  | 'user.changed'
  | 'routing.changed'
  | 'integration.changed'
  | 'whatsapp.changed'
  | 'import.executed'
  | 'export.executed'
  | 'privacy.changed'
  | 'settings.changed'
  | 'prospecting.research_run'
  | 'apikey.changed'
  | 'webhook.changed'
  | 'nba.resolved'
  | 'duplicate.resolved'
  | 'playbook.changed'
  | 'playbook.executed'
  | 'prompt.changed'
  | 'ai.eval_run'
  | 'experiment.changed'
  | 'flag.changed'
  | 'notification.preferences_changed'
  | 'notification.clicked'
  | 'device.connected'
  | 'device.revoked'
  | 'deep_link.created'
  | 'deep_link.used'
  | 'push.sent'
  | 'push.failed'
  | 'conversation.takeover'
  | 'conversation.ai_paused'
  | 'conversation.ai_resumed'
  | 'conversation.transferred'
  | 'conversation.closed'
  | 'recovery.executed'
  | 'insight.changed';

/** Registra uma ação relevante. Nunca derruba a operação principal. */
export async function audit(
  ctx: Ctx,
  action: AuditAction,
  entity?: { type: string; id?: string | null },
  metadata: Record<string, unknown> = {}
) {
  try {
    await db.auditLog.create({
      data: {
        organizationId: ctx.orgId,
        userId: ctx.userId,
        userName: ctx.userName,
        action,
        entityType: entity?.type,
        entityId: entity?.id ?? undefined,
        ip: ctx.ip ?? undefined,
        userAgent: ctx.userAgent?.slice(0, 250) ?? undefined,
        metadata: metadata as object,
      },
    });
  } catch (e) {
    logger.error('audit.write_failed', { action, error: String(e) });
  }
}

export async function listAudit(ctx: Ctx, opts: { action?: string; entityType?: string; page?: number; pageSize?: number } = {}) {
  assertCan(ctx, 'audit.read');
  const pageSize = Math.min(opts.pageSize ?? 50, 200);
  const page = Math.max(1, opts.page ?? 1);
  const where = {
    organizationId: ctx.orgId,
    ...(opts.action ? { action: opts.action } : {}),
    ...(opts.entityType ? { entityType: opts.entityType } : {}),
  };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

/**
 * Acesso negado (403): fica na trilha de auditoria. Na 5ª negativa do mesmo usuário em 10 minutos,
 * os Super Admins recebem um alerta (possível tentativa de elevar privilégio).
 */
export async function auditDenied(ctx: Ctx, info: { method: string; path: string; reason: string }) {
  await audit(ctx, 'auth.denied', undefined, info);
  if (!ctx.userId) return;
  try {
    const recent = await db.auditLog.count({ where: { organizationId: ctx.orgId, userId: ctx.userId, action: 'auth.denied', createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
    if (recent !== 5) return;
    const { notifyRoles } = await import('../notifications/notification.service');
    await notifyRoles(ctx.orgId, ['SUPER_ADMIN'], {
      type: 'security.denied',
      title: `Tentativas de acesso negadas: ${ctx.userName}`,
      body: `5 operações sem permissão em 10 minutos. Última: ${info.method} ${info.path}.`,
      link: '/admin/auditoria?action=auth.denied',
      priority: 'HIGH',
    });
  } catch (e) {
    logger.error('audit.denied_alert_failed', { error: String(e) });
  }
}
