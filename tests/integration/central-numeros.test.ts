import { beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { createApiKey, ctxFromApiKey } from '@/modules/auth/auth.service';
import { getSite, registerInterest, simulateCold } from '@/modules/landing-service/landing-service.service';
import { saveNumber, setNumberState, handleInboundMessage } from '@/modules/whatsapp/whatsapp.service';
import { getOrCreateConversation, listConversations } from '@/modules/conversations/conversation.service';
import { deliverMessage } from '@/modules/messaging/messaging.service';
import { providers } from '@/modules/integrations/registry';
import { getConsultantProfile, saveAiProfile } from '@/modules/consultants/consultant.service';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let svc: Ctx;
let admin: Ctx;

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Central');
  admin = await A.ctx(A.users.admin);
  const { secret } = await createApiKey(admin, 'Landing', ['landing.service']);
  svc = (await ctxFromApiKey(secret))!;
}, 120_000);

describe('Landing central → divisão igual', () => {
  it('site central não pertence a nenhuma PJ e não inventa contato', async () => {
    const site = await getSite(svc, 'central');
    expect(site).toMatchObject({ kind: 'CENTRAL', pj: null, contact: { whatsapp: null, phone: null } });
  });

  it('a simulação central não serve para a landing de uma PJ (e vice-versa)', async () => {
    await db.pJ.update({ where: { id: A.pjA.id }, data: { subdomain: 'pja-central-test', landingActive: true } });
    const sim = await simulateCold(svc, 'central', { product: 'IMOVEL', value: 200000 });
    expect((await db.simulation.findUniqueOrThrow({ where: { id: sim.simulationId } })).pjId).toBeNull();
    await expect(registerInterest(svc, 'pja-central-test', { simulationId: sim.simulationId, name: 'Cruzado', whatsapp: uniquePhone(), consentWhatsapp: true })).rejects.toThrow();
  });

  it('6 leads da central: 3 para cada PJ e, dentro da PJ, dividido entre os consultores', async () => {
    for (let i = 0; i < 6; i++) {
      const sim = await simulateCold(svc, 'central', { product: 'IMOVEL', value: 200000 + i * 1000 });
      const res = await registerInterest(svc, 'central', { simulationId: sim.simulationId, name: `Central ${i}`, whatsapp: uniquePhone(), consentWhatsapp: true, callNow: i % 2 === 0 });
      expect(res.heat).toBe(i % 2 === 0 ? 'QUENTE' : 'MORNO');
    }
    const leads = await db.lead.findMany({ where: { organizationId: A.org.id, name: { startsWith: 'Central ' } } });
    expect(leads).toHaveLength(6);
    expect(leads.every((l) => l.routingHint === 'CENTRAL' && l.originPjId === null && l.status === 'ASSIGNED')).toBe(true);
    const perPj = (pjId: string) => leads.filter((l) => l.pjId === pjId).length;
    expect([perPj(A.pjA.id), perPj(A.pjB.id)]).toEqual([3, 3]);
    const [c1, c2] = A.consultants;
    const a = [leads.filter((l) => l.consultantId === c1.id).length, leads.filter((l) => l.consultantId === c2.id).length];
    expect(Math.abs(a[0] - a[1])).toBeLessThanOrEqual(1);
    const decision = await db.routingDecision.findFirstOrThrow({ where: { leadId: leads[0].id } });
    expect(decision).toMatchObject({ ruleName: 'Landing central', method: 'EQUAL_SPLIT' });
  });

  it('número de fora do Brasil é aceito no formulário', async () => {
    const sim = await simulateCold(svc, 'central', { product: 'IMOVEL', value: 150000 });
    await registerInterest(svc, 'central', { simulationId: sim.simulationId, name: 'Brasileiro Exterior', whatsapp: '+1 305 555 0100', consentWhatsapp: true });
    expect((await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, name: 'Brasileiro Exterior' } })).phone).toBe('13055550100');
  });
});

