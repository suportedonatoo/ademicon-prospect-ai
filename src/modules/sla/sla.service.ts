import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import type { Ctx } from '../auth/context';
import { assertCan, systemCtx } from '../auth/context';
import { getOrgSettings } from '../organizations/settings';
import { notifyConsultant, notifyRoles } from '../notifications/notification.service';
import { createTask } from '../tasks/task.service';

// SLA ENGINE
//  • Lead Response SLA: lead MORNO/QUENTE distribuído sem nenhuma resposta humana/IA no prazo.
//  • Handoff SLA: conversa transferida para humano e cliente sem resposta do consultor.
//  • Follow-up SLA: tarefas de follow-up vencidas (já coberto por task.overdue).
// Estouro → notifica o consultor; persistindo além de escalateAfterMinutes → gestor + tarefa.
// Idempotente: cada estouro gera um registro (AIEvent sla.breach) por entidade e nível.

export interface SlaBreach {
  kind: 'LEAD_RESPONSE' | 'HANDOFF';
  leadId: string;
  leadName: string;
  consultantId: string | null;
  pjId: string | null;
  conversationId?: string;
  minutes: number;
  level: 'WARN' | 'ESCALATED';
}

export async function findSlaBreaches(orgId: string, now = new Date(), scope: { pjId?: string | null; consultantId?: string | null } = {}): Promise<SlaBreach[]> {
  const s = (await getOrgSettings(orgId)).sla;
  const leadCut = new Date(now.getTime() - s.leadResponseMinutes * 60_000);
  const convCut = new Date(now.getTime() - s.handoffMinutes * 60_000);
  const pj = scope.pjId ? Prisma.sql`AND l."pjId" = ${scope.pjId}` : Prisma.empty;
  const own = scope.consultantId ? Prisma.sql`AND l."consultantId" = ${scope.consultantId}` : Prisma.empty;

  // Uma consulta por tipo (sem N+1): distribuído, morno/quente, sem ação humana desde a atribuição.
  const pending = await db.$queryRaw<{ id: string; name: string; consultantId: string; pjId: string | null; assignedAt: Date }[]>`
    SELECT l."id", l."name", l."consultantId", l."pjId", l."assignedAt"
    FROM "Lead" l
    WHERE l."organizationId" = ${orgId} AND l."deletedAt" IS NULL AND l."optOut" = false
      AND l."temperature" IN ('MORNO','QUENTE') AND l."status" IN ('ASSIGNED','QUALIFIED')
      AND l."consultantId" IS NOT NULL AND l."assignedAt" < ${leadCut} ${pj} ${own}
      AND NOT EXISTS (SELECT 1 FROM "LeadActivity" a WHERE a."leadId" = l."id" AND a."actorType" = 'USER' AND a."createdAt" > l."assignedAt")
      AND NOT EXISTS (SELECT 1 FROM "Message" m JOIN "Conversation" c ON c."id" = m."conversationId"
                      WHERE c."leadId" = l."id" AND m."direction" = 'OUTBOUND' AND m."senderType" = 'HUMAN' AND m."createdAt" > l."assignedAt")
    ORDER BY l."assignedAt" ASC
    LIMIT 300`;
  const breaches: SlaBreach[] = pending.map((l) => {
    const minutes = (now.getTime() - l.assignedAt.getTime()) / 60_000;
    return { kind: 'LEAD_RESPONSE', leadId: l.id, leadName: l.name, consultantId: l.consultantId, pjId: l.pjId, minutes, level: minutes >= s.leadResponseMinutes + s.escalateAfterMinutes ? 'ESCALATED' : 'WARN' };
  });

  // Handoff: conversa humana aberta cuja ÚLTIMA mensagem é do cliente, além do SLA.
  const convs = await db.$queryRaw<{ id: string; leadId: string; name: string; consultantId: string | null; pjId: string | null; lastAt: Date }[]>`
    SELECT c."id", c."leadId", l."name", l."consultantId", l."pjId", lm."createdAt" AS "lastAt"
    FROM "Conversation" c
    JOIN "Lead" l ON l."id" = c."leadId"
    JOIN LATERAL (SELECT m."direction", m."createdAt" FROM "Message" m WHERE m."conversationId" = c."id" ORDER BY m."createdAt" DESC LIMIT 1) lm ON true
    WHERE c."organizationId" = ${orgId} AND c."mode" = 'HUMAN' AND c."status" = 'OPEN' AND l."deletedAt" IS NULL
      AND lm."direction" = 'INBOUND' AND lm."createdAt" < ${convCut} ${pj} ${own}
    ORDER BY lm."createdAt" ASC
    LIMIT 300`;
  for (const c of convs) {
    const minutes = (now.getTime() - c.lastAt.getTime()) / 60_000;
    breaches.push({ kind: 'HANDOFF', leadId: c.leadId, leadName: c.name, consultantId: c.consultantId, pjId: c.pjId, conversationId: c.id, minutes, level: minutes >= s.handoffMinutes + s.escalateAfterMinutes ? 'ESCALATED' : 'WARN' });
  }
  return breaches.sort((a, b) => b.minutes - a.minutes);
}

