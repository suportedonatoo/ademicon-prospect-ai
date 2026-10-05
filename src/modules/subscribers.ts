import { subscribe, type DomainEventEnvelope } from '@/lib/events';
import { emitToOrg } from '@/lib/realtime';
import { logger } from '@/lib/logger';
import { enqueue } from '@/lib/queue';
import { runAutomations } from './automations/automation.engine';
import { fanOutEvent } from './webhooks/webhook.service';
import { notifyConsultant, notifyRoles } from './notifications/notification.service';
import { db } from '@/lib/db';

// Assinantes do Event Bus. Registrados uma única vez (carregamento tardio em lib/events.ts).
// Nenhum assinante derruba o fluxo principal: erros são registrados pelo publish().

const leadIdOf = (e: DomainEventEnvelope) => (e.payload as { leadId?: string | null }).leadId ?? null;

/** Recalcula a inteligência do lead (sub-scores + NBA) — no máximo 1x por minuto por lead na fila. */
async function refreshIntel(e: DomainEventEnvelope) {
  const leadId = leadIdOf(e);
  if (!leadId) return;
  await enqueue('intelligence.refresh', { orgId: e.orgId, leadId }, { jobId: `intel:${leadId}:${Math.floor(Date.now() / 60_000)}` });
}

export function registerSubscribers() {
  // Webhooks de saída e automações reagem a qualquer evento.
  subscribe('*', fanOutEvent);
  subscribe('*', runAutomations);

  // NotificationCenter: novo lead (gestores) e erro de integração (admins).
  subscribe('lead.created', async (e) => {
    if (e.payload.source === 'IMPORT') return; // importações em lote não geram uma notificação por linha
    const lead = await db.lead.findUnique({ where: { id: String(e.payload.leadId) }, select: { name: true, source: true } });
    if (lead) await notifyRoles(e.orgId, ['MANAGER'], { type: 'lead.created', title: 'Novo lead', body: `${lead.name} · ${lead.source}`, link: `/leads/${e.payload.leadId}`, entityType: 'Lead', entityId: String(e.payload.leadId) });
  });
  subscribe('integration.error', async (e) => {
    await notifyRoles(e.orgId, ['ADMIN', 'SUPER_ADMIN'], { type: 'integration.error', priority: 'HIGH', title: 'Erro de integração', body: `${e.payload.provider}: ${String(e.payload.error).slice(0, 140)}`, link: '/integracoes', dedupeKey: `integ:${e.payload.provider}:${Math.floor(Date.now() / 900_000)}` });
  });

  // ── Lead Intelligence V2: intenção, sinais, sub-scores e Next Best Action ──
  subscribe('conversation.message_received', async (e) => {
    const messageId = String(e.payload.messageId ?? '');
    const msg = messageId ? await db.message.findUnique({ where: { id: messageId }, select: { content: true, senderType: true, conversationId: true } }) : null;
    const leadId = leadIdOf(e);
    if (msg && leadId && msg.senderType === 'LEAD') {
      const { analyzeInboundMessage } = await import('./lead-intelligence/intelligence-v2.service');
      const { intents } = await analyzeInboundMessage(e.orgId, leadId, msg.conversationId, messageId, msg.content);
      const asksHuman = intents.find((i) => i.type === 'CONTACT_REQUEST' || i.type === 'CALL_REQUEST');
      if (asksHuman) {
        const lead = await db.lead.findUnique({ where: { id: leadId }, select: { name: true, consultantId: true } });
        if (lead?.consultantId) {
          await notifyConsultant(e.orgId, lead.consultantId, { type: 'conversation.consultant_request', priority: 'HIGH', title: `${lead.name} pediu para falar com você`, body: asksHuman.evidence, link: `/conversas?c=${msg.conversationId}`, entityType: 'Lead', entityId: leadId, dedupeKey: `ask:${messageId}` });
        }
      }
    }
    emitToOrg(e.orgId, { type: 'conversation.message', data: { conversationId: e.payload.conversationId, direction: 'INBOUND' } });
    await refreshIntel(e);
  });
  subscribe('conversation.message_sent', async (e) => {
    emitToOrg(e.orgId, { type: 'conversation.message', data: { conversationId: e.payload.conversationId, direction: 'OUTBOUND' } });
    if (e.payload.senderType === 'HUMAN') await refreshIntel(e);
  });
  subscribe('conversation.handoff', async (e) => {
    emitToOrg(e.orgId, { type: 'conversation.updated', data: { conversationId: e.payload.conversationId } });
    await refreshIntel(e);
  });
  for (const name of ['lead.scored', 'lead.merged', 'lead.updated', 'task.overdue', 'opportunity.created', 'opportunity.stage_changed'] as const) subscribe(name, refreshIntel);

  subscribe('simulation.created', async (e) => {
    const leadId = leadIdOf(e);
    if (!leadId) return;
    const { recordBuyingSignal } = await import('./lead-intelligence/intelligence-v2.service');
    await recordBuyingSignal(e.orgId, leadId, { type: 'simulation_requested', evidence: `Simulação de ${e.payload.product ?? 'produto'} · R$ ${Number(e.payload.value ?? 0).toLocaleString('pt-BR')}`, confidence: 1 }, 'SIMULATOR');
    await refreshIntel(e);
  });

  // ── Playbooks: distribuição / reativação selecionam o playbook do segmento ──
  subscribe('lead.assigned', async (e) => {
    await refreshIntel(e);
    const leadId = leadIdOf(e);
    if (!leadId) return;
    const { startPlaybookForLead } = await import('./playbooks/playbook.service');
    await startPlaybookForLead(e.orgId, leadId, 'lead.assigned');
  });
  subscribe('lead.reactivated', async (e) => {
    const leadId = leadIdOf(e);
    if (!leadId) return;
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { name: true, consultantId: true } });
    if (lead?.consultantId) await notifyConsultant(e.orgId, lead.consultantId, { type: 'lead.reactivated', priority: 'HIGH', title: `♻️ ${lead.name} voltou a demonstrar interesse`, body: 'Lead reaquecido após período inativo. Veja a próxima melhor ação.', link: `/leads/${leadId}`, entityType: 'Lead', entityId: leadId, dedupeKey: `react:${leadId}:${new Date().toISOString().slice(0, 10)}` });
    const { startPlaybookForLead } = await import('./playbooks/playbook.service');
    await startPlaybookForLead(e.orgId, leadId, 'lead.reactivated');
  });
  for (const name of ['consent.revoked', 'opportunity.closed'] as const) {
    subscribe(name, async (e) => {
      const leadId = leadIdOf(e);
      if (!leadId) return;
      const { cancelRunsForLead } = await import('./playbooks/playbook.service');
      await cancelRunsForLead(e.orgId, leadId, name === 'consent.revoked' ? 'consentimento revogado' : 'oportunidade encerrada');
      await refreshIntel(e);
    });
  }

  // ── Opportunity Intelligence ──
  for (const name of ['opportunity.created', 'opportunity.stage_changed'] as const) {
    subscribe(name, async (e) => {
      const { refreshOpportunityHealth } = await import('./opportunities/opportunity-intelligence.service');
      await refreshOpportunityHealth(e.orgId, String(e.payload.opportunityId));
    });
  }
  subscribe('opportunity.stalled', async (e) => {
    const consultantId = e.payload.consultantId as string | null;
    const opp = await db.opportunity.findUnique({ where: { id: String(e.payload.opportunityId) }, select: { code: true, lead: { select: { name: true } } } });
    if (consultantId && opp) await notifyConsultant(e.orgId, consultantId, { type: 'opportunity.stalled', priority: 'HIGH', title: `Oportunidade #${opp.code} parada`, body: `${opp.lead.name} · ${((e.payload.reasons as string[]) ?? []).slice(0, 2).join(' · ')}`, link: `/oportunidades/${e.payload.opportunityId}`, entityType: 'Lead', entityId: String(e.payload.leadId), dedupeKey: `stalled:${e.payload.opportunityId}` });
  });

  logger.debug('subscribers.registered');
}
