import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { assertCan } from '../auth/context';
import { conversationScope } from '../leads/scope';
import { deliverMessage, pickNumber } from '../messaging/messaging.service';
import { primaryNumberFor } from '../whatsapp/number-pool';

/**
 * Busca a conversa aberta do lead no canal ou cria uma — sob lock transacional por lead,
 * para que requisições simultâneas não criem conversas duplicadas.
 */
export async function findOrCreateOpenConversation(orgId: string, leadId: string, channel: 'WHATSAPP' | 'WEB' | 'INSTAGRAM', data: { whatsappNumberId?: string | null; currentAgent?: string; assignedConsultantId?: string | null } = {}) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conv:${leadId}:${channel}`}))`;
    const existing = await tx.conversation.findFirst({ where: { organizationId: orgId, leadId, channel, status: 'OPEN' }, orderBy: { createdAt: 'asc' } });
    if (existing) return { conversation: existing, created: false };
    const conversation = await tx.conversation.create({ data: { organizationId: orgId, leadId, channel, ...data, whatsappNumberId: data.whatsappNumberId ?? undefined } });
    return { conversation, created: true };
  });
}

export async function getOrCreateConversation(orgId: string, leadId: string, opts: { channel?: 'WHATSAPP' | 'WEB'; agent?: 'PROSPECT' | 'QUALIFICATION' } = {}) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  // Lead com consultor: conversa sai pelo número principal dele; senão, pelo número do bot.
  const number = (await primaryNumberFor(orgId, lead.consultantId)) ?? (await pickNumber(orgId, opts.agent === 'QUALIFICATION' ? 'QUALIFICATION_BOT' : 'PROSPECT_BOT'));
  const res = await findOrCreateOpenConversation(orgId, leadId, opts.channel ?? 'WHATSAPP', {
    whatsappNumberId: number?.id,
    currentAgent: opts.agent ?? 'PROSPECT',
    assignedConsultantId: lead.consultantId,
  });
  if (res.created) await publish(orgId, 'conversation.created', { conversationId: res.conversation.id, leadId });
  return res;
}

/**
 * INBOX UNIFICADO: todas as conversas, de todos os números de WhatsApp (principal e backups do
 * consultor + números da operação), numa só lista. `numberId` filtra por um número.
 */
export async function listConversations(ctx: Ctx, opts: { mode?: string; q?: string; numberId?: string; take?: number } = {}) {
  assertCan(ctx, 'conversation.read');
  const list = await db.conversation.findMany({
    where: {
      ...conversationScope(ctx),
      ...(opts.mode ? { mode: opts.mode } : {}),
      ...(opts.numberId ? { whatsappNumberId: opts.numberId } : {}),
      ...(opts.q ? { lead: { name: { contains: opts.q, mode: 'insensitive' } } } : {}),
    },
    include: {
      lead: { select: { id: true, name: true, score: true, temperature: true, product: true, phone: true } },
      messages: { where: { senderType: { not: 'SYSTEM' } }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: opts.take ?? 60,
  });
  const ids = [...new Set(list.map((c) => c.whatsappNumberId).filter((id): id is string => !!id))];
  const numbers = ids.length ? await db.whatsAppNumber.findMany({ where: { id: { in: ids }, organizationId: ctx.orgId }, select: { id: true, name: true, phone: true, status: true, paused: true } }) : [];
  const byId = new Map(numbers.map((n) => [n.id, n]));
  return list.map((c) => ({ ...c, number: c.whatsappNumberId ? (byId.get(c.whatsappNumberId) ?? null) : null }));
}

/** Números que aparecem no filtro do Inbox: o consultor vê os dele; gestão vê todos (PJ: da PJ + operação). */
export async function inboxNumbers(ctx: Ctx) {
  assertCan(ctx, 'conversation.read');
  return db.whatsAppNumber.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(ctx.scope === 'OWN' ? { consultantId: ctx.consultantId ?? '__none__' } : ctx.scope === 'PJ' ? { OR: [{ consultantId: null }, { consultant: { pjId: ctx.pjId ?? '__none__' } }] } : {}),
    },
    select: { id: true, name: true, phone: true, status: true, paused: true, consultant: { select: { name: true } } },
    orderBy: [{ consultantId: 'asc' }, { priority: 'asc' }],
  });
}

export async function getConversation(ctx: Ctx, id: string) {
  assertCan(ctx, 'conversation.read');
  const conv = await db.conversation.findFirst({
    where: { ...conversationScope(ctx), id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      summaries: { orderBy: { createdAt: 'desc' }, take: 1 },
      lead: { include: { consultant: { include: { pj: true } }, memory: true, opportunities: { include: { stage: true }, orderBy: { createdAt: 'desc' }, take: 1 } } },
    },
  });
  if (!conv) throw NotFound('Conversa');
  return conv;
}

/** Estados da conversa (M§41): BOT_ACTIVE · HUMAN_ACTIVE · PAUSED · CLOSED. */
export type ConversationState = 'BOT_ACTIVE' | 'HUMAN_ACTIVE' | 'PAUSED' | 'CLOSED';
export function conversationState(c: { status: string; mode: string; botState: string }): ConversationState {
  if (c.status === 'CLOSED') return 'CLOSED';
  if (c.mode === 'HUMAN') return 'HUMAN_ACTIVE';
  if (c.botState === 'PAUSED') return 'PAUSED';
  return 'BOT_ACTIVE';
}

