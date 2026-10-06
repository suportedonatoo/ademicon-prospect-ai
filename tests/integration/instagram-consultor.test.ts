import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { decryptSecret } from '@/lib/secrets';
import { createOrg, resetDb } from '../helpers';
import { completeInstagramConnect, instagramAuthorizeUrl, readConnectState, receiveInstagram, sendInstagram } from '@/modules/instagram/instagram.service';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
const E = env as unknown as Record<string, unknown>;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const dm = (account: string, sender: string, mid: string, text: string) => ({ object: 'instagram', entry: [{ id: account, messaging: [{ sender: { id: sender }, recipient: { id: account }, message: { mid, text } }] }] });

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Insta');
  E.INSTAGRAM_APP_ID = 'app-1';
  E.INSTAGRAM_APP_SECRET = 'segredo-app';
}, 120_000);
afterEach(() => vi.unstubAllGlobals());

describe('Instagram por consultor', () => {
  it('state assinado: só vale para quem iniciou e não aceita adulteração', () => {
    const url = new URL(instagramAuthorizeUrl(A.consultants[0].id));
    expect(url.searchParams.get('redirect_uri')).toBe(`${env.APP_URL}/api/v1/instagram/callback`);
    const state = url.searchParams.get('state')!;
    expect(readConnectState(state)).toBe(A.consultants[0].id);
    expect(readConnectState(state.replace(A.consultants[0].id, A.consultants[1].id))).toBeNull();
    expect(readConnectState('lixo')).toBeNull();
  });

  it('conectar grava a conta e o token criptografado; outro consultor não usa o mesmo state nem a mesma conta', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      calls.push(String(u));
      if (String(u).includes('api.instagram.com/oauth/access_token')) return json({ access_token: 'curto', user_id: 1 });
      if (String(u).includes('ig_exchange_token')) return json({ access_token: 'longo-123', expires_in: 5184000 });
      if (String(u).includes('/me?fields=')) return json({ user_id: 'IG-C1', username: 'consultor.um' });
      if (String(u).includes('subscribed_apps')) return json({ success: true });
      return json({}, 404);
    }));
    const ctx1 = await A.ctx(A.users.consultant);
    const state = new URL(instagramAuthorizeUrl(A.consultants[0].id)).searchParams.get('state');
    await expect(completeInstagramConnect({ ...ctx1, consultantId: A.consultants[1].id }, 'code', state)).rejects.toThrow(/expirada|outra pessoa/);

    expect(await completeInstagramConnect(ctx1, 'code', state)).toEqual({ username: 'consultor.um' });
    const c = await db.consultant.findUniqueOrThrow({ where: { id: A.consultants[0].id } });
    expect(c.instagramAccountId).toBe('IG-C1');
    expect(c.instagramTokenEnc).not.toContain('longo-123');
    expect(decryptSecret(c.instagramTokenEnc!)).toBe('longo-123');
    expect(calls.some((u) => u.includes('subscribed_apps?subscribed_fields=messages'))).toBe(true);

    // Uma conta por consultor: a mesma conta não entra em outro.
    const state2 = new URL(instagramAuthorizeUrl(A.consultants[1].id)).searchParams.get('state');
    await expect(completeInstagramConnect({ ...ctx1, consultantId: A.consultants[1].id }, 'code', state2)).rejects.toThrow(/já está conectada/);
  });

  it('DM para a conta do consultor vira lead DELE e a resposta sai com o token dele', async () => {
    const sent: { url: string; auth: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      if (String(u).includes('/messages')) {
        sent.push({ url: String(u), auth: (init?.headers as Record<string, string>).authorization });
        return json({ message_id: 'ig.out.1' });
      }
      return json({ name: 'Bia Direct', username: 'bia' });
    }));
    const r = await receiveInstagram(A.org.slug, dm('IG-C1', 'IGSID-9', 'mid-c1-1', 'Oi, quero um consórcio de imóvel'));
    expect(r.results).toHaveLength(1);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.results[0].leadId } });
    expect(lead.name).toBe('Bia Direct');
    expect(lead.consultantId).toBe(A.consultants[0].id);
    expect(lead.routingHint).toBe(`OWNER:${A.consultants[0].id}`);

    sent.length = 0;
    expect((await sendInstagram(A.org.id, lead.id, 'Olá!')).status).toBe('SENT');
    expect(sent[0].url).toContain('graph.instagram.com');
    expect(sent[0].url).toContain('/IG-C1/messages');
    expect(sent[0].auth).toBe('Bearer longo-123');
  });

  it('conta desconectada: a resposta falha com orientação, em vez de sair por outra conta', async () => {
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: A.org.id, name: 'Bia Direct' } });
    await db.consultant.update({ where: { id: A.consultants[0].id }, data: { instagramAccountId: null, instagramTokenEnc: null } });
    const r = await sendInstagram(A.org.id, lead.id, 'Olá de novo');
    expect(r.status).toBe('FAILED');
    expect(r.error).toMatch(/desconectada/);
  });
});
