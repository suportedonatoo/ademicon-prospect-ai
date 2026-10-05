import { db } from '@/lib/db';
import { BadRequest, Unauthorized } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { verifyToken } from '@/lib/signed-token';
import { receiveInboundMessage, startWebGreeting } from '../ai/maestro/maestro.engine';
import { findOrCreateOpenConversation } from './conversation.service';

// Chat público da landing page (canal WEB). Acesso por token assinado entregue após a simulação.

async function resolve(token: string) {
  const data = verifyToken<{ l: string; o: string }>(token);
  if (!data) throw Unauthorized('Sessão de chat expirada. Faça uma nova simulação.');
  const lead = await db.lead.findFirst({ where: { id: data.l, organizationId: data.o, deletedAt: null } });
  if (!lead) throw Unauthorized('Sessão inválida.');
  return lead;
}

async function webConversation(orgId: string, leadId: string, agent: 'PROSPECT' | 'QUALIFICATION') {
  return (await findOrCreateOpenConversation(orgId, leadId, 'WEB', { currentAgent: agent })).conversation;
}

function view(messages: { id: string; senderType: string; content: string; createdAt: Date; senderName: string | null }[]) {
  return messages.filter((m) => m.senderType !== 'SYSTEM').map((m) => ({ id: m.id, from: m.senderType === 'LEAD' ? 'me' : m.senderType === 'HUMAN' ? 'human' : 'bot', name: m.senderName, text: m.content, at: m.createdAt }));
}

export async function publicChatHistory(token: string) {
  const lead = await resolve(token);
  const conv = await db.conversation.findFirst({ where: { organizationId: lead.organizationId, leadId: lead.id, channel: 'WEB' }, orderBy: { createdAt: 'asc' }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  return { mode: conv?.mode ?? 'AI', messages: conv ? view(conv.messages) : [] };
}

/** Abre o chat: se ainda não houver mensagem do bot, o Maestro envia a saudação. */
export async function publicChatOpen(token: string) {
  const lead = await resolve(token);
  const agent = (lead.signals as { requestedContact?: boolean })?.requestedContact || ['MORNO', 'QUENTE'].includes(lead.temperature) ? 'QUALIFICATION' : 'PROSPECT';
  const conv = await webConversation(lead.organizationId, lead.id, agent);
  const count = await db.message.count({ where: { conversationId: conv.id } });
  if (!count) {
    await startWebGreeting(lead.organizationId, conv.id);
  }
  return publicChatHistory(token);
}

export async function publicChatSend(token: string, text: string, ip?: string | null) {
  const clean = String(text ?? '').trim();
  if (!clean || clean.length > 1000) throw BadRequest('Mensagem vazia ou muito longa.');
  const lead = await resolve(token);
  await rateLimit(`chat:${lead.id}:${ip ?? ''}`, 30, 60);
  if (lead.optOut) throw BadRequest('Você optou por não receber mensagens.');
  const conv = await webConversation(lead.organizationId, lead.id, 'PROSPECT');
  await receiveInboundMessage(lead.organizationId, conv.id, clean);
  return publicChatHistory(token);
}
