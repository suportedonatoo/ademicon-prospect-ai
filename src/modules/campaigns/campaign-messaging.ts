import { z } from 'zod';
import { db } from '@/lib/db';
import { enqueue } from '@/lib/queue';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { canContactProactively, deliverMessage, pickNumber } from '../messaging/messaging.service';
import { findOrCreateOpenConversation } from '../conversations/conversation.service';
import { firstName } from '@/lib/normalize';

// Campanhas de WhatsApp com governança:
// - somente templates APROVADOS;
// - somente leads com opt-in de MARKETING no WhatsApp e sem opt-out;
// - respeita frequência semanal, horário de silêncio e limite diário por número;
// - pode ser pausada a qualquer momento.

export const campaignMessageInput = z.object({
  templateId: z.string(),
  audience: z.object({
    products: z.array(z.string()).default([]),
    temperatures: z.array(z.string()).default([]),
    statuses: z.array(z.string()).default([]),
    cities: z.array(z.string()).default([]),
  }),
  scheduledAt: z.coerce.date().optional().nullable(),
});

function audienceWhere(orgId: string, a: z.infer<typeof campaignMessageInput>['audience']) {
  return {
    organizationId: orgId,
    deletedAt: null,
    optOut: false,
    phone: { not: null },
    consents: { some: { channel: { in: ['WHATSAPP', 'ALL'] }, purpose: 'MARKETING', status: 'GRANTED' } },
    ...(a.products.length ? { product: { in: a.products } } : {}),
    ...(a.temperatures.length ? { temperature: { in: a.temperatures } } : {}),
    ...(a.statuses.length ? { status: { in: a.statuses as never[] } } : {}),
    ...(a.cities.length ? { city: { in: a.cities } } : {}),
  };
}

export async function previewAudience(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'whatsapp.send_campaign');
  const a = campaignMessageInput.shape.audience.parse(raw);
  const [eligible, total] = await Promise.all([
    db.lead.count({ where: audienceWhere(ctx.orgId, a) }),
    db.lead.count({ where: { ...audienceWhere(ctx.orgId, a), consents: undefined, optOut: undefined } }),
  ]);
  return { eligible, withoutConsent: total - eligible };
}

export async function scheduleCampaignMessage(ctx: Ctx, campaignId: string, raw: unknown) {
  assertCan(ctx, 'whatsapp.send_campaign');
  const input = campaignMessageInput.parse(raw);
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, organizationId: ctx.orgId } });
  if (!campaign) throw NotFound('Campanha');
  if (campaign.status !== 'ACTIVE') throw BadRequest('A campanha precisa estar ATIVA para enviar mensagens.');
  const template = await db.messageTemplate.findFirst({ where: { id: input.templateId, organizationId: ctx.orgId } });
  if (!template) throw NotFound('Template');
  if (template.status !== 'APPROVED') throw BadRequest('Somente templates aprovados podem ser usados em campanhas.');

  const size = await db.lead.count({ where: audienceWhere(ctx.orgId, input.audience) });
  const audience = await db.campaignAudience.create({ data: { organizationId: ctx.orgId, campaignId, name: `Público ${new Date().toLocaleDateString('pt-BR')}`, filters: input.audience, size } });
  const message = await db.campaignMessage.create({
    data: { organizationId: ctx.orgId, campaignId, templateId: template.id, channel: 'WHATSAPP', content: template.body, scheduledAt: input.scheduledAt ?? null, status: 'QUEUED' },
  });
  await db.campaignEvent.create({ data: { organizationId: ctx.orgId, campaignId, type: 'MESSAGE_QUEUED', payload: { messageId: message.id, audienceId: audience.id, size } } });
  await audit(ctx, 'campaign.changed', { type: 'CampaignMessage', id: message.id }, { action: 'queued', size });
  await enqueue('campaign.dispatch', { orgId: ctx.orgId, messageId: message.id, audienceId: audience.id }, { delayMs: input.scheduledAt ? Math.max(0, input.scheduledAt.getTime() - Date.now()) : 0 });
  return { message, size };
}

/** Executado pela fila. Cada destinatário passa por canContactProactively. */
export async function dispatchCampaignMessage(orgId: string, messageId: string) {
  const msg = await db.campaignMessage.findUnique({ where: { id: messageId }, include: { campaign: { include: { audiences: { orderBy: { createdAt: 'desc' }, take: 1 } } } } });
  if (!msg || msg.status === 'PAUSED' || msg.status === 'SENT') return;
  if (msg.campaign.status !== 'ACTIVE') {
    await db.campaignMessage.update({ where: { id: messageId }, data: { status: 'PAUSED' } });
    return;
  }
  await db.campaignMessage.update({ where: { id: messageId }, data: { status: 'SENDING' } });
  const filters = campaignMessageInput.shape.audience.parse(msg.campaign.audiences[0]?.filters ?? {});
  const leads = await db.lead.findMany({ where: audienceWhere(orgId, filters), select: { id: true, name: true }, take: 1000 });
  const number = await pickNumber(orgId, 'TEAM');
  const template = msg.templateId ? await db.messageTemplate.findFirst({ where: { id: msg.templateId, organizationId: orgId } }) : null;
  let sent = 0;
  let skipped = 0;

  for (const lead of leads) {
    const fresh = await db.campaignMessage.findUnique({ where: { id: messageId }, select: { status: true } });
    if (fresh?.status === 'PAUSED') break; // pausa respeitada durante o envio
    const check = await canContactProactively(orgId, lead.id);
    if (!check.allowed || !number) {
      skipped++;
      continue;
    }
    const { conversation } = await findOrCreateOpenConversation(orgId, lead.id, 'WHATSAPP', { whatsappNumberId: number.id, currentAgent: 'PROSPECT' });
    const content = msg.content.replace(/\{\{\s*1\s*\}\}|\{\{\s*nome\s*\}\}/gi, firstName(lead.name));
    // Campanha = template aprovado (a API oficial exige template para iniciar conversa).
    const variables = (template?.variables ?? []).map((v) => (v === 'nome' || v === '1' ? firstName(lead.name) : ''));
    const m = await deliverMessage(orgId, conversation.id, { content, senderType: 'AI', agentKey: 'CAMPAIGN', template: template ? { name: template.name, language: template.language, variables } : null });
    if (m.status === 'SENT') {
      sent++;
      await db.leadActivity.create({ data: { organizationId: orgId, leadId: lead.id, type: 'PROACTIVE_CONTACT', description: `Campanha: ${msg.campaign.name}`, actorType: 'SYSTEM' } });
    } else skipped++;
  }

  const final = await db.campaignMessage.findUnique({ where: { id: messageId }, select: { status: true } });
  await db.campaignMessage.update({ where: { id: messageId }, data: { status: final?.status === 'PAUSED' ? 'PAUSED' : 'SENT', sentCount: { increment: sent }, skippedCount: { increment: skipped } } });
  await db.campaignEvent.create({ data: { organizationId: orgId, campaignId: msg.campaignId, type: 'MESSAGE_DISPATCHED', payload: { messageId, sent, skipped } } });
}
