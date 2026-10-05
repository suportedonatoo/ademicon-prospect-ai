import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { logger } from '@/lib/logger';
import { providers } from '../integrations/registry';
import { getOrgSettings } from '../organizations/settings';
import { isUsable, markNumberError, resolveSendingNumber, switchConversationNumber } from '../whatsapp/number-pool';
import { sendInstagram } from '../instagram/instagram.service';

// Envio de mensagens com governança: opt-out, consentimento, preferências,
// frequência semanal, horário de silêncio e limites diários do número.

export interface ContactCheck {
  allowed: boolean;
  reason?: string;
}

/** Verifica se podemos iniciar contato PROATIVO (sem o lead ter falado antes) no WhatsApp. */
export async function canContactProactively(orgId: string, leadId: string, now = new Date()): Promise<ContactCheck> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId: orgId },
    include: { preference: true, consents: { where: { channel: { in: ['WHATSAPP', 'ALL'] } }, orderBy: { createdAt: 'desc' } } },
  });
  if (!lead) return { allowed: false, reason: 'Lead não encontrado' };
  if (lead.optOut) return { allowed: false, reason: 'Lead fez opt-out' };
  if (lead.status === 'BLOCKED') return { allowed: false, reason: 'Lead bloqueado' };
  if (!lead.phone) return { allowed: false, reason: 'Lead sem telefone' };
  const consent = lead.consents[0];
  if (!consent || consent.status !== 'GRANTED') return { allowed: false, reason: 'Sem consentimento (opt-in) para WhatsApp' };
  if (lead.preference && !lead.preference.allowWhatsapp) return { allowed: false, reason: 'Preferência do lead: não usar WhatsApp' };

  const settings = await getOrgSettings(orgId);
  const hour = Number(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }));
  const { quietHoursStart: qs, quietHoursEnd: qe } = settings.messaging;
  const inQuiet = qs > qe ? hour >= qs || hour < qe : hour >= qs && hour < qe;
  if (inQuiet) return { allowed: false, reason: `Horário de silêncio (${qs}h–${qe}h)` };

  const cap = lead.preference?.frequencyCapPerWeek ?? settings.messaging.frequencyCapPerWeek;
  const recent = await db.leadActivity.count({
    where: { leadId, type: 'PROACTIVE_CONTACT', createdAt: { gte: new Date(now.getTime() - 7 * 86400_000) } },
  });
  if (recent >= cap) return { allowed: false, reason: `Limite de ${cap} contatos proativos por semana atingido` };
  return { allowed: true };
}

export async function pickNumber(orgId: string, purpose: 'PROSPECT_BOT' | 'QUALIFICATION_BOT' | 'TEAM') {
  // Só números da operação: o número pessoal de um consultor nunca é usado para outro atendimento.
  const numbers = await db.whatsAppNumber.findMany({ where: { organizationId: orgId, status: 'CONNECTED', paused: false, consultantId: null }, orderBy: { createdAt: 'asc' } });
  return numbers.find((n) => n.purpose === purpose && n.sentToday < n.dailyLimit) ?? numbers.find((n) => n.sentToday < n.dailyLimit) ?? null;
}

