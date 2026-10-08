import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/secrets';
import { createOrg, resetDb } from '../helpers';
import { receiveInstagram } from '@/modules/instagram/instagram.service';
import { receiveInstagramComments } from '@/modules/instagram/comment-dm.service';
import { addPostRuleImage, listPostRules, postRuleIdeas, savePostRule, shortcodeFromUrl } from '@/modules/instagram/post-rules.service';
import { parseIdeas } from '@/modules/ai/providers/ideas';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
const ACC = 'IG-VIDEOS-1';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const comment = (id: string, from: string, username: string, text: string, mediaId: string) => ({
  object: 'instagram',
  entry: [{ id: ACC, time: 1, changes: [{ field: 'comments', value: { id, text, from: { id: from, username }, media: { id: mediaId, media_product_type: 'REELS' } } }] }],
});
const dm = (sender: string, mid: string, text: string) => ({ object: 'instagram', entry: [{ id: ACC, messaging: [{ sender: { id: sender }, recipient: { id: ACC }, message: { mid, text } }] }] });

type Call = { url: string; body: Record<string, unknown> };
function fakeInstagram() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string, init?: RequestInit) => {
      const url = String(u);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (url.includes('/me/media')) {
        if (url.includes('after=pagina2')) return json({ data: [{ id: 'MEDIA-ANTIGO', shortcode: 'ANTIGO123', caption: 'Vídeo antigo', media_type: 'VIDEO', thumbnail_url: 'https://cdn/thumb2.jpg' }] });
        return json({ data: [{ id: 'MEDIA-REEL-1', shortcode: 'DAbc123xYz', caption: 'Como funciona o consórcio de imóvel', media_type: 'VIDEO', thumbnail_url: 'https://cdn/thumb.jpg' }], paging: { next: `https://graph.instagram.com/me/media?after=pagina2` } });
      }
      if (url.includes('/replies')) return json({ id: 'reply-1' });
      if (url.includes('/messages')) return json({ message_id: `mid.out.${calls.length}` });
      return json({ name: 'Ana', username: 'ana' });
    }),
  );
  return calls;
}

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Videos');
  await db.consultant.update({
    where: { id: A.consultants[0].id },
    data: { name: 'Carla Mendes', instagramAccountId: ACC, instagramUsername: 'carla.consorcio', instagramTokenEnc: encryptSecret('token-carla'), instagramTokenExpiresAt: new Date(Date.now() + 50 * 86400_000) },
  });
}, 120_000);
afterEach(() => vi.unstubAllGlobals());

describe('link do vídeo e ideias', () => {
  it('lê o código do vídeo em vários formatos de link', () => {
    expect(shortcodeFromUrl('https://www.instagram.com/reel/DAbc123xYz/?igsh=MWZ0')).toBe('DAbc123xYz');
    expect(shortcodeFromUrl('instagram.com/p/ABCDE12/')).toBe('ABCDE12');
    expect(shortcodeFromUrl('https://www.instagram.com/carla.consorcio/reel/DAbc123xYz/')).toBe('DAbc123xYz');
    expect(shortcodeFromUrl('https://www.instagram.com/reels/DAbc123xYz')).toBe('DAbc123xYz');
    expect(shortcodeFromUrl('https://youtube.com/watch?v=x')).toBeNull();
  });

  it('ideias da IA: lê o JSON, tira promessa proibida e cópia da original', () => {
    const raw = '```json\n{"ideias": ["Oi, {nome}! Vi seu comentário, posso te mandar os detalhes?", "Contemplação garantida no 1º mês!", "MINHA MENSAGEM"]}\n```';
    expect(parseIdeas(raw, 'minha mensagem', 2)).toEqual(['Oi, {nome}! Vi seu comentário, posso te mandar os detalhes?']);
    expect(parseIdeas('não é json', 'x', 2)).toEqual([]);
  });

  it('gera 2 ideias a partir da mensagem do consultor (modo simulado devolve modelos prontos)', async () => {
    const ctx = await A.ctx(A.users.consultant);
    const r = await postRuleIdeas(ctx, A.consultants[0].id, { message: 'Oi {nome}, vi seu comentário! Te mando a simulação.', keywords: ['ademicon'] });
    expect(r.ideas).toHaveLength(2);
    await expect(postRuleIdeas(ctx, A.consultants[0].id, { message: 'oi' })).rejects.toThrow(/Escreva a sua mensagem/);
    // Gerar outras: não repete as já mostradas.
    const r2 = await postRuleIdeas(ctx, A.consultants[0].id, { message: 'Oi {nome}, vi seu comentário! Te mando a simulação.', exclude: r.ideas });
    expect(r2.ideas).toHaveLength(2);
    expect(r2.ideas.some((x) => r.ideas.includes(x))).toBe(false);
  });
});

