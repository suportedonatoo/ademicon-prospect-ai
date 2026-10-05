import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb } from '../helpers';
import { applyCredentials, saveCredentials } from '@/modules/platform/credentials.service';
import { providers } from '@/modules/integrations/registry';
import { CloudApiWhatsAppProvider } from '@/modules/integrations/whatsapp/whatsapp.provider';
import { RealCompanyRegistryProvider } from '@/modules/integrations/company-registry/company-registry.provider';
import { receiveWebhook } from '@/modules/whatsapp/whatsapp.service';
import { deliverMessage } from '@/modules/messaging/messaging.service';
import { receiveInstagram } from '@/modules/instagram/instagram.service';
import { deleteTraining, embedUrl, listTraining, saveTraining, setCompleted, teamProgress } from '@/modules/training/training.service';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let su: Ctx;
let principal: { id: string };
let backup: { id: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const metaInbound = (from: string, to: string, id: string, text: string) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { metadata: { display_phone_number: to, phone_number_id: '111' }, contacts: [{ wa_id: from, profile: { name: 'Carla WhatsApp' } }], messages: [{ from, id, type: 'text', text: { body: text } }] } }] }],
});

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Canais');
  const role = await db.role.findFirstOrThrow({ where: { organizationId: A.org.id, key: 'SUPER_ADMIN' } });
  const user = await db.user.create({ data: { organizationId: A.org.id, email: `su-${Date.now()}@t.test`, name: 'Super Teste', roleId: role.id, passwordHash: 'x' } });
  su = await A.ctx(user);
  const account = await db.whatsAppAccount.findFirstOrThrow({ where: { organizationId: A.org.id } });
  const c1 = A.consultants[0];
  principal = await db.whatsAppNumber.create({ data: { organizationId: A.org.id, accountId: account.id, consultantId: c1.id, name: 'C1 principal', phone: '5511960000001', providerNumberId: '111', status: 'CONNECTED', priority: 0, purpose: 'TEAM' } });
  backup = await db.whatsAppNumber.create({ data: { organizationId: A.org.id, accountId: account.id, consultantId: c1.id, name: 'C1 backup', phone: '5511960000002', providerNumberId: '222', status: 'CONNECTED', priority: 1, purpose: 'TEAM' } });
  await saveCredentials(su, { WHATSAPP_PROVIDER: 'cloud-api', WHATSAPP_API_TOKEN: 'EAA-test-token', WHATSAPP_API_URL: 'https://graph.facebook.com/v23.0' });
}, 120_000);

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await db.platformCredential.deleteMany();
  await applyCredentials();
});

