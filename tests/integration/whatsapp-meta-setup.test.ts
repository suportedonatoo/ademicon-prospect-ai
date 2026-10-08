import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb } from '../helpers';
import { applyCredentials, saveCredentials } from '@/modules/platform/credentials.service';
import { importMetaNumbers, metaStatus, registerMetaNumber, subscribeApp } from '@/modules/whatsapp/meta-setup.service';
import { receiveWebhook } from '@/modules/whatsapp/whatsapp.service';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let su: Ctx;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
let subscribed = false;
const registered = new Set<string>(['111']);
const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];

function fakeMeta() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    const url = String(u);
    const method = (init as RequestInit)?.method ?? 'GET';
    const body = JSON.parse(String((init as RequestInit)?.body ?? '{}'));
    calls.push({ url, method, body });
    if (url.includes('/WABA-1/subscribed_apps')) {
      if (method === 'POST') subscribed = true;
      return json(method === 'POST' ? { success: true } : { data: subscribed ? [{ whatsapp_business_api_data: { id: 'app' } }] : [] });
    }
    if (url.includes('/WABA-1/phone_numbers'))
      return json({
        data: [
          { id: '111', display_phone_number: '+55 11 93000-0099', verified_name: 'Bot Ademicon', quality_rating: 'GREEN', platform_type: registered.has('111') ? 'CLOUD_API' : 'NOT_APPLICABLE', status: 'CONNECTED' },
          { id: '222', display_phone_number: '+55 11 94444-0001', verified_name: 'Consultora Ana', quality_rating: 'GREEN', platform_type: registered.has('222') ? 'CLOUD_API' : 'NOT_APPLICABLE', status: registered.has('222') ? 'CONNECTED' : 'PENDING' },
        ],
      });
    if (url.endsWith('/222/register')) {
      if (body.pin !== '123456') return json({ error: { message: 'PIN incorreto', code: 133005 } }, 400);
      registered.add('222');
      return json({ success: true });
    }
    if (url.includes('/messages')) return json({ messages: [{ id: `wamid.out${calls.length}` }] });
    return json({ error: { message: 'não previsto' } }, 404);
  });
}

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Meta Setup');
  const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'SUPER_ADMIN' } });
  su = await A.ctx(await db.user.create({ data: { organizationId: A.org.id, email: `su-${Date.now()}@t.test`, name: 'Super', roleId: role.id, passwordHash: 'x' } }));
  const account = await db.whatsAppAccount.findFirstOrThrow({ where: { organizationId: A.org.id } });
  // Já cadastrado à mão, sem o ID da Meta:
  await db.whatsAppNumber.create({ data: { organizationId: A.org.id, accountId: account.id, name: 'Bot do piloto', phone: '5511930000099', status: 'DISCONNECTED', purpose: 'PROSPECT_BOT', dailyLimit: 1000 } });
  await saveCredentials(su, { WHATSAPP_PROVIDER: 'cloud-api', WHATSAPP_API_TOKEN: 'EAA-test-token', WHATSAPP_API_URL: 'https://graph.facebook.com/v23.0', WHATSAPP_BUSINESS_ACCOUNT_ID: 'WABA-1' });
}, 120_000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await db.platformCredential.deleteMany();
  await applyCredentials();
});

describe('Conexão com a Meta (WhatsApp)', () => {
  it('mostra o que falta: app não inscrito e números ainda fora do sistema', async () => {
    fakeMeta();
    const s = await metaStatus(su);
    expect(s.checks).toMatchObject({ token: true, waba: true, subscribed: false });
    expect(s.numbers.map((n) => [n.id, n.registered, n.local?.linked ?? null])).toEqual([
      ['111', true, false],
      ['222', false, null],
    ]);
  });

  it('inscrever o app na conta', async () => {
    fakeMeta();
    await subscribeApp(su);
    expect(calls.some((c) => c.url.endsWith('/WABA-1/subscribed_apps') && c.method === 'POST')).toBe(true);
    expect((await metaStatus(su)).checks.subscribed).toBe(true);
  });

  it('importar: o número já cadastrado ganha o ID da Meta e o novo entra como número da operação', async () => {
    fakeMeta();
    expect(await importMetaNumbers(su)).toEqual({ total: 2, linked: 1, created: 1 });
    const bot = await db.whatsAppNumber.findFirstOrThrow({ where: { organizationId: A.org.id, phone: '5511930000099' } });
    expect(bot).toMatchObject({ providerNumberId: '111', status: 'CONNECTED' });
    const ana = await db.whatsAppNumber.findFirstOrThrow({ where: { organizationId: A.org.id, providerNumberId: '222' } });
    expect(ana).toMatchObject({ name: 'Consultora Ana', phone: '5511944440001', status: 'DISCONNECTED', consultantId: null });
    expect(ana.lastError).toMatch(/registrar/i);
    // Importar de novo não duplica.
    expect(await importMetaNumbers(su)).toEqual({ total: 2, linked: 0, created: 0 });
  });

  it('registrar com o PIN: PIN errado é recusado com a mensagem da Meta; o certo deixa o número no ar', async () => {
    fakeMeta();
    const ana = await db.whatsAppNumber.findFirstOrThrow({ where: { organizationId: A.org.id, providerNumberId: '222' } });
    await expect(registerMetaNumber(su, ana.id, '12')).rejects.toThrow(/6 dígitos/);
    await expect(registerMetaNumber(su, ana.id, '000000')).rejects.toThrow(/PIN incorreto/);
    await registerMetaNumber(su, ana.id, '123456');
    expect(calls.find((c) => c.url.endsWith('/222/register') && c.body.pin === '123456')?.body).toEqual({ messaging_product: 'whatsapp', pin: '123456' });
    expect((await db.whatsAppNumber.findUniqueOrThrow({ where: { id: ana.id } })).status).toBe('CONNECTED');
  });

  it('mensagem recebida no número importado cai no Inbox, no número certo', async () => {
    fakeMeta();
    const r = (await receiveWebhook('whatsapp', A.org.slug, {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { metadata: { display_phone_number: '5511944440001', phone_number_id: '222' }, contacts: [{ wa_id: '5511977770000', profile: { name: 'Carlos' } }], messages: [{ from: '5511977770000', id: 'wamid.in.1', type: 'text', text: { body: 'Oi, quero um consórcio' } }] } }] }],
    }, {})) as { results?: { conversationId?: string }[] };
    const conv = await db.conversation.findFirstOrThrow({ where: { lead: { phone: '5511977770000' } } });
    const num = await db.whatsAppNumber.findUniqueOrThrow({ where: { id: conv.whatsappNumberId! } });
    expect(num.providerNumberId).toBe('222');
    expect(r).toBeTruthy();
  });

  it('só quem configura o WhatsApp mexe na conexão', async () => {
    const consultor = await A.ctx(A.users.consultant);
    await expect(metaStatus(consultor)).rejects.toThrow();
  });
});