describe('Vídeo com palavra-chave', () => {
  it('salvar: confere o vídeo na conta conectada (procurando em mais de uma página) e guarda o id', async () => {
    fakeInstagram();
    const ctx = await A.ctx(A.users.consultant);
    const r = await savePostRule(ctx, A.consultants[0].id, { postUrl: 'https://www.instagram.com/reel/DAbc123xYz/', keywords: ['ademicon', 'consórcio'], message: 'Oi, {nome}! Aqui é {consultor}. Vi seu comentário e separei as informações para você.' });
    expect(r).toMatchObject({ mediaId: 'MEDIA-REEL-1', shortcode: 'DAbc123xYz', caption: 'Como funciona o consórcio de imóvel', publicReply: 'Olha sua DM, {nome}! Te encaminhei uma mensagem 😉' });
    const antigo = await savePostRule(ctx, A.consultants[0].id, { postUrl: 'https://www.instagram.com/reel/ANTIGO123/', keywords: ['quero'], message: 'Oi {nome}, quer saber mais? Me responde aqui.' });
    expect(antigo.mediaId).toBe('MEDIA-ANTIGO');
    await expect(savePostRule(ctx, A.consultants[0].id, { postUrl: 'https://www.instagram.com/reel/DAbc123xYz/', keywords: ['x1'], message: 'mensagem qualquer aqui' })).rejects.toThrow(/já está configurado/);
    await expect(savePostRule(ctx, A.consultants[0].id, { postUrl: 'https://www.instagram.com/reel/NAOEXISTE9/', keywords: ['x1'], message: 'mensagem qualquer aqui' })).rejects.toThrow(/Não achei este vídeo/);
    await expect(savePostRule(ctx, A.consultants[0].id, { postUrl: 'https://site.com/video', keywords: ['x1'], message: 'mensagem qualquer aqui' })).rejects.toThrow(/Link inválido/);
  });

  it('comentou "ademicon" no vídeo: Direct com a mensagem escolhida + resposta no comentário (mesmo com a resposta geral desligada)', async () => {
    const calls = fakeInstagram();
    const r = await receiveInstagramComments(A.org.slug, comment('c-v1', 'IGSID-JOAO', 'joao.silva', 'Ademicon!!', 'MEDIA-REEL-1'));
    expect(r.results[0].status).toBe('SENT');
    expect(calls.find((c) => c.url.endsWith(`/${ACC}/messages`))!.body).toEqual({ recipient: { comment_id: 'c-v1' }, message: { text: 'Oi, @joao.silva! Aqui é Carla. Vi seu comentário e separei as informações para você.' } });
    expect(calls.find((c) => c.url.includes('/c-v1/replies'))!.body).toEqual({ message: 'Olha sua DM, @joao.silva! Te encaminhei uma mensagem 😉' });
    const reg = await db.instagramCommentDm.findUniqueOrThrow({ where: { commentId: 'c-v1' } });
    expect(reg.ruleId).not.toBeNull();
    expect((await db.lead.findUniqueOrThrow({ where: { id: reg.leadId! } })).consultantId).toBe(A.consultants[0].id);
  });

  it('palavra de outro vídeo, post sem configuração e repetição não disparam', async () => {
    const calls = fakeInstagram();
    expect((await receiveInstagramComments(A.org.slug, comment('c-v2', 'IGSID-X', 'x', 'quero', 'MEDIA-REEL-1'))).results[0].status).toBe('NO_KEYWORD');
    expect((await receiveInstagramComments(A.org.slug, comment('c-v3', 'IGSID-X', 'x', 'ademicon', 'MEDIA-OUTRO'))).results[0].status).toBe('DISABLED');
    expect((await receiveInstagramComments(A.org.slug, comment('c-v4', 'IGSID-JOAO', 'joao.silva', 'consórcio', 'MEDIA-REEL-1'))).results[0].status).toBe('SKIPPED_REPEAT');
    expect(calls.filter((c) => c.url.includes('/messages'))).toHaveLength(0);
    // Mesma pessoa em OUTRO vídeo configurado recebe a mensagem daquele vídeo.
    expect((await receiveInstagramComments(A.org.slug, comment('c-v5', 'IGSID-JOAO', 'joao.silva', 'eu quero', 'MEDIA-ANTIGO'))).results[0].status).toBe('SENT');
  });

  it('mensagem + fotos: as fotos (até 3) vão quando a pessoa responde; "só mensagem" não manda foto', async () => {
    fakeInstagram();
    const ctx = await A.ctx(A.users.consultant);
    const [antigo, reel] = (await listPostRules(ctx, A.consultants[0].id)).sort((a, b) => (a.shortcode === 'ANTIGO123' ? -1 : b.shortcode === 'ANTIGO123' ? 1 : 0));
    expect(antigo.shortcode).toBe('ANTIGO123');
    await addPostRuleImage(ctx, reel.id, PNG);
    await addPostRuleImage(ctx, reel.id, PNG);
    await addPostRuleImage(ctx, reel.id, PNG);
    await expect(addPostRuleImage(ctx, reel.id, PNG)).rejects.toThrow(/Máximo de 3 fotos/);

    // Nova pessoa comenta no reel (com fotos) e responde no Direct.
    let calls = fakeInstagram();
    await receiveInstagramComments(A.org.slug, comment('c-v6', 'IGSID-BIA', 'bia', 'consorcio', 'MEDIA-REEL-1'));
    calls = fakeInstagram();
    await receiveInstagram(A.org.slug, dm('IGSID-BIA', 'mid-bia-1', 'Oi! Quero sim'));
    const fotos = calls.filter((c) => (c.body.message as { attachment?: unknown })?.attachment);
    expect(fotos).toHaveLength(3);
    expect(fotos.every((f) => (f.body.recipient as { id: string }).id === 'IGSID-BIA')).toBe(true);

    // João respondeu depois do vídeo antigo ("só mensagem"): nenhuma foto.
    calls = fakeInstagram();
    await receiveInstagram(A.org.slug, dm('IGSID-JOAO', 'mid-joao-1', 'Oi, me conta mais'));
    expect(calls.filter((c) => (c.body.message as { attachment?: unknown })?.attachment)).toHaveLength(0);

    const lista = await listPostRules(ctx, A.consultants[0].id);
    expect(lista.find((r) => r.shortcode === 'DAbc123xYz')).toMatchObject({ sent: 2, images: 3 });
  });

  it('só o próprio consultor (ou a gestão) configura os vídeos dele', async () => {
    const outro = { ...(await A.ctx(A.users.consultant)), consultantId: A.consultants[1].id, roleKey: 'CONSULTANT', permissions: new Set<string>() };
    await expect(listPostRules(outro, A.consultants[0].id)).rejects.toThrow(/Só o próprio consultor/);
  });
});
