import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { encryptSecret } from '@/lib/secrets';
import { createOrg, resetDb } from '../helpers';
import { receiveInstagram } from '@/modules/instagram/instagram.service';
import { getAutoDm, matchKeyword, parseCommentsWebhook, readAutoDmImagePublic, receiveInstagramComments, saveAutoDm, setAutoDmImage } from '@/modules/instagram/comment-dm.service';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
const E = env as unknown as Record<string, unknown>;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const ACC = 'IG-COMENTA-1';
const comment = (id: string, from: string, username: string, text: string, account = ACC) => ({
  object: 'instagram',
  entry: [{ id: account, time: 1, changes: [{ field: 'comments', value: { id, text, from: { id: from, username }, media: { id: 'MEDIA-1', media_product_type: 'FEED' } } }] }],
});
const dm = (sender: string, mid: string, text: string) => ({ object: 'instagram', entry: [{ id: ACC, messaging: [{ sender: { id: sender }, recipient: { id: ACC }, message: { mid, text } }] }] });
// PNG 1x1
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

type Call = { url: string; body: Record<string, unknown> };
function metaFake() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string, init?: RequestInit) => {
      const url = String(u);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (url.includes('/replies')) return json({ id: 'reply-1' });
      if (url.includes('/messages')) return json({ recipient_id: 'x', message_id: `mid.out.${calls.length}` });
      return json({ name: 'Maria', username: 'maria.silva' });
    }),
  );
  return calls;
}

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Comentarios');
  E.INSTAGRAM_APP_ID = 'app-1';
  E.INSTAGRAM_APP_SECRET = 'segredo-app';
  await db.consultant.update({
    where: { id: A.consultants[0].id },
    data: { name: 'Ana Paula Souza', instagramAccountId: ACC, instagramUsername: 'ana.consorcio', instagramTokenEnc: encryptSecret('token-ana'), instagramTokenExpiresAt: new Date(Date.now() + 50 * 86400_000) },
  });
}, 120_000);
afterEach(() => vi.unstubAllGlobals());

describe('palavra-chave', () => {
  it('acha a palavra com ou sem acento, em frase e com erro de digitação', () => {
    const kw = ['ademicon', 'consórcio', 'quero', 'carta de crédito'];
    expect(matchKeyword('Quero saber mais!!', kw)).toBe('quero');
    expect(matchKeyword('tenho interesse no CONSORCIO de imóvel', kw)).toBe('consórcio');
    expect(matchKeyword('concosorcio', kw)).toBe('consórcio');
    expect(matchKeyword('é da ademicom?', kw)).toBe('ademicon');
    expect(matchKeyword('como funciona a carta de credito', kw)).toBe('carta de crédito');
    expect(matchKeyword('que foto linda 😍', kw)).toBeNull();
    expect(matchKeyword('consolo', kw)).toBeNull();
  });

  it('webhook: só comentários de terceiros com texto', () => {
    const own = comment('c-own', ACC, 'ana.consorcio', 'consórcio');
    expect(parseCommentsWebhook(own)).toHaveLength(0);
    expect(parseCommentsWebhook(comment('c-1', 'IGSID-1', 'maria', 'quero'))).toHaveLength(1);
    expect(parseCommentsWebhook({ object: 'page' } as never)).toHaveLength(0);
  });
});

