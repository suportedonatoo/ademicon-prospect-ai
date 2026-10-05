import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { logger } from '@/lib/logger';

export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
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
