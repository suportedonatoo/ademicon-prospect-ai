import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { receiveInboundMessage, startWebGreeting } from '@/modules/ai/maestro/maestro.engine';
import { findOrCreateOpenConversation } from '@/modules/conversations/conversation.service';

// Lead do link próprio do Anderson: a IA é assistente DELE e a transferência apresenta o Anderson pelo nome,
// sem "um consultor vai continuar" (que soa como outra pessoa) e sem pergunta + transferência na mesma hora.
type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let anderson: { id: string };

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Handoff');
  anderson = await db.consultant.create({ data: { organizationId: A.org.id, pjId: A.pjA.id, name: 'Anderson Rodrigues', email: `anderson-${Date.now()}@t.test`, products: [] } });
}, 120_000);

describe('Transferência para o consultor dono do lead', () => {
  it('abertura: apresenta-se como assistente do Anderson e não transfere antes de o cliente responder', async () => {
    const lead = await db.lead.create({ data: { organizationId: A.org.id, name: 'José Cliente', phone: uniquePhone(), consultantId: anderson.id, pjId: A.pjA.id, status: 'ASSIGNED', source: 'LANDING', routingHint: `LINK:${anderson.id}`, intent: 'HIGH', temperature: 'QUENTE', product: 'IMOVEL' } });
    const { conversation } = await findOrCreateOpenConversation(A.org.id, lead.id, 'WEB', { currentAgent: 'QUALIFICATION', assignedConsultantId: anderson.id });
    const r = await startWebGreeting(A.org.id, conversation.id);
    expect(r.handoff).toBe(false);
    const msgs = await db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain('assistente virtual de Anderson');
  });

  it('cliente pede para falar com alguém: só a mensagem de transferência, com o nome do Anderson', async () => {
    const lead = await db.lead.create({ data: { organizationId: A.org.id, name: 'Maria Cliente', phone: uniquePhone(), consultantId: anderson.id, pjId: A.pjA.id, status: 'ASSIGNED', source: 'LANDING', routingHint: `LINK:${anderson.id}`, product: 'IMOVEL' } });
    const { conversation } = await findOrCreateOpenConversation(A.org.id, lead.id, 'WEB', { currentAgent: 'QUALIFICATION', assignedConsultantId: anderson.id });
    const r = await receiveInboundMessage(A.org.id, conversation.id, 'Quero falar com um consultor agora');
    expect(r.handoff).toBe(true);
    const ai = await db.message.findMany({ where: { conversationId: conversation.id, senderType: 'AI' } });
    expect(ai.map((m) => m.content)).toEqual(['Obrigado pelas informações! Agora Anderson continua o seu atendimento por aqui.']);
    expect(ai.some((m) => /um consultor/i.test(m.content))).toBe(false);
  });

  it('transferido e o consultor não respondeu em 10 min: a IA responde o cliente (sem transferir de novo)', async () => {
    const lead = await db.lead.create({ data: { organizationId: A.org.id, name: 'Paulo Cliente', phone: uniquePhone(), consultantId: anderson.id, pjId: A.pjA.id, status: 'ASSIGNED', source: 'LANDING', product: 'IMOVEL' } });
    const { conversation } = await findOrCreateOpenConversation(A.org.id, lead.id, 'WEB', { currentAgent: 'QUALIFICATION', assignedConsultantId: anderson.id });
    await db.conversation.update({ where: { id: conversation.id }, data: { mode: 'HUMAN', botState: 'PAUSED' } });
    await db.message.create({ data: { organizationId: A.org.id, conversationId: conversation.id, direction: 'OUTBOUND', senderType: 'SYSTEM', content: 'Handoff: IA pausada · consultor ativo · motivo: teste', status: 'SENT', createdAt: new Date(Date.now() - 11 * 60_000) } });
    const r = await receiveInboundMessage(A.org.id, conversation.id, 'Oi, ainda estou aguardando');
    expect(r.handoff).toBe(false);
    expect(await db.message.count({ where: { conversationId: conversation.id, senderType: 'AI' } })).toBe(1);
    // o consultor assumiu (mensagem dele) → a IA volta a ficar em silêncio
    await db.message.create({ data: { organizationId: A.org.id, conversationId: conversation.id, direction: 'OUTBOUND', senderType: 'HUMAN', content: 'Oi Paulo, aqui é o Anderson', status: 'SENT' } });
    const r2 = await receiveInboundMessage(A.org.id, conversation.id, 'Oi Anderson!');
    expect(r2.skipped).toMatch(/IA pausada/);
  });

  it('conversa sem mensagem há 7 dias é encerrada; a recente continua aberta', async () => {
    const { closeStaleConversations } = await import('@/modules/conversations/conversation.service');
    const lead = await db.lead.create({ data: { organizationId: A.org.id, name: 'Antiga', phone: uniquePhone(), consultantId: anderson.id, pjId: A.pjA.id, status: 'ASSIGNED', source: 'LANDING' } });
    const velha = await db.conversation.create({ data: { organizationId: A.org.id, leadId: lead.id, channel: 'WHATSAPP', lastMessageAt: new Date(Date.now() - 8 * 86400_000) } });
    const nova = await db.conversation.create({ data: { organizationId: A.org.id, leadId: lead.id, channel: 'WEB', lastMessageAt: new Date() } });
    expect(await closeStaleConversations(A.org.id)).toBeGreaterThanOrEqual(1);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: velha.id } })).status).toBe('CLOSED');
    expect((await db.conversation.findUniqueOrThrow({ where: { id: nova.id } })).status).toBe('OPEN');
  });
});