describe('WhatsApp oficial (Cloud API)', () => {
  it('provider real ativo com o token salvo no painel', () => {
    expect(providers.whatsapp).toBeInstanceOf(CloudApiWhatsAppProvider);
  });

  it('mensagem recebida vira lead do dono do número e a IA responde pela API oficial', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String((init as RequestInit)?.body ?? '{}')) });
      return json({ messages: [{ id: `wamid.${calls.length}` }] });
    });
    const res = (await receiveWebhook('whatsapp', A.org.slug, metaInbound('5511955551234', '5511960000001', 'wamid.IN1', 'Oi, quero simular um consórcio'), {})) as { leadId: string; conversationId: string };
    const lead = await db.lead.findUniqueOrThrow({ where: { id: res.leadId } });
    expect(lead).toMatchObject({ phone: '5511955551234', consultantId: A.consultants[0].id, name: 'Carla Whatsapp' });
    const reply = await db.message.findFirstOrThrow({ where: { conversationId: res.conversationId, direction: 'OUTBOUND', senderType: 'AI' } });
    expect(reply).toMatchObject({ status: 'SENT', externalId: 'wamid.1' });
    expect(calls[0].url).toBe('https://graph.facebook.com/v23.0/111/messages');
    expect(calls[0].body).toMatchObject({ messaging_product: 'whatsapp', to: '5511955551234', type: 'text' });
  });

  it('status de entrega (lida) chega pelo webhook e atualiza a mensagem', async () => {
    await receiveWebhook('whatsapp', A.org.slug, { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'read' }] } }] }] }, {});
    expect((await db.message.findFirstOrThrow({ where: { externalId: 'wamid.1' } })).status).toBe('READ');
  });

  it('erro da MENSAGEM só marca a mensagem (o número continua no ar)', async () => {
    const conv = await db.conversation.findFirstOrThrow({ where: { organizationId: A.org.id, lead: { phone: '5511955551234' } } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { code: 131026, message: 'Message undeliverable' } }, 400));
    const m = await deliverMessage(A.org.id, conv.id, { content: 'Olá!', senderType: 'HUMAN', senderName: 'Consultor Um' });
    expect(m.status).toBe('FAILED');
    expect((await db.whatsAppNumber.findUniqueOrThrow({ where: { id: principal.id } })).status).toBe('CONNECTED');
    expect(await db.message.count({ where: { conversationId: conv.id, senderType: 'SYSTEM', content: { contains: '131026' } } })).toBe(1);
  });

  it('erro do NÚMERO (token/bloqueio) → número com erro e a mensagem sai pelo backup', async () => {
    const conv = await db.conversation.findFirstOrThrow({ where: { organizationId: A.org.id, lead: { phone: '5511955551234' } } });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/111/') ? json({ error: { code: 131031, message: 'Account has been locked' } }, 400) : json({ messages: [{ id: 'wamid.backup' }] })
    );
    const m = await deliverMessage(A.org.id, conv.id, { content: 'Seguimos por aqui', senderType: 'HUMAN', senderName: 'Consultor Um' });
    expect(m).toMatchObject({ status: 'SENT', externalId: 'wamid.backup' });
    expect(await db.whatsAppNumber.findUniqueOrThrow({ where: { id: principal.id } })).toMatchObject({ status: 'ERROR', lastError: expect.stringContaining('131031') });
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })).whatsappNumberId).toBe(backup.id);
  });

  it('fora da janela de 24 h: texto livre é barrado; template aprovado sai', async () => {
    const conv = await db.conversation.findFirstOrThrow({ where: { organizationId: A.org.id, lead: { phone: '5511955551234' } } });
    await db.message.updateMany({ where: { conversationId: conv.id, direction: 'INBOUND' }, data: { createdAt: new Date(Date.now() - 30 * 3600_000) } });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ messages: [{ id: 'wamid.tpl' }] }));
    const blocked = await deliverMessage(A.org.id, conv.id, { content: 'Oi de novo', senderType: 'HUMAN' });
    expect(blocked.status).toBe('FAILED');
    expect(spy).not.toHaveBeenCalled();
    const ok = await deliverMessage(A.org.id, conv.id, { content: 'Olá Carla!', senderType: 'AI', template: { name: 'retomada', language: 'pt_BR', variables: ['Carla'] } });
    expect(ok.status).toBe('SENT');
    const body = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ type: 'template', template: { name: 'retomada', language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Carla' }] }] } });
  });

  it('template vai para aprovação com variáveis no formato da Meta ({{1}})', async () => {
    await saveCredentials(su, { WHATSAPP_BUSINESS_ACCOUNT_ID: '999' });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 't1', status: 'PENDING' }));
    const r = await providers.whatsapp.submitTemplate({ name: 'boas_vindas', category: 'MARKETING', language: 'pt_BR', body: 'Olá {{nome}}, tudo bem? Seu plano {{plano}} está pronto.' });
    expect(r.status).toBe('PENDING');
    expect(String(spy.mock.calls[0][0])).toContain('/999/message_templates');
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)).components[0].text).toBe('Olá {{1}}, tudo bem? Seu plano {{2}} está pronto.');
  });
});

describe('Instagram Direct', () => {
  const dm = (sender: string, mid: string, text: string, echo = false) => ({ object: 'instagram', entry: [{ id: 'IGACC', messaging: [{ sender: { id: sender }, recipient: { id: 'IGACC' }, message: { mid, text, ...(echo ? { is_echo: true } : {}) } }] }] });

  it('sem token: vira lead + conversa no Inbox e a IA responde (envio simulado)', async () => {
    const r = await receiveInstagram(A.org.slug, dm('IGSID-1', 'mid-1', 'Oi! Quero saber sobre consórcio de imóvel'));
    expect(r.results).toHaveLength(1);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.results[0].leadId } });
    expect(lead).toMatchObject({ source: 'INSTAGRAM', routingHint: 'CENTRAL' });
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: r.results[0].conversationId }, include: { messages: true } });
    expect(conv.channel).toBe('INSTAGRAM');
    expect(conv.messages.some((m) => m.direction === 'OUTBOUND' && m.senderType === 'AI' && m.status === 'SENT')).toBe(true);
    // mesma mensagem de novo e eco da própria conta são ignorados
    expect((await receiveInstagram(A.org.slug, dm('IGSID-1', 'mid-1', 'Oi!'))).results).toHaveLength(0);
    expect((await receiveInstagram(A.org.slug, dm('IGSID-1', 'mid-2', 'eco', true))).received).toBe(0);
  });

  it('com token: busca o nome do perfil e responde pela Graph API', async () => {
    await saveCredentials(su, { INSTAGRAM_ACCESS_TOKEN: 'IGT-test', INSTAGRAM_ACCOUNT_ID: 'IGACC' });
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      calls.push(String(url));
      return String(url).includes('/me/messages') ? json({ recipient_id: 'IGSID-2', message_id: 'ig.out.1' }) : json({ name: 'Bia Instagram', username: 'bia' });
    });
    const r = await receiveInstagram(A.org.slug, dm('IGSID-2', 'mid-9', 'Olá, qual a parcela para 300 mil?'));
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.results[0].leadId } });
    expect(lead.name).toBe('Bia Instagram');
    expect(calls.some((u) => u.endsWith('/me/messages'))).toBe(true);
    expect(await db.message.count({ where: { externalId: 'ig.out.1', status: 'SENT' } })).toBe(1);
  });
});

