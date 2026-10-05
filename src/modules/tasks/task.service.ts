import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { taskScope } from '../leads/scope';
import { notifyConsultant } from '../notifications/notification.service';

export const TASK_TYPES = { CONTACT: 'Contato', FOLLOW_UP: 'Follow-up', CALLBACK: 'Retorno', PROPOSAL: 'Proposta', MEETING: 'Reunião' } as const;
export const PRIORITIES = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', URGENT: 'Urgente' } as const;

export const taskInput = z.object({
  type: z.enum(['CONTACT', 'FOLLOW_UP', 'CALLBACK', 'PROPOSAL', 'MEETING']),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().nullable(),
  leadId: z.string().optional().nullable(),
  opportunityId: z.string().optional().nullable(),
  consultantId: z.string().optional().nullable(),
  dueAt: z.coerce.date(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
});

export async function listTasks(ctx: Ctx, opts: { status?: string; mine?: boolean; overdue?: boolean } = {}) {
  assertCan(ctx, 'task.read');
  return db.task.findMany({
    where: {
      ...taskScope(ctx),
      status: opts.status ?? 'OPEN',
      ...(opts.mine ? { OR: [{ assigneeUserId: ctx.userId }, { consultantId: ctx.consultantId ?? '__none__' }] } : {}),
      ...(opts.overdue ? { dueAt: { lt: new Date() } } : {}),
    },
    include: { lead: { select: { id: true, name: true } }, opportunity: { select: { id: true, code: true } } },
    orderBy: [{ dueAt: 'asc' }],
    take: 300,
  });
}

export async function createTask(ctx: Ctx, raw: unknown, origin: 'MANUAL' | 'AUTOMATION' | 'FOLLOW_UP' = 'MANUAL') {
  assertCan(ctx, 'task.create');
  const input = taskInput.parse(raw);
  let consultantId = input.consultantId ?? null;
  if (!consultantId && input.leadId) consultantId = (await db.lead.findFirst({ where: { id: input.leadId, organizationId: ctx.orgId }, select: { consultantId: true } }))?.consultantId ?? null;
  if (!consultantId) consultantId = ctx.consultantId;
  const task = await db.task.create({
    data: { organizationId: ctx.orgId, ...input, consultantId, assigneeUserId: consultantId ? null : ctx.userId, origin },
  });
  if (consultantId && consultantId !== ctx.consultantId) {
    await notifyConsultant(ctx.orgId, consultantId, { type: 'task.created', title: `Nova tarefa: ${task.title}`, body: `Prazo ${task.dueAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, link: '/tarefas', entityType: task.leadId ? 'Lead' : 'Task', entityId: task.leadId ?? task.id, dedupeKey: `task:${task.id}` });
  }
  return task;
}

export async function setTaskStatus(ctx: Ctx, id: string, status: 'OPEN' | 'DONE' | 'CANCELED') {
  assertCan(ctx, 'task.update');
  const task = await db.task.findFirst({ where: { ...taskScope(ctx), id } });
  if (!task) throw NotFound('Tarefa');
  const updated = await db.task.update({ where: { id }, data: { status, completedAt: status === 'DONE' ? new Date() : null } });
  if (status === 'DONE' && task.leadId) {
    await db.leadActivity.create({ data: { organizationId: ctx.orgId, leadId: task.leadId, type: 'TASK_DONE', description: `Tarefa concluída: ${task.title}`, actorType: 'USER', actorId: ctx.userId } });
  }
  return updated;
}

/** Marca tarefas vencidas (notificação única por tarefa). Chamado pelo job de follow-up. */
export async function flagOverdueTasks(orgId: string) {
  const overdue = await db.task.findMany({ where: { organizationId: orgId, status: 'OPEN', dueAt: { lt: new Date() }, priority: { not: 'URGENT' } }, take: 200 });
  for (const t of overdue) {
    await db.task.update({ where: { id: t.id }, data: { priority: 'URGENT' } });
    if (t.consultantId) await notifyConsultant(orgId, t.consultantId, { type: 'task.overdue', priority: 'HIGH', title: `Tarefa atrasada: ${t.title}`, link: '/tarefas', entityType: t.leadId ? 'Lead' : 'Task', entityId: t.leadId ?? t.id, dedupeKey: `overdue:${t.id}` });
    await publish(orgId, 'task.overdue', { taskId: t.id, leadId: t.leadId });
  }
  return overdue.length;
}