describe('Números por consultor, Inbox unificado e backup', () => {
  let principal: { id: string };
  let backup: { id: string };

  it('consultor tem no máximo 7 números', async () => {
    const c3 = A.consultants[2];
    for (let i = 0; i < 7; i++) await saveNumber(admin, { name: `C3 ${i}`, phone: `+55 11 97000-10${String(i).padStart(2, '0')}`, purpose: 'TEAM', dailyLimit: 100, consultantId: c3.id, priority: i });
    await expect(saveNumber(admin, { name: 'C3 7', phone: '+55 11 97000-1099', purpose: 'TEAM', dailyLimit: 100, consultantId: c3.id })).rejects.toThrow(/no máximo 7/);
    await expect(saveNumber(admin, { name: 'Dup', phone: '+55 11 97000-1000', purpose: 'TEAM', dailyLimit: 100 })).rejects.toThrow(/já está cadastrado/);
  });

  it('conversa do lead do consultor sai pelo número principal dele', async () => {
    const c1 = A.consultants[0];
    principal = await saveNumber(admin, { name: 'C1 Principal', phone: '+55 11 96000-0001', purpose: 'TEAM', dailyLimit: 100, consultantId: c1.id, priority: 0 });
    backup = await saveNumber(admin, { name: 'C1 Backup', phone: '+55 11 96000-0002', purpose: 'TEAM', dailyLimit: 100, consultantId: c1.id, priority: 1 });
    await db.whatsAppNumber.updateMany({ where: { id: { in: [principal.id, backup.id] } }, data: { status: 'CONNECTED' } });
    const lead = await db.lead.create({ data: { organizationId: A.org.id, name: 'Lead do C1', phone: '5511955550001', source: 'MANUAL', consultantId: c1.id, pjId: A.pjA.id, status: 'ASSIGNED' } });
    const { conversation } = await getOrCreateConversation(A.org.id, lead.id);
    expect(conversation.whatsappNumberId).toBe(principal.id);
  });

  it('número caiu → conversa segue pelo backup, com registro, e o envio sai pelo backup', async () => {
    const conv = await db.conversation.findFirstOrThrow({ where: { organizationId: A.org.id, lead: { name: 'Lead do C1' } } });
    await setNumberState(admin, principal.id, { status: 'DISCONNECTED' });
    const moved = await db.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(moved.whatsappNumberId).toBe(backup.id);
    expect(await db.message.count({ where: { conversationId: conv.id, senderType: 'SYSTEM', content: { contains: 'backup C1 Backup' } } })).toBe(1);
    const msg = await deliverMessage(A.org.id, conv.id, { content: 'Oi, tudo bem?', senderType: 'HUMAN', senderName: 'Consultor Um' });
    expect(msg.status).toBe('SENT');
    expect((await db.whatsAppNumber.findUniqueOrThrow({ where: { id: backup.id } })).sentToday).toBe(1);
  });

  it('falha no provedor → número marcado com erro e a mensagem sai pelo próximo backup', async () => {
    const c1 = A.consultants[0];
    const third = await saveNumber(admin, { name: 'C1 Backup 2', phone: '+55 11 96000-0003', purpose: 'TEAM', dailyLimit: 100, consultantId: c1.id, priority: 2 });
    await db.whatsAppNumber.update({ where: { id: third.id }, data: { status: 'CONNECTED' } });
    const conv = await db.conversation.findFirstOrThrow({ where: { organizationId: A.org.id, lead: { name: 'Lead do C1' } } });
    const spy = vi.spyOn(providers.whatsapp, 'send').mockRejectedValueOnce(new Error('Número banido pelo provedor'));
    const msg = await deliverMessage(A.org.id, conv.id, { content: 'Seguimos por aqui', senderType: 'HUMAN', senderName: 'Consultor Um' });
    spy.mockRestore();
    expect(msg.status).toBe('SENT');
    expect(await db.whatsAppNumber.findUniqueOrThrow({ where: { id: backup.id } })).toMatchObject({ status: 'ERROR', lastError: expect.stringContaining('banido') });
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })).whatsappNumberId).toBe(third.id);
  });

  it('Inbox mostra todas as conversas de todos os números, com filtro por número', async () => {
    const all = await listConversations(admin, {});
    const mine = all.find((c) => c.lead.name === 'Lead do C1')!;
    expect(mine.number?.name).toBe('C1 Backup 2');
    expect(mine.messages[0]?.senderType).not.toBe('SYSTEM');
    expect((await listConversations(admin, { numberId: principal.id })).some((c) => c.id === mine.id)).toBe(false);
  });

  it('quem escreve no WhatsApp do consultor vira lead dele', async () => {
    const res = await handleInboundMessage(A.org.id, { from: '+55 11 95555-7777', to: '+55 11 96000-0003', text: 'Oi, quero saber do consórcio', externalId: `x-${Date.now()}` });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: res.leadId } });
    expect(lead.consultantId).toBe(A.consultants[0].id);
    expect((await db.routingDecision.findFirstOrThrow({ where: { leadId: lead.id } })).ruleName).toBe('WhatsApp do consultor');
    expect((await db.conversation.findUniqueOrThrow({ where: { id: res.conversationId } })).assignedConsultantId).toBe(A.consultants[0].id);
  });

  it('perfil: IA do consultor exige apresentação como assistente virtual', async () => {
    const consultant = await A.ctx(A.users.consultant);
    await expect(saveAiProfile(consultant, A.consultants[0].id, { enabled: true, presentation: 'Oi, aqui é o João' })).rejects.toThrow();
    await saveAiProfile(consultant, A.consultants[0].id, { enabled: true, assistantName: 'Ana' });
    await expect(saveAiProfile(consultant, A.consultants[1].id, { enabled: true })).rejects.toThrow(); // não edita a IA de outro
    const profile = await getConsultantProfile(consultant, A.consultants[0].id);
    expect(profile.aiProfile).toMatchObject({ enabled: true, assistantName: 'Ana' });
    expect(profile.consultant.whatsappNumbers.map((n) => n.name)).toEqual(['C1 Principal', 'C1 Backup', 'C1 Backup 2']);
  });
});