/** Job: aplica notificação/escalonamento uma única vez por estouro e nível. */
export async function scanSla(orgId: string, now = new Date()) {
  const breaches = await findSlaBreaches(orgId, now);
  const ctx = systemCtx(orgId, 'SLA');
  let notified = 0;
  let escalated = 0;
  // Chaves já tratadas nos últimos 14 dias (uma única leitura, sem N+1).
  const seen = new Set(
    (await db.aIEvent.findMany({ where: { organizationId: orgId, type: 'sla.breach', createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }, select: { payload: true } })).map((e) => (e.payload as { key?: string }).key)
  );
  for (const b of breaches) {
    const key = `sla:${b.kind}:${b.conversationId ?? b.leadId}:${b.level}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await db.aIEvent.create({ data: { organizationId: orgId, type: 'sla.breach', payload: { key, ...b } } });
    const label = b.kind === 'HANDOFF' ? 'Cliente aguardando o consultor' : 'Lead sem primeiro atendimento';
    const link = b.conversationId ? `/conversas?c=${b.conversationId}` : `/leads/${b.leadId}`;
    if (b.consultantId) await notifyConsultant(orgId, b.consultantId, { type: b.level === 'ESCALATED' ? 'sla.critical' : 'sla.warning', category: 'SLA', priority: b.level === 'ESCALATED' ? 'CRITICAL' : 'HIGH', title: `SLA: ${label}`, body: `${b.leadName} · há ${Math.round(b.minutes)} min`, link, entityType: 'Lead', entityId: b.leadId, dedupeKey: key });
    notified++;
    if (b.level === 'ESCALATED') {
      await notifyRoles(orgId, ['MANAGER', 'PJ_MANAGER'], { type: 'sla.critical', category: 'SLA', priority: 'CRITICAL', title: `SLA estourado: ${label}`, body: `${b.leadName} · há ${Math.round(b.minutes)} min`, link, entityType: 'Lead', entityId: b.leadId, dedupeKey: key }, { pjId: b.pjId });
      await createTask(ctx, { type: 'CONTACT', title: `SLA estourado: ${b.leadName}`, description: `${label} há ${Math.round(b.minutes)} min.`, leadId: b.leadId, consultantId: b.consultantId, dueAt: new Date(now.getTime() + 30 * 60_000), priority: 'URGENT' }, 'AUTOMATION');
      await publish(orgId, 'sla.breached', { leadId: b.leadId, kind: b.kind, minutes: Math.round(b.minutes), consultantId: b.consultantId });
      escalated++;
    }
  }
  return { breaches: breaches.length, notified, escalated };
}

/** Visão para o Cockpit (escopo do usuário). */
export async function listSlaBreaches(ctx: Ctx) {
  assertCan(ctx, 'lead.read');
  return findSlaBreaches(ctx.orgId, new Date(), { pjId: ctx.scope === 'PJ' ? ctx.pjId : undefined, consultantId: ctx.scope === 'OWN' ? ctx.consultantId : undefined });
}