/** HUMAN OVERRIDE — pausar a IA sem assumir (ninguém responde automaticamente). */
export async function pauseAI(ctx: Ctx, id: string) {
  assertCan(ctx, 'conversation.handoff');
  const conv = await getConversation(ctx, id);
  await db.conversation.update({ where: { id }, data: { botState: 'PAUSED' } });
  await deliverMessage(ctx.orgId, id, { content: `IA pausada por ${ctx.userName}.`, senderType: 'SYSTEM' });
  await audit(ctx, 'conversation.ai_paused', { type: 'Conversation', id }, { leadId: conv.leadId });
  return getConversation(ctx, id);
}

export async function resumeAI(ctx: Ctx, id: string) {
  assertCan(ctx, 'conversation.handoff');
  const conv = await returnToBot(ctx, id);
  await audit(ctx, 'conversation.ai_resumed', { type: 'Conversation', id }, { leadId: conv.leadId });
  return conv;
}

export async function closeConversation(ctx: Ctx, id: string, reason?: string) {
  assertCan(ctx, 'conversation.handoff');
  const conv = await getConversation(ctx, id);
  await db.conversation.update({ where: { id }, data: { status: 'CLOSED', botState: 'PAUSED' } });
  await deliverMessage(ctx.orgId, id, { content: `Conversa encerrada por ${ctx.userName}${reason ? ` · ${reason.slice(0, 200)}` : ''}.`, senderType: 'SYSTEM' });
  await audit(ctx, 'conversation.closed', { type: 'Conversation', id }, { leadId: conv.leadId, reason });
  return getConversation(ctx, id);
}

export async function reopenConversation(ctx: Ctx, id: string) {
  assertCan(ctx, 'conversation.handoff');
  await getConversation(ctx, id);
  await db.conversation.update({ where: { id }, data: { status: 'OPEN' } });
  return getConversation(ctx, id);
}

/** Transfere a conversa (e o lead) para outro consultor. Exige lead.assign. */
export async function transferConversation(ctx: Ctx, id: string, consultantId: string) {
  assertCan(ctx, 'lead.assign');
  const conv = await getConversation(ctx, id);
  const { assignLeadManually } = await import('../lead-routing/routing.service');
  await assignLeadManually(ctx, conv.leadId, consultantId);
  await db.conversation.update({ where: { id }, data: { assignedConsultantId: consultantId, mode: 'HUMAN', botState: 'PAUSED' } });
  const target = await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId }, select: { name: true } });
  await deliverMessage(ctx.orgId, id, { content: `Conversa transferida para ${target?.name ?? 'outro consultor'} por ${ctx.userName}.`, senderType: 'SYSTEM' });
  const { notifyConsultant } = await import('../notifications/notification.service');
  await notifyConsultant(ctx.orgId, consultantId, { type: 'conversation.transfer', priority: 'HIGH', title: `Conversa transferida para você: ${conv.lead.name}`, body: `Por ${ctx.userName}`, link: `/conversas?c=${id}`, entityType: 'Lead', entityId: conv.leadId, dedupeKey: `transfer:${id}:${consultantId}:${Date.now()}` });
  await audit(ctx, 'conversation.transferred', { type: 'Conversation', id }, { leadId: conv.leadId, to: consultantId });
  return getConversation(ctx, id);
}

/** Consultor assume a conversa: bot pausado, humano ativo. */
export async function takeOver(ctx: Ctx, id: string) {
  assertCan(ctx, 'conversation.handoff');
  const conv = await getConversation(ctx, id);
  if (conv.mode === 'HUMAN') return conv;
  await db.conversation.update({ where: { id }, data: { mode: 'HUMAN', botState: 'PAUSED', assignedConsultantId: ctx.consultantId ?? conv.assignedConsultantId } });
  await deliverMessage(ctx.orgId, id, { content: `${ctx.userName} assumiu a conversa.`, senderType: 'SYSTEM' });
  await audit(ctx, 'conversation.takeover', { type: 'Conversation', id }, { leadId: conv.leadId });
  await publish(ctx.orgId, 'conversation.handoff', { conversationId: id, leadId: conv.leadId, by: 'human', userId: ctx.userId });
  return getConversation(ctx, id);
}

/** Devolve a conversa para a IA. */
export async function returnToBot(ctx: Ctx, id: string) {
  assertCan(ctx, 'conversation.handoff');
  const conv = await getConversation(ctx, id);
  if (conv.lead.optOut) throw BadRequest('Lead fez opt-out: a IA não pode retomar a conversa.');
  await db.conversation.update({ where: { id }, data: { mode: 'AI', botState: 'ACTIVE' } });
  await deliverMessage(ctx.orgId, id, { content: 'Conversa devolvida ao assistente automatizado.', senderType: 'SYSTEM' });
  return getConversation(ctx, id);
}

export async function humanReply(ctx: Ctx, id: string, content: string) {
  assertCan(ctx, 'conversation.reply');
  const text = content.trim();
  if (!text || text.length > 4000) throw BadRequest('Mensagem vazia ou muito longa.');
  const conv = await getConversation(ctx, id);
  if (conv.mode !== 'HUMAN') await takeOver(ctx, id);
  const msg = await deliverMessage(ctx.orgId, id, { content: text, senderType: 'HUMAN', senderName: ctx.userName });
  await db.lead.update({ where: { id: conv.leadId }, data: { lastInteractionAt: new Date() } });
  await db.leadActivity.create({
    data: { organizationId: ctx.orgId, leadId: conv.leadId, type: 'MESSAGE', description: `Mensagem enviada por ${ctx.userName}`, actorType: 'USER', actorId: ctx.userId },
  });
  return msg;
}