describe('Mapas e Cadastro Nacional de Empresas', () => {
  it('Google Maps: Places API (New) com chave e FieldMask', async () => {
    await saveCredentials(su, { GOOGLE_MAPS_API_KEY: 'gmaps-key' });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({
        places: [
          {
            id: 'p1',
            displayName: { text: 'Padaria Real' },
            formattedAddress: 'Rua A, 10 - Centro, Jundiaí - SP',
            nationalPhoneNumber: '(11) 4521-0000',
            websiteUri: 'https://padariareal.com.br',
            addressComponents: [
              { longText: 'Centro', types: ['sublocality_level_1', 'sublocality'] },
              { longText: 'Jundiaí', types: ['administrative_area_level_2'] },
              { longText: 'São Paulo', shortText: 'SP', types: ['administrative_area_level_1'] },
            ],
          },
        ],
      })
    );
    const r = await providers.googleMaps.searchBusinesses({ category: 'padaria', city: 'Jundiaí', uf: 'SP', limit: 5 });
    expect(r[0]).toMatchObject({ name: 'Padaria Real', neighborhood: 'Centro', city: 'Jundiaí', uf: 'SP', phone: '(11) 4521-0000', sourceRef: 'google_places:p1' });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('gmaps-key');
    expect(JSON.parse(String(init.body)).textQuery).toBe('padaria em Jundiaí, SP');
  });

  it('Bing Maps: localiza a cidade e busca no raio', async () => {
    await saveCredentials(su, { BING_MAPS_API_KEY: 'bing-key' });
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ resourceSets: [{ resources: [{ point: { coordinates: [-23.18, -46.89] } }] }] }))
      .mockResolvedValueOnce(json({ resourceSets: [{ resources: [{ name: 'Auto Center X', PhoneNumber: '(11) 4000-1000', Address: { formattedAddress: 'Av. B, 200', locality: 'Jundiaí' } }] }] }));
    const r = await providers.bingMaps.searchBusinesses({ category: 'oficina', city: 'Jundiaí', uf: 'SP', radiusKm: 5 });
    expect(r[0]).toMatchObject({ name: 'Auto Center X', phone: '(11) 4000-1000', city: 'Jundiaí' });
    expect(String(spy.mock.calls[1][0])).toContain('userLocation=-23.18%2C-46.89%2C5000');
  });

  it('CNPJ: consulta pública (BrasilAPI) e 404 = não encontrado', async () => {
    const reg = new RealCompanyRegistryProvider();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ razao_social: 'EMPRESA TESTE LTDA', nome_fantasia: 'Teste', cnae_fiscal: 4120400, cnae_fiscal_descricao: 'Construção de edifícios', porte: 'MICRO EMPRESA', descricao_situacao_cadastral: 'ATIVA', municipio: 'JUNDIAI', uf: 'SP' }))
      .mockResolvedValueOnce(json({ message: 'CNPJ não encontrado' }, 404));
    expect(await reg.lookupCnpj('12.345.678/0001-95')).toMatchObject({ legalName: 'EMPRESA TESTE LTDA', situation: 'ATIVA', cnae: '4120400 · Construção de edifícios', uf: 'SP' });
    expect(await reg.lookupCnpj('11111111000111')).toBeNull();
    await expect(reg.search()).rejects.toThrow(/Google Maps/);
  });
});

describe('Treinamento', () => {
  it('Super Admin publica; equipe assiste e marca concluído; progresso aparece', async () => {
    expect(embedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(embedUrl('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456');
    const item = await saveTraining(su, { title: 'Como funciona o consórcio', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', category: 'Produto' });
    const consultant = await A.ctx(A.users.consultant);
    await expect(saveTraining(consultant, { title: 'Intruso', url: 'https://x.com' })).rejects.toThrow(/Super Admin/);
    const list = await listTraining(consultant);
    expect(list[0]).toMatchObject({ title: 'Como funciona o consórcio', completedAt: null });
    await setCompleted(consultant, item.id, true);
    expect((await listTraining(consultant))[0].completedAt).not.toBeNull();
    const p = await teamProgress(su);
    expect(p.users.find((u) => u.id === A.users.consultant.id)?.completed).toBe(1);
    await deleteTraining(su, item.id);
    expect(await listTraining(consultant)).toHaveLength(0);
  });
});
