import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import { enqueue } from '@/lib/queue';
import { normalizePhone } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan, systemCtx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { providers } from '../integrations/registry';
import { acquire } from '../leads/acquisition-engine';
import { findOrCreateOpenConversation } from '../conversations/conversation.service';
import { failoverNumber, MAX_NUMBERS_PER_CONSULTANT } from './number-pool';

// WhatsApp Hub: Números, Templates, Inbox (conversas), Campanhas e Webhook de entrada.

export const numberInput = z.object({
  name: z.string().min(2).max(60),
  phone: z.string().min(8).max(24),
  purpose: z.enum(['PROSPECT_BOT', 'QUALIFICATION_BOT', 'TEAM']),
  dailyLimit: z.coerce.number().int().min(1).max(100000),
  webhookUrl: z.string().url().nullable().optional().or(z.literal('')),
  /** Dono do número (consultor: de 1 a 7 números). Vazio = número da operação. */
  consultantId: z.string().nullable().optional().or(z.literal('').transform(() => null)),
  /** 0 = principal; maiores = backup, nessa ordem. */
  priority: z.coerce.number().int().min(0).max(9).default(0),
  /** ID do número na API oficial (phone_number_id da Meta). */
  providerNumberId: z.string().trim().regex(/^\d{5,30}$/, 'ID da Meta: só números').nullable().optional().or(z.literal('').transform(() => null)),
});

export const templateInput = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/, 'Use minúsculas, números e _').min(3).max(60),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  language: z.string().default('pt_BR'),
  body: z.string().min(10).max(1024),
});

async function ensureAccount(orgId: string) {
  return (
    (await db.whatsAppAccount.findFirst({ where: { organizationId: orgId } })) ??
    (await db.whatsAppAccount.create({ data: { organizationId: orgId, name: 'Conta principal', provider: providers.whatsapp.mode } }))
  );
}

export async function listNumbers(ctx: Ctx) {
  assertCan(ctx, 'whatsapp.read');
  return db.whatsAppNumber.findMany({
    where: { organizationId: ctx.orgId, ...(ctx.scope === 'OWN' ? { consultantId: ctx.consultantId ?? '__none__' } : ctx.scope === 'PJ' ? { OR: [{ consultantId: null }, { consultant: { pjId: ctx.pjId ?? '__none__' } }] } : {}) },
    orderBy: [{ consultantId: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    include: { account: true, consultant: { select: { id: true, name: true, pjId: true } } },
  });
}

export async function saveNumber(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'whatsapp.configure');
  const input = numberInput.parse(raw);
  const phone = normalizePhone(input.phone);
  if (!phone) throw BadRequest('Telefone inválido.');
  if (input.consultantId) {
    const owner = await db.consultant.findFirst({ where: { id: input.consultantId, organizationId: ctx.orgId }, select: { pjId: true } });
    if (!owner) throw NotFound('Consultor');
    if (ctx.scope === 'PJ' && owner.pjId !== ctx.pjId) throw BadRequest('Consultor de outra PJ.');
    const count = await db.whatsAppNumber.count({ where: { organizationId: ctx.orgId, consultantId: input.consultantId, ...(id ? { NOT: { id } } : {}) } });
    if (count >= MAX_NUMBERS_PER_CONSULTANT) throw BadRequest(`Cada consultor pode ter no máximo ${MAX_NUMBERS_PER_CONSULTANT} números de WhatsApp.`);
  }
  const dupe = await db.whatsAppNumber.findFirst({ where: { organizationId: ctx.orgId, phone, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (dupe) throw BadRequest('Este número já está cadastrado.');
  const account = await ensureAccount(ctx.orgId);
  const data = { ...input, consultantId: input.consultantId ?? null, phone, webhookUrl: input.webhookUrl || null };
  const n = id
    ? await db.whatsAppNumber.update({ where: { id, organizationId: ctx.orgId }, data })
    : await db.whatsAppNumber.create({ data: { organizationId: ctx.orgId, accountId: account.id, provider: providers.whatsapp.mode, status: 'DISCONNECTED', ...data } });
  await audit(ctx, 'whatsapp.changed', { type: 'WhatsAppNumber', id: n.id }, { action: id ? 'updated' : 'created' });
  return n;
}

export async function connectNumber(ctx: Ctx, id: string) {
  assertCan(ctx, 'whatsapp.configure');
  const n = await db.whatsAppNumber.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!n) throw NotFound('Número');
  const res = await providers.whatsapp.connectNumber(n.phone, n.providerNumberId);
  await db.whatsAppNumber.update({ where: { id }, data: { status: res.status, lastError: res.status === 'CONNECTED' ? null : (res.detail ?? null), lastErrorAt: res.status === 'CONNECTED' ? null : new Date() } });
  await audit(ctx, 'whatsapp.changed', { type: 'WhatsAppNumber', id }, { action: 'connect', status: res.status });
  return res;
}

export async function setNumberState(ctx: Ctx, id: string, change: { paused?: boolean; status?: 'DISCONNECTED' }) {
  assertCan(ctx, 'whatsapp.configure');
  await db.whatsAppNumber.updateMany({ where: { id, organizationId: ctx.orgId }, data: change });
  await audit(ctx, 'whatsapp.changed', { type: 'WhatsAppNumber', id }, change);
  // Saiu do ar (pausado/desconectado): conversas abertas seguem pelo backup do mesmo consultor.
  if (change.paused || change.status === 'DISCONNECTED') return failoverNumber(ctx.orgId, id);
  return { moved: 0, stranded: 0 };
}

export async function listTemplates(ctx: Ctx) {
  assertCan(ctx, 'whatsapp.read');
  return db.messageTemplate.findMany({ where: { organizationId: ctx.orgId }, orderBy: { updatedAt: 'desc' } });
}

export async function saveTemplate(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'whatsapp.configure');
  const input = templateInput.parse(raw);
  const variables = Array.from(input.body.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)).map((m) => m[1]);
  const t = id
    ? await db.messageTemplate.update({ where: { id, organizationId: ctx.orgId }, data: { ...input, variables, status: 'DRAFT' } })
    : await db.messageTemplate.create({ data: { organizationId: ctx.orgId, ...input, variables } });
  await audit(ctx, 'whatsapp.changed', { type: 'MessageTemplate', id: t.id }, { action: id ? 'updated' : 'created' });
  return t;
}

/** Envia o template para aprovação no provedor (mock aprova na hora). */
export async function submitTemplate(ctx: Ctx, id: string) {
  assertCan(ctx, 'whatsapp.configure');
  const t = await db.messageTemplate.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!t) throw NotFound('Template');
  const res = await providers.whatsapp.submitTemplate(t);
  await db.messageTemplate.update({ where: { id }, data: { status: res.status } });
  return res;
}

