import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getRedis } from '@/lib/redis';
import { realtimeConnections, realtimeTransport } from '@/lib/realtime';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { getOrgSettings } from '../organizations/settings';
import { assessCapacity, CAPACITY_LABEL, type CapacityState } from '../consultants/capacity-engine';
import { listSlaBreaches } from '../sla/sla.service';
import { providerStatuses } from '../integrations/registry';
import { pushConfigured } from '../notifications/push.service';

// CAPACITY INTELLIGENCE · SUPERVISOR COCKPIT · OPERATION HEALTH CENTER
// Todo status é DERIVADO de métricas reais consultadas agora — nada é fixo na tela.

const OPEN_LEAD_STATUSES = ['ASSIGNED', 'IN_CONVERSATION', 'QUALIFIED', 'OPPORTUNITY'] as const;

export async function consultantCapacity(ctx: Ctx) {
  assertCan(ctx, 'consultant.read');
  const settings = await getOrgSettings(ctx.orgId);
  const consultants = await db.consultant.findMany({
    where: { organizationId: ctx.orgId, ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}), ...(ctx.scope === 'OWN' ? { id: ctx.consultantId ?? '__none__' } : {}) },
    select: { id: true, name: true, products: true, maxOpenLeads: true, maxOpenOpportunities: true, available: true, active: true, workingHours: true, pj: { select: { code: true } } },
  });
  const ids = consultants.map((c) => c.id);
  const [leads, opps, queue] = await Promise.all([
    db.lead.groupBy({ by: ['consultantId'], where: { organizationId: ctx.orgId, consultantId: { in: ids }, deletedAt: null, status: { in: [...OPEN_LEAD_STATUSES] } }, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['consultantId'], where: { organizationId: ctx.orgId, consultantId: { in: ids }, status: 'OPEN' }, _count: { _all: true } }),
    db.conversation.groupBy({ by: ['assignedConsultantId'], where: { organizationId: ctx.orgId, assignedConsultantId: { in: ids }, mode: 'HUMAN', status: 'OPEN' }, _count: { _all: true } }),
  ]);
  const rows = consultants.map((c) => {
    const activeLeads = leads.find((l) => l.consultantId === c.id)?._count._all ?? 0;
    const activeOpportunities = opps.find((o) => o.consultantId === c.id)?._count._all ?? 0;
    const cap = assessCapacity({ maxOpenLeads: c.maxOpenLeads, maxOpenOpportunities: c.maxOpenOpportunities, activeLeads, activeOpportunities, available: c.available, active: c.active, workingHours: c.workingHours as never }, new Date(), settings.capacity);
    return { id: c.id, name: c.name, pj: c.pj.code, specialties: c.products, activeLeads, activeOpportunities, humanConversations: queue.find((q) => q.assignedConsultantId === c.id)?._count._all ?? 0, capacity: { leads: c.maxOpenLeads, opportunities: c.maxOpenOpportunities }, ...cap, stateLabel: CAPACITY_LABEL[cap.state] };
  });
  const summary = (Object.keys(CAPACITY_LABEL) as CapacityState[]).reduce((acc, s) => ({ ...acc, [s]: rows.filter((r) => r.state === s).length }), {} as Record<CapacityState, number>);
  return { rows: rows.sort((a, b) => b.load - a.load), summary };
}

