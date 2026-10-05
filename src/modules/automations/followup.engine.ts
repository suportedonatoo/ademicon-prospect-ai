import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { systemCtx } from '../auth/context';
import { getOrgSettings } from '../organizations/settings';
import { createTask, flagOverdueTasks } from '../tasks/task.service';

/**
 * FOLLOW-UP ENGINE
 * Lead qualificado → consultor não atuou no prazo → tarefa criada → follow-up.
 * Cria TAREFAS para humanos; não dispara mensagens automáticas (respeita consentimento e limites).
 */
export async function scanFollowUps(orgId: string) {
  const settings = await getOrgSettings(orgId);
  if (!settings.followUp.enabled) return { created: 0, overdue: 0 };
  const cutoff = new Date(Date.now() - settings.followUp.hoursWithoutContact * 3600_000);

  const candidates = await db.lead.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      status: { in: ['ASSIGNED', 'QUALIFIED'] },
      consultantId: { not: null },
      assignedAt: { lt: cutoff },
      tasks: { none: { type: 'FOLLOW_UP', status: 'OPEN' } },
    },
    select: { id: true, name: true, consultantId: true, assignedAt: true },
    take: 200,
  });

  const ctx = systemCtx(orgId, 'Follow-up');
  let created = 0;
  for (const lead of candidates) {
    const touched = await db.leadActivity.count({ where: { leadId: lead.id, actorType: 'USER', createdAt: { gt: lead.assignedAt! } } });
    if (touched) continue;
    await createTask(
      ctx,
      {
        type: 'FOLLOW_UP',
        title: `Lead sem atendimento: ${lead.name}`,
        description: `Distribuído há mais de ${settings.followUp.hoursWithoutContact}h sem interação registrada.`,
        leadId: lead.id,
        consultantId: lead.consultantId,
        dueAt: new Date(Date.now() + 2 * 3600_000),
        priority: 'HIGH',
      },
      'FOLLOW_UP'
    );
    await publish(orgId, 'lead.unattended', { leadId: lead.id, consultantId: lead.consultantId, hours: settings.followUp.hoursWithoutContact });
    created++;
  }
  const overdue = await flagOverdueTasks(orgId);
  return { created, overdue };
}