export async function deliverMessage(
  orgId: string,
  conversationId: string,
  m: {
    content: string;
    senderType: 'AI' | 'HUMAN' | 'SYSTEM';
    agentKey?: string | null;
    senderName?: string | null;
    aiExecutionId?: string | null;
    /** Template aprovado (obrigatório na API oficial fora da janela de 24 h). */
    template?: { name: string; language: string; variables: string[] } | null;
  }
) {
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { lead: true } });
  let status = 'SENT';
  let externalId: string | undefined;
  let note: string | null = null;

  if (m.senderType !== 'SYSTEM' && conversation.channel === 'INSTAGRAM') {
    const r = conversation.lead.optOut ? { status: 'BLOCKED' } : await sendInstagram(orgId, conversation.leadId, m.content);
    status = r.status;
    externalId = 'externalId' in r ? r.externalId : undefined;
    if ('error' in r && r.error) note = `Instagram não entregou: ${r.error}`;
  }

  if (m.senderType !== 'SYSTEM' && conversation.channel === 'WHATSAPP' && !m.template && m.senderType === 'AI' && providers.whatsapp.mode === 'real' && !(await insideServiceWindow(conversationId))) {
    // Bot iniciando a conversa (ex.: lead da landing): a API oficial só aceita template aprovado.
    const opener = await openerTemplateFor(orgId, conversation.lead);
    if (opener) {
      m = { ...m, template: opener.template, content: opener.text };
    }
  }

  if (m.senderType !== 'SYSTEM' && conversation.channel === 'WHATSAPP') {
    if (conversation.lead.optOut) status = 'BLOCKED';
    else if (providers.whatsapp.mode === 'real' && !m.template && !(await insideServiceWindow(conversationId))) {
      // Regra da API oficial: texto livre só até 24 h depois da última mensagem do cliente.
      status = 'FAILED';
      note =
        m.senderType === 'AI'
          ? 'O bot não iniciou no WhatsApp: fora da janela de 24 h a Meta só aceita template aprovado. Aprove um template e marque "Usar para iniciar conversas" (WhatsApp → Templates), ou aguarde o cliente escrever.'
          : 'Fora da janela de 24 h do WhatsApp: só é possível enviar um template aprovado (WhatsApp → Templates).';
    } else {
      // Número da conversa; se ele caiu, segue pelo backup do mesmo consultor (number-pool).
      // Falha no envio → o número é marcado com erro e tentamos UMA vez pelo backup.
      const tried: string[] = [];
      status = 'QUEUED';
      for (let attempt = 0; attempt < 2; attempt++) {
        const { number, previous } = await resolveSendingNumber(orgId, conversation, tried);
        if (!number) break;
        if (number.id !== conversation.whatsappNumberId) {
          await switchConversationNumber(orgId, conversationId, previous, number);
          conversation.whatsappNumberId = number.id;
        }
        if (!isUsable(number)) break; // no ar, mas no limite diário: fica na fila (sem trocar de número)
        try {
          const res = await providers.whatsapp.send({ fromNumberId: number.id, to: conversation.lead.phone ?? '', text: m.content, template: m.template ?? undefined });
          status = res.status;
          externalId = res.externalId || undefined;
          if (res.status === 'FAILED' && res.error) note = `WhatsApp não entregou: ${res.error}`;
          await db.whatsAppNumber.update({ where: { id: number.id }, data: { sentToday: { increment: 1 } } });
          break;
        } catch (e) {
          status = 'FAILED';
          tried.push(number.id);
          logger.error('whatsapp.send_failed', { conversationId, numberId: number.id, error: String(e) });
          await markNumberError(orgId, number.id, String(e));
          conversation.whatsappNumberId = (await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { whatsappNumberId: true } })).whatsappNumberId;
        }
      }
    }
  }

  const message = await db.message.create({
    data: {
      organizationId: orgId,
      conversationId,
      direction: 'OUTBOUND',
      senderType: m.senderType,
      agentKey: m.agentKey ?? undefined,
      senderName: m.senderName ?? undefined,
      content: m.content,
      status,
      externalId,
      aiExecutionId: m.aiExecutionId ?? undefined,
    },
  });
  await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  if (note) await db.message.create({ data: { organizationId: orgId, conversationId, direction: 'OUTBOUND', senderType: 'SYSTEM', content: note, status: 'SENT' } });
  if (m.senderType !== 'SYSTEM') await publish(orgId, 'conversation.message_sent', { conversationId, leadId: conversation.leadId, messageId: message.id, senderType: m.senderType, status });
  return message;
}

/** Template de abertura configurado e APROVADO, com as variáveis preenchidas ({{nome}}, {{produto}}). */
async function openerTemplateFor(orgId: string, lead: { name: string; product: string | null }) {
  const { getOrgSettings } = await import('../organizations/settings');
  const name = (await getOrgSettings(orgId)).messaging.openerTemplate;
  if (!name) return null;
  const t = await db.messageTemplate.findFirst({ where: { organizationId: orgId, name, status: 'APPROVED' } });
  if (!t) return null;
  const { productLabel } = await import('../leads/catalog');
  const values: Record<string, string> = { nome: lead.name.trim().split(/\s+/)[0] ?? lead.name, produto: lead.product ? productLabel(lead.product) : 'consórcio' };
  const variables = t.variables.map((v) => values[v] ?? '-');
  const text = t.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, v: string) => values[v] ?? '-');
  return { template: { name: t.name, language: t.language, variables }, text };
}

/** Janela de atendimento do WhatsApp: a última mensagem do cliente foi há menos de 24 h. */
export async function insideServiceWindow(conversationId: string, now = new Date()) {
  const last = await db.message.findFirst({ where: { conversationId, direction: 'INBOUND' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  return !!last && now.getTime() - last.createdAt.getTime() < 24 * 3600_000;
}
