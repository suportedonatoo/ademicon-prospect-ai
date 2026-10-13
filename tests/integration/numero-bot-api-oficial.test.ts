import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { createOrg, resetDb } from '../helpers';
import { getOrCreateConversation } from '@/modules/conversations/conversation.service';
import { resolveSendingNumber } from '@/modules/whatsapp/number-pool';

// Piloto: um número de bot na API oficial para todos; o número pessoal do consultor é só contato.
describe('API oficial: conversa de lead com consultor sai pelo número do bot', () => {
  let A: Awaited<ReturnType<typeof createOrg>>;
  const E = env as unknown as Record<string, unknown>;
  let personalId = '';

  beforeAll(async () => {
    await resetDb();
    A = await createOrg('Org Bot Único');
    const acc = await db.whatsAppAccount.create({ data: { organizationId: A.org.id, name: 'Conta', provider: 'real' } });
    const base = { organizationId: A.org.id, accountId: acc.id, status: 'CONNECTED', dailyLimit: 250 };
    await db.whatsAppNumber.create({ data: { ...base, name: 'Bot', phone: '551151940000', purpose: 'PROSPECT_BOT', provider: 'real', providerNumberId: 'PNID-1' } });
    personalId = (await db.whatsAppNumber.create({ data: { ...base, name: 'Pessoal', phone: '5511999990000', purpose: 'TEAM', provider: 'mock', consultantId: A.consultants[0].id } })).id;
  }, 120_000);
  afterAll(() => {
    E.WHATSAPP_PROVIDER = 'mock';
  });

  it('modo oficial: usa o bot; modo simulado: mantém o número do consultor', async () => {
    const mk = (phone: string) => db.lead.create({ data: { organizationId: A.org.id, name: 'Lead', phone, source: 'MANUAL', consultantId: A.consultants[0].id, pjId: A.pjA.id } });

    E.WHATSAPP_PROVIDER = 'mock';
    const sim = await getOrCreateConversation(A.org.id, (await mk('5511988880001')).id);
    expect(sim.conversation.whatsappNumberId).toBe(personalId);

    E.WHATSAPP_PROVIDER = 'cloud-api';
    const real = await getOrCreateConversation(A.org.id, (await mk('5511988880002')).id);
    const used = await db.whatsAppNumber.findUniqueOrThrow({ where: { id: real.conversation.whatsappNumberId! } });
    expect(used.consultantId).toBeNull(); // número da operação (bot), nunca o pessoal
    expect(used.id).not.toBe(personalId);

    // Conversa antiga presa ao número pessoal (sem ID da Meta) e esse número cai: segue pelo bot, não trava.
    await db.whatsAppNumber.update({ where: { id: personalId }, data: { status: 'ERROR' } });
    const r = await resolveSendingNumber(A.org.id, { whatsappNumberId: personalId, assignedConsultantId: A.consultants[0].id });
    expect(r.number?.consultantId).toBeNull();
    expect(r.number?.id).not.toBe(personalId);
  });
});