/** SUPERVISOR COCKPIT — "onde preciso intervir agora?" */
export async function supervisorCockpit(ctx: Ctx) {
  assertCan(ctx, 'lead.read');
  const leadScopeWhere = { organizationId: ctx.orgId, deletedAt: null, ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}), ...(ctx.scope === 'OWN' ? { consultantId: ctx.consultantId ?? '__none__' } : {}) };
  const convScope = { organizationId: ctx.orgId, status: 'OPEN', lead: leadScopeWhere };
  const [hot, hotUnassigned, waiting, stalled, openOpps, overdueTasks, nbaCritical, sla, capacity, integrationErrors, criticalNba] = await Promise.all([
    db.lead.count({ where: { ...leadScopeWhere, temperature: 'QUENTE', status: { notIn: ['CONVERTED', 'LOST', 'BLOCKED'] } } }),
    db.lead.count({ where: { ...leadScopeWhere, temperature: { in: ['MORNO', 'QUENTE'] }, consultantId: null, status: { notIn: ['CONVERTED', 'LOST', 'BLOCKED'] } } }),
    db.conversation.findMany({ where: { ...convScope, mode: 'HUMAN' }, select: { id: true, lastMessageAt: true, lead: { select: { id: true, name: true, temperature: true, consultant: { select: { name: true } } } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { direction: true, createdAt: true } } }, take: 300 }),
    db.opportunity.count({ where: { organizationId: ctx.orgId, status: 'OPEN', health: 'STALLED', ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}), ...(ctx.scope === 'OWN' ? { consultantId: ctx.consultantId ?? '__none__' } : {}) } }),
    db.opportunity.aggregate({ where: { organizationId: ctx.orgId, status: 'OPEN', ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}), ...(ctx.scope === 'OWN' ? { consultantId: ctx.consultantId ?? '__none__' } : {}) }, _count: { _all: true }, _sum: { value: true } }),
    db.task.count({ where: { organizationId: ctx.orgId, status: 'OPEN', dueAt: { lt: new Date() }, ...(ctx.scope === 'OWN' ? { consultantId: ctx.consultantId ?? '__none__' } : {}), ...(ctx.scope === 'PJ' ? { lead: { pjId: ctx.pjId ?? '__none__' } } : {}) } }),
    db.nextBestAction.count({ where: { organizationId: ctx.orgId, status: 'OPEN', priority: 'CRITICAL', validUntil: { gt: new Date() }, lead: leadScopeWhere } }),
    listSlaBreaches(ctx),
    ctx.scope !== 'OWN' && ctx.permissions.has('consultant.read') ? consultantCapacity(ctx) : Promise.resolve(null),
    ctx.scope === 'ORG' ? db.integration.count({ where: { organizationId: ctx.orgId, status: 'ERROR' } }) : Promise.resolve(0),
    db.nextBestAction.findMany({ where: { organizationId: ctx.orgId, status: 'OPEN', priority: { in: ['CRITICAL', 'HIGH'] }, validUntil: { gt: new Date() }, lead: leadScopeWhere }, include: { lead: { select: { id: true, name: true, temperature: true, consultant: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 40 }),
  ]);
  const awaiting = waiting
    .filter((c) => c.messages[0]?.direction === 'INBOUND')
    .map((c) => ({ conversationId: c.id, leadId: c.lead.id, leadName: c.lead.name, temperature: c.lead.temperature, consultant: c.lead.consultant?.name ?? null, minutes: Math.round((Date.now() - c.messages[0].createdAt.getTime()) / 60_000) }))
    .sort((a, b) => b.minutes - a.minutes);
  const overloaded = capacity ? capacity.rows.filter((r) => r.state === 'CRITICA' || r.state === 'ALTA') : [];
  const alerts: { tone: 'red' | 'amber' | 'blue'; title: string; detail: string; href: string }[] = [];
  if (hotUnassigned) alerts.push({ tone: 'red', title: `${hotUnassigned} lead(s) qualificado(s) sem consultor`, detail: 'Distribua agora para não perder o timing.', href: '/leads?unassigned=1' });
  const slaEsc = sla.filter((b) => b.level === 'ESCALATED').length;
  if (slaEsc) alerts.push({ tone: 'red', title: `${slaEsc} SLA(s) estourado(s)`, detail: 'Clientes sem resposta além do limite + escalonamento.', href: '/cockpit#sla' });
  if (awaiting.some((a) => a.minutes >= 15)) alerts.push({ tone: 'amber', title: `${awaiting.filter((a) => a.minutes >= 15).length} conversa(s) aguardando há 15+ min`, detail: 'Cliente escreveu e o consultor ainda não respondeu.', href: '/conversas?mode=HUMAN' });
  const critCap = overloaded.filter((o) => o.state === 'CRITICA').length;
  if (critCap) alerts.push({ tone: 'amber', title: `${critCap} consultor(es) com capacidade crítica`, detail: 'O roteamento evita consultores no limite; redistribua se necessário.', href: '/cockpit#capacidade' });
  if (stalled) alerts.push({ tone: 'amber', title: `${stalled} oportunidade(s) parada(s)`, detail: 'Sem atividade dentro do prazo da etapa.', href: '/recuperacao' });
  if (integrationErrors) alerts.push({ tone: 'red', title: `${integrationErrors} integração(ões) com erro`, detail: 'Verifique a Saúde da Operação.', href: '/saude' });
  return {
    kpis: { hot, hotUnassigned, awaiting: awaiting.length, awaitingOver15: awaiting.filter((a) => a.minutes >= 15).length, slaBreaches: sla.length, slaEscalated: slaEsc, overloaded: overloaded.length, stalled, openOpportunities: openOpps._count._all, pipelineValue: openOpps._sum.value ?? 0, overdueTasks, nbaCritical },
    alerts,
    awaiting: awaiting.slice(0, 20),
    sla: sla.slice(0, 20),
    capacity: capacity?.rows ?? [],
    actions: criticalNba,
  };
}