/**
 * Mensagem recebida (webhook do provedor ou simulação no Inbox).
 * Número desconhecido → AcquisitionEngine (fonte WHATSAPP) → conversa → Maestro.
 */
export async function handleInboundMessage(orgId: string, msg: { from: string; to?: string; toProviderNumberId?: string; text: string; externalId: string; profileName?: string }) {
  const phone = normalizePhone(msg.from);
  if (!phone) throw BadRequest('Remetente inválido.');
  const ctx = systemCtx(orgId, 'WhatsApp');

  // Número que recebeu a mensagem (todos os números caem no mesmo Inbox).
  // Pelo ID da Meta (phone_number_id) quando vier; senão pelo número exibido.
  const toNumber =
    (msg.toProviderNumberId ? await db.whatsAppNumber.findFirst({ where: { organizationId: orgId, providerNumberId: msg.toProviderNumberId } }) : null) ??
    (msg.to ? await db.whatsAppNumber.findFirst({ where: { organizationId: orgId, phone: normalizePhone(msg.to) ?? '' } }) : null);
  let identity = await db.leadIdentity.findUnique({ where: { organizationId_type_value: { organizationId: orgId, type: 'PHONE', value: phone } } });
  if (!identity) {
    await acquire(ctx, 'WHATSAPP', { from: phone, profileName: msg.profileName ?? 'Contato WhatsApp', ownerConsultantId: toNumber?.consultantId ?? null });
    identity = await db.leadIdentity.findUniqueOrThrow({ where: { organizationId_type_value: { organizationId: orgId, type: 'PHONE', value: phone } } });
  }
  const leadId = identity.leadId;
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, select: { consultantId: true } });
  const { conversation, created } = await findOrCreateOpenConversation(orgId, leadId, 'WHATSAPP', {
    whatsappNumberId: toNumber?.id,
    currentAgent: 'PROSPECT',
    assignedConsultantId: lead.consultantId ?? toNumber?.consultantId ?? null,
  });
  // O lead respondeu por outro número (ex.: o backup): a conversa passa a seguir por ele.
  if (!created && toNumber && toNumber.id !== conversation.whatsappNumberId && toNumber.status === 'CONNECTED' && !toNumber.paused) {
    await db.conversation.update({ where: { id: conversation.id }, data: { whatsappNumberId: toNumber.id } });
  }

  await enqueue('ai.respond', { orgId, conversationId: conversation.id, text: msg.text, externalId: msg.externalId });
  return { leadId, conversationId: conversation.id };
}

