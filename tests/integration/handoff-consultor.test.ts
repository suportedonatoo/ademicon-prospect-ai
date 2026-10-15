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
});
