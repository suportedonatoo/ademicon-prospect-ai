import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb } from '../helpers';
import { applyCredentials, saveCredentials } from '@/modules/platform/credentials.service';
import { createApiKey, ctxFromApiKey } from '@/modules/auth/auth.service';
import { registerInterest, simulateCold } from '@/modules/landing-service/landing-service.service';
import { receiveWebhook } from '@/modules/whatsapp/whatsapp.service';
import { updateOrgSettings } from '@/modules/organizations/settings';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let svc: Ctx;
let bot: { id: string; phone: string };
let calls: { url: string; body: Record<string, unknown> }[] = [];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const metaInbound = (from: string, toDisplay: string, phoneNumberId: string, id: string, text: string) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { metadata: { display_phone_number: toDisplay, phone_number_id: phoneNumberId }, contacts: [{ wa_id: from, profile: { name: 'Cliente Piloto' } }], messages: [{ from, id, type: 'text', text: { body: text } }] } }] }],
});
const mockMeta = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String((init as RequestInit)?.body ?? '{}')) });
    return json({ messages: [{ id: `wamid.out${calls.length}` }] });
  });

async function leadFromLanding(name: string, phone: string) {
  const sim = await simulateCold(svc, 'central', { product: 'IMOVEL', value: 300000 });
  return registerInterest(svc, 'central', { simulationId: sim.simulationId, name, whatsapp: phone, consentWhatsapp: true, callNow: true });
}

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org WhatsApp Piloto');
  const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'SUPER_ADMIN' } });
  const su = await A.ctx(await db.user.create({ data: { organizationId: A.org.id, email: `su-${Date.now()}@t.test`, name: 'Super', roleId: role.id, passwordHash: 'x' } }));
  // Só o número do BOT (operação) fica no ar, com o ID da Meta
  await db.whatsAppNumber.updateMany({ where: { organizationId: A.org.id }, data: { status: 'DISCONNECTED' } });
  const account = await db.whatsAppAccount.findFirstOrThrow({ where: { organizationId: A.org.id } });
  bot = await db.whatsAppNumber.create({ data: { organizationId: A.org.id, accountId: account.id, name: 'Bot do piloto', phone: '5511930000099', providerNumberId: '909090', status: 'CONNECTED', purpose: 'PROSPECT_BOT', dailyLimit: 1000 } });
  // Teste independente do relógio: sem horário de silêncio (o padrão 21h–8h bloqueia contato proativo à noite).
  await updateOrgSettings(A.org.id, { messaging: { quietHoursStart: 0, quietHoursEnd: 0 } } as never);
  const { secret } = await createApiKey(await A.ctx(A.users.admin), 'Landing', ['landing.service']);
  svc = (await ctxFromApiKey(secret))!;
  await saveCredentials(su, { WHATSAPP_PROVIDER: 'cloud-api', WHATSAPP_API_TOKEN: 'EAA-test-token', WHATSAPP_API_URL: 'https://graph.facebook.com/v23.0' });
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
  calls = [];
});

afterAll(async () => {
  await db.platformCredential.deleteMany();
  await applyCredentials();
});

describe('Piloto: WhatsApp oficial + bot', () => {
  it('lead da landing ganha o botão "Continuar no WhatsApp" para o número do bot, com o protocolo', async () => {
    mockMeta();
    const r = await leadFromLanding('Ana Botão', '+55 11 98888-0001');
    expect(r.whatsappUrl).toBe(`https://wa.me/${bot.phone}?text=${encodeURIComponent(`Olá! Acabei de fazer uma simulação no site (protocolo ${r.protocol}).`)}`);
  });

  it('sem template de abertura: o bot NÃO manda texto livre (a Meta recusaria) e avisa o motivo na conversa', async () => {
    mockMeta();
    await leadFromLanding('Bruno Sem Template', '+55 11 98888-0002');
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, phone: '5511988880002' } });
    const conv = await db.conversation.findFirstOrThrow({ where: { leadId: lead.id, channel: 'WHATSAPP' } });
    const msgs = await db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } });
    expect(calls.filter((c) => c.url.endsWith('/909090/messages'))).toHaveLength(0);
    expect(msgs.find((m) => m.senderType === 'AI')?.status).toBe('FAILED');
    expect(msgs.find((m) => m.senderType === 'SYSTEM')?.content).toMatch(/template aprovado.*iniciar conversas/);
  });

  it('cliente escreve pelo botão → o bot responde com texto livre pela API oficial (janela de 24 h aberta)', async () => {
    mockMeta();
    const res = (await receiveWebhook('whatsapp', A.org.slug, metaInbound('5511988880002', '+55 11 93000-0099', '909090', 'wamid.IN-B1', 'Olá! Acabei de fazer uma simulação no site'), {})) as { leadId: string; conversationId: string };
    const lead = await db.lead.findUniqueOrThrow({ where: { id: res.leadId } });
    expect(lead.phone).toBe('5511988880002'); // mesmo lead da landing, não um novo
    const sent = calls.find((c) => c.url.endsWith('/909090/messages'));
    expect(sent?.body).toMatchObject({ messaging_product: 'whatsapp', to: '5511988880002', type: 'text' });
  });

  it('com template de abertura aprovado: o bot inicia pela Meta com o template e os dados do lead', async () => {
    await db.messageTemplate.create({
      data: { organizationId: A.org.id, name: 'retorno_simulacao', category: 'UTILITY', language: 'pt_BR', status: 'APPROVED', variables: ['nome', 'produto'], body: 'Olá, {{nome}}! Recebemos sua simulação de {{produto}}. Posso continuar por aqui?' },
    });
    await updateOrgSettings(A.org.id, { messaging: { openerTemplate: 'retorno_simulacao' } } as never);
    mockMeta();
    await leadFromLanding('Carla Template', '+55 11 98888-0003');
    const sent = calls.find((c) => c.url.endsWith('/909090/messages'));
    expect(sent?.body).toMatchObject({
      to: '5511988880003',
      type: 'template',
      template: { name: 'retorno_simulacao', language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Carla' }, { type: 'text', text: 'Imóvel' }] }] },
    });
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, phone: '5511988880003' } });
    const ai = await db.message.findFirstOrThrow({ where: { conversation: { leadId: lead.id }, senderType: 'AI' } });
    expect(ai).toMatchObject({ status: 'SENT', content: 'Olá, Carla! Recebemos sua simulação de Imóvel. Posso continuar por aqui?' });
  });

  it('template de abertura que não está aprovado não é usado', async () => {
    await db.messageTemplate.updateMany({ where: { organizationId: A.org.id, name: 'retorno_simulacao' }, data: { status: 'PENDING' } });
    mockMeta();
    await leadFromLanding('Davi Pendente', '+55 11 98888-0004');
    expect(calls.filter((c) => c.url.endsWith('/909090/messages'))).toHaveLength(0);
  });

  it('número que recebeu a mensagem é achado pelo ID da Meta, mesmo com o número exibido em outro formato', async () => {
    mockMeta();
    const res = (await receiveWebhook('whatsapp', A.org.slug, metaInbound('5511977770001', '(11) 3000-0000 formato estranho', '909090', 'wamid.IN-E1', 'Oi'), {})) as { conversationId: string };
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: res.conversationId } });
    expect(conv.whatsappNumberId).toBe(bot.id);
  });
});