describe('Comentário → Direct', () => {
  it('desligada: nada é enviado', async () => {
    const calls = metaFake();
    const r = await receiveInstagramComments(A.org.slug, comment('c-0', 'IGSID-0', 'joao', 'quero consórcio'));
    expect(r.results[0].status).toBe('DISABLED');
    expect(calls).toHaveLength(0);
  });

  it('ligada: manda a apresentação no Direct do comentário, responde em público e cria o lead da consultora', async () => {
    const ctx = await A.ctx(A.users.consultant);
    await saveAutoDm(ctx, A.consultants[0].id, {
      enabled: true,
      keywords: ['ademicon', 'consórcio', 'quero'],
      message: 'Oi, {nome}! Aqui é {consultor}. Vi seu comentário 😊',
      publicReply: 'Te chamei no Direct, {nome}!',
    });
    await setAutoDmImage(ctx, A.consultants[0].id, PNG);

    const calls = metaFake();
    const r = await receiveInstagramComments(A.org.slug, comment('c-1', 'IGSID-MARIA', 'maria.silva', 'Quero saber do consórcio!'));
    expect(r.results[0].status).toBe('SENT');

    const priv = calls.find((c) => c.url.endsWith(`/${ACC}/messages`))!;
    expect(priv.url).toContain('graph.instagram.com');
    expect(priv.body).toEqual({ recipient: { comment_id: 'c-1' }, message: { text: 'Oi, @maria.silva! Aqui é Ana. Vi seu comentário 😊' } });
    const pub = calls.find((c) => c.url.includes('/c-1/replies'))!;
    expect(pub.body).toEqual({ message: 'Te chamei no Direct, @maria.silva!' });

    const reg = await db.instagramCommentDm.findUniqueOrThrow({ where: { commentId: 'c-1' } });
    expect(reg).toMatchObject({ status: 'SENT', keyword: 'consórcio', consultantId: A.consultants[0].id });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: reg.leadId! } });
    expect(lead.consultantId).toBe(A.consultants[0].id);
    expect(lead.name).toBe('@maria.silva');
    const msgs = await db.message.findMany({ where: { conversation: { leadId: lead.id } }, orderBy: { createdAt: 'asc' } });
    expect(msgs.map((m) => m.content)).toEqual(['Comentou no Instagram: "Quero saber do consórcio!"', 'Oi, @maria.silva! Aqui é Ana. Vi seu comentário 😊']);
  });

  it('mesmo comentário reenviado pela Meta não manda de novo; outro comentário da mesma pessoa em 30 dias também não', async () => {
    const calls = metaFake();
    expect((await receiveInstagramComments(A.org.slug, comment('c-1', 'IGSID-MARIA', 'maria.silva', 'Quero saber do consórcio!'))).results[0].status).toBe('DUPLICATE');
    expect((await receiveInstagramComments(A.org.slug, comment('c-2', 'IGSID-MARIA', 'maria.silva', 'quero sim, ademicon'))).results[0].status).toBe('SKIPPED_REPEAT');
    expect(calls).toHaveLength(0);
  });

  it('comentário sem palavra-chave e conta desconhecida são ignorados', async () => {
    const calls = metaFake();
    expect((await receiveInstagramComments(A.org.slug, comment('c-3', 'IGSID-X', 'x', 'que foto linda'))).results[0].status).toBe('NO_KEYWORD');
    expect((await receiveInstagramComments(A.org.slug, comment('c-4', 'IGSID-Y', 'y', 'quero', 'IG-OUTRA'))).results[0].status).toBe('IGNORED_ACCOUNT');
    expect(calls).toHaveLength(0);
  });

  it('quando a pessoa responde no Direct, a foto vai uma vez só e cai no mesmo lead', async () => {
    const calls = metaFake();
    const r = await receiveInstagram(A.org.slug, dm('IGSID-MARIA', 'mid-maria-1', 'Oi! Penso em um carro'));
    const reg = await db.instagramCommentDm.findUniqueOrThrow({ where: { commentId: 'c-1' } });
    expect(r.results[0].leadId).toBe(reg.leadId);
    expect(reg.photoSentAt).not.toBeNull();

    const foto = calls.filter((c) => (c.body.message as { attachment?: unknown })?.attachment);
    expect(foto).toHaveLength(1);
    expect(foto[0].body.recipient).toEqual({ id: 'IGSID-MARIA' });
    const url = new URL(((foto[0].body.message as { attachment: { payload: { url: string } } }).attachment.payload.url));
    expect(url.pathname).toBe(`/api/v1/public/instagram-image/${A.consultants[0].id}`);
    // O endereço público só abre com a assinatura certa.
    const img = await readAutoDmImagePublic(A.consultants[0].id, url.searchParams.get('k')!, url.searchParams.get('s')!);
    expect(img.mime).toBe('image/png');
    await expect(readAutoDmImagePublic(A.consultants[0].id, url.searchParams.get('k')!, 'assinatura-falsa')).rejects.toThrow();

    calls.length = 0;
    await receiveInstagram(A.org.slug, dm('IGSID-MARIA', 'mid-maria-2', 'Pode me mandar a simulação?'));
    expect(calls.filter((c) => (c.body.message as { attachment?: unknown })?.attachment)).toHaveLength(0);
  });

  it('tela: mostra a configuração e os últimos envios; outro consultor não mexe', async () => {
    const own = await A.ctx(A.users.consultant);
    const d = await getAutoDm(own, A.consultants[0].id);
    expect(d).toMatchObject({ enabled: true, hasImage: true, connected: true, sent30: 1 });
    expect(d.recent.map((r) => r.status)).toEqual(['SKIPPED_REPEAT', 'SENT']);
    const outro = { ...own, consultantId: A.consultants[1].id, roleKey: 'CONSULTANT', permissions: new Set<string>() };
    await expect(saveAutoDm(outro, A.consultants[0].id, { enabled: false, keywords: [], message: '', publicReply: '' })).rejects.toThrow(/Só o próprio consultor/);
  });
});