type Status = 'OK' | 'WARN' | 'DOWN' | 'MOCK' | 'NOT_CONFIGURED';

/** OPERATION HEALTH CENTER — status derivados de medições reais. */
export async function operationHealth(ctx: Ctx) {
  assertCan(ctx, 'integration.read');
  const since = new Date(Date.now() - 24 * 3_600_000);
  const t0 = Date.now();
  let database: { status: Status; latencyMs: number | null; detail: string };
  try {
    await db.$queryRaw`SELECT 1`;
    const ms = Date.now() - t0;
    database = { status: ms > 500 ? 'WARN' : 'OK', latencyMs: ms, detail: `${ms} ms` };
  } catch (e) {
    database = { status: 'DOWN', latencyMs: null, detail: String(e).slice(0, 120) };
  }
  let redis: { status: Status; latencyMs: number | null; detail: string };
  const r = getRedis();
  if (!r) redis = { status: env.QUEUE_DRIVER === 'bullmq' ? 'DOWN' : 'NOT_CONFIGURED', latencyMs: null, detail: 'REDIS_URL não configurada (modo em memória)' };
  else {
    const t = Date.now();
    try {
      await Promise.race([r.ping(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 800))]);
      redis = { status: 'OK', latencyMs: Date.now() - t, detail: `${Date.now() - t} ms` };
    } catch {
      redis = { status: env.QUEUE_DRIVER === 'bullmq' ? 'DOWN' : 'WARN', latencyMs: null, detail: 'Sem resposta do Redis' };
    }
  }
  const settings = await getOrgSettings(ctx.orgId);
  const [aiRuns, aiFail, aiLatency, whatsapp, jobsFailed, jobsDead, jobsLast, outboxPending, outboxFailed, webhookFailed, webhookOk, pushSent, pushFailed, pushDevices, sla, capacity, handoffWaiting, integrations] = await Promise.all([
    db.aIExecution.count({ where: { organizationId: ctx.orgId, startedAt: { gte: since } } }),
    db.aIExecution.count({ where: { organizationId: ctx.orgId, startedAt: { gte: since }, status: 'FAILED' } }),
    db.aIExecution.aggregate({ where: { organizationId: ctx.orgId, startedAt: { gte: since }, latencyMs: { not: null } }, _avg: { latencyMs: true } }),
    db.whatsAppNumber.groupBy({ by: ['status'], where: { organizationId: ctx.orgId }, _count: { _all: true } }),
    db.jobRun.count({ where: { status: 'FAILED', startedAt: { gte: since } } }),
    db.jobRun.count({ where: { status: 'DEAD', startedAt: { gte: since } } }),
    db.jobRun.findFirst({ where: { job: 'operations.scan', status: 'COMPLETED' }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
    db.outboxEvent.count({ where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 5 * 60_000) } } }),
    db.outboxEvent.count({ where: { status: 'FAILED' } }),
    db.webhookDelivery.count({ where: { organizationId: ctx.orgId, status: 'FAILED', updatedAt: { gte: since } } }),
    db.webhookDelivery.count({ where: { organizationId: ctx.orgId, status: 'SUCCESS', updatedAt: { gte: since } } }),
    db.auditLog.count({ where: { organizationId: ctx.orgId, action: 'push.sent', createdAt: { gte: since } } }),
    db.auditLog.count({ where: { organizationId: ctx.orgId, action: 'push.failed', createdAt: { gte: since } } }),
    db.userDevice.count({ where: { organizationId: ctx.orgId, status: 'ACTIVE', pushEndpoint: { not: null } } }),
    listSlaBreaches(ctx),
    consultantCapacity(ctx).catch(() => null),
    db.conversation.count({ where: { organizationId: ctx.orgId, mode: 'HUMAN', status: 'OPEN', lastMessageAt: { lt: new Date(Date.now() - settings.sla.handoffMinutes * 60_000) } } }),
    providerStatuses(ctx.orgId),
  ]);
  const newLeads = await db.lead.count({ where: { organizationId: ctx.orgId, createdAt: { gte: since } } });
  const aiFailRate = aiRuns ? aiFail / aiRuns : 0;
  const wa = Object.fromEntries(whatsapp.map((w) => [w.status, w._count._all]));
  const integrationsWithError = integrations.filter((i) => i.status === 'ERROR').length;
  const critCap = capacity?.rows.filter((c) => c.state === 'CRITICA').length ?? 0;
  const available = capacity?.rows.filter((c) => c.state !== 'INDISPONIVEL').length ?? 0;
  const slaEsc = sla.filter((s) => s.level === 'ESCALATED').length;

  const items: { key: string; label: string; status: Status; detail: string; metric?: string }[] = [
    { key: 'acquisition', label: 'Aquisição', status: newLeads > 0 ? 'OK' : 'WARN', detail: `${newLeads} lead(s) nas últimas 24h`, metric: String(newLeads) },
    { key: 'ai', label: 'IA', status: env.AI_PROVIDER === 'mock' ? 'MOCK' : aiFailRate > 0.2 ? 'DOWN' : aiFailRate > 0.05 ? 'WARN' : 'OK', detail: `${aiRuns} execuções · ${(aiFailRate * 100).toFixed(1)}% falhas · ${aiLatency._avg.latencyMs ? Math.round(aiLatency._avg.latencyMs) : '—'} ms${env.AI_PROVIDER === 'mock' ? ' · provider MOCK' : ''}` },
    { key: 'whatsapp', label: 'WhatsApp', status: env.WHATSAPP_PROVIDER === 'mock' ? 'MOCK' : (wa.ERROR ?? 0) > 0 ? 'WARN' : (wa.CONNECTED ?? 0) > 0 ? 'OK' : 'DOWN', detail: `${wa.CONNECTED ?? 0} conectado(s) · ${wa.ERROR ?? 0} com erro${env.WHATSAPP_PROVIDER === 'mock' ? ' · provider MOCK' : ''}` },
    { key: 'integrations', label: 'Integrações', status: integrationsWithError ? 'WARN' : integrations.every((i) => i.status === 'MOCK' || i.status === 'NOT_CONFIGURED') ? 'MOCK' : 'OK', detail: `${integrations.filter((i) => i.status === 'CONNECTED').length} reais · ${integrations.filter((i) => i.status === 'MOCK').length} mock · ${integrationsWithError} com erro` },
    { key: 'consultants', label: 'Consultores', status: !capacity ? 'NOT_CONFIGURED' : available === 0 ? 'DOWN' : critCap > 0 ? 'WARN' : 'OK', detail: capacity ? `${available} disponíveis · ${critCap} em capacidade crítica` : '—' },
    { key: 'queue', label: 'Fila de atendimento', status: handoffWaiting > 10 ? 'DOWN' : handoffWaiting > 0 ? 'WARN' : 'OK', detail: `${handoffWaiting} conversa(s) humanas aguardando além do SLA` },
    { key: 'sla', label: 'SLA', status: slaEsc > 0 ? 'DOWN' : sla.length ? 'WARN' : 'OK', detail: `${sla.length} estouro(s) · ${slaEsc} escalado(s)` },
    database.status === 'DOWN' ? { key: 'database', label: 'Banco de dados', status: 'DOWN', detail: database.detail } : { key: 'database', label: 'Banco de dados', status: database.status, detail: database.detail },
    { key: 'redis', label: 'Redis', status: redis.status, detail: redis.detail },
    { key: 'queues', label: 'Jobs e filas', status: jobsDead > 0 ? 'DOWN' : jobsFailed > 0 || outboxPending > 0 ? 'WARN' : 'OK', detail: `${env.QUEUE_DRIVER} · ${jobsFailed} falha(s) e ${jobsDead} dead-letter em 24h · outbox pendente ${outboxPending}/falho ${outboxFailed} · última varredura ${jobsLast ? jobsLast.startedAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}` },
    { key: 'webhooks', label: 'Webhooks', status: webhookFailed > 0 ? 'WARN' : 'OK', detail: `${webhookOk} entregues · ${webhookFailed} com falha (24h)` },
    { key: 'push', label: 'Push', status: !pushConfigured() ? 'NOT_CONFIGURED' : pushFailed > pushSent && pushFailed > 0 ? 'WARN' : 'OK', detail: pushConfigured() ? `${pushDevices} dispositivo(s) · ${pushSent} enviados · ${pushFailed} falhas (24h)` : 'VAPID não configurado' },
    { key: 'realtime', label: 'Tempo real', status: 'OK', detail: `${realtimeConnections()} conexão(ões) SSE nesta instância · transporte ${realtimeTransport()}` },
  ];
  const overall: Status = items.some((i) => i.status === 'DOWN') ? 'DOWN' : items.some((i) => i.status === 'WARN') ? 'WARN' : 'OK';
  return { overall, checkedAt: new Date(), items, integrations };
}