/** Webhook público: registra o payload bruto e processa. */
export async function receiveWebhook(provider: string, orgSlug: string | null, body: unknown, headers: Record<string, string>) {
  const org = orgSlug ? await db.organization.findUnique({ where: { slug: orgSlug } }) : await db.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  const log = await db.webhook.create({ data: { organizationId: org?.id, provider, headers: { 'user-agent': headers['user-agent'] ?? '' }, payload: body as object } });
  if (!org) {
    await db.webhook.update({ where: { id: log.id }, data: { status: 'REJECTED', error: 'Organização desconhecida' } });
    return { ok: false };
  }
  const parsed = providers.whatsapp.parseWebhook(body);
  if (!parsed || (!parsed.messages.length && !parsed.statuses.length)) {
    await db.webhook.update({ where: { id: log.id }, data: { status: parsed ? 'PROCESSED' : 'REJECTED', error: parsed ? null : 'Payload não reconhecido' } });
    return { ok: !!parsed };
  }
  // Status de entrega (sent/delivered/read/failed) das mensagens que enviamos.
  for (const st of parsed.statuses) await applyDeliveryStatus(org.id, st);
  if (!parsed.messages.length) {
    await db.webhook.update({ where: { id: log.id }, data: { status: 'PROCESSED' } });
    return { ok: true, statuses: parsed.statuses.length };
  }
  // IDEMPOTÊNCIA: o mesmo evento (provider + id externo) nunca é processado duas vezes.
  const first = parsed.messages[0].externalId;
  const key = `${provider}:${org.id}:${first}`;
  if (await db.webhook.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) {
    await db.webhook.update({ where: { id: log.id }, data: { status: 'DUPLICATE' } });
    return { ok: true, duplicate: true };
  }
  try {
    await db.webhook.update({ where: { id: log.id }, data: { idempotencyKey: key } });
  } catch {
    await db.webhook.update({ where: { id: log.id }, data: { status: 'DUPLICATE' } });
    return { ok: true, duplicate: true };
  }
  try {
    const results = [];
    for (const m of parsed.messages) {
      // Mensagens além da primeira: dedupe pelo id da mensagem já gravada.
      if (m !== parsed.messages[0] && (await db.message.findFirst({ where: { organizationId: org.id, externalId: m.externalId, direction: 'INBOUND' }, select: { id: true } }))) continue;
      results.push(await handleInboundMessage(org.id, { ...m, profileName: m.profileName ?? (body as { profileName?: string })?.profileName }));
    }
    await db.webhook.update({ where: { id: log.id }, data: { status: 'PROCESSED' } });
    return results.length === 1 ? { ok: true, ...results[0] } : { ok: true, processed: results.length };
  } catch (e) {
    await db.webhook.update({ where: { id: log.id }, data: { status: 'FAILED', error: String(e).slice(0, 500) } });
    throw e;
  }
}

const STATUS_MAP: Record<string, string> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
const STATUS_RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

/** Atualiza o status da mensagem enviada (nunca "volta": lida não vira entregue). */
async function applyDeliveryStatus(orgId: string, st: { externalId: string; status: string; error?: string }) {
  const status = STATUS_MAP[st.status];
  if (!status || !st.externalId) return;
  const msg = await db.message.findFirst({ where: { organizationId: orgId, externalId: st.externalId, direction: 'OUTBOUND' }, select: { id: true, status: true, conversationId: true } });
  if (!msg || (STATUS_RANK[msg.status] ?? 0) >= STATUS_RANK[status]) return;
  await db.message.update({ where: { id: msg.id }, data: { status } });
  if (status === 'FAILED' && st.error) {
    await db.message.create({ data: { organizationId: orgId, conversationId: msg.conversationId, direction: 'OUTBOUND', senderType: 'SYSTEM', content: `Mensagem não entregue pelo WhatsApp (${st.error}).`, status: 'SENT' } });
  }
}
