import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { enqueue } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { BadRequest, Conflict, Forbidden } from '@/lib/errors';
import { decryptSecret, encryptSecret } from '@/lib/secrets';
import type { Ctx } from '../auth/context';
import { systemCtx } from '../auth/context';
import { ingestLead } from '../leads/lead-engine';
import { findOrCreateOpenConversation } from '../conversations/conversation.service';

/**
 * INSTAGRAM DIRECT (mensagens) — Meta Messenger Platform para Instagram.
 *
 * - Recebe: webhook object "instagram" → entry[].messaging[] (assinado com o App Secret da Meta).
 *   Quem escreve vira lead (identidade EXTERNAL "INSTAGRAM:<IGSID>") e a conversa cai no mesmo Inbox;
 *   a IA responde como no WhatsApp e o lead entra na divisão igual quando qualificado.
 * - Envia: POST {graph}/me/messages com o token da página (permissão instagram_manage_messages).
 *   Regra da Meta: resposta livre só até 24 h depois da última mensagem da pessoa.
 * Sem token configurado o envio é SIMULADO (nada sai), como o WhatsApp mock.
 *
 * DUAS FORMAS DE CONEXÃO, que convivem:
 * - Conta da unidade: token da página colado em Configurar APIs (INSTAGRAM_ACCESS_TOKEN). Leads entram na divisão igual.
 * - Conta do consultor (uma por consultor): ele clica em "Conectar Instagram" no perfil e autoriza (Login do Instagram).
 *   As DMs da conta dele viram leads DELE, e as respostas saem com o token dele (graph.instagram.com).
 *   A identidade do lead guarda a conta que recebeu — "INSTAGRAM:<IGSID>:<conta>" — porque o IGSID só vale naquela conta.
 */

const base = () => `https://graph.facebook.com/${env.META_API_VERSION}`;
export const instagramConfigured = () => !!env.INSTAGRAM_ACCESS_TOKEN;
const igBase = () => `https://graph.instagram.com/${env.META_API_VERSION}`;
/** Login do Instagram disponível (cada consultor conecta a própria conta)? */
export const instagramConnectConfigured = () => !!(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);
const identityValue = (externalId: string) => `INSTAGRAM:${externalId}`;

interface IgWebhook {
  object?: string;
  entry?: { id?: string; messaging?: { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string }[] } }[] }[];
}

export function parseInstagramWebhook(body: IgWebhook) {
  if (body?.object !== 'instagram') return [];
  const out: { igsid: string; text: string; externalId: string; accounts: string[] }[] = [];
  for (const e of body.entry ?? [])
    for (const m of e.messaging ?? []) {
      const msg = m.message;
      const igsid = m.sender?.id;
      if (!msg || msg.is_echo || !igsid || igsid === env.INSTAGRAM_ACCOUNT_ID || igsid === e.id) continue;
      const text = msg.text ?? (msg.attachments?.length ? `[${msg.attachments[0].type ?? 'anexo'} recebido]` : '');
      // Conta que recebeu a mensagem (define de qual consultor é o lead).
      const accounts = [e.id, m.recipient?.id].filter((x): x is string => !!x);
      if (text && msg.mid) out.push({ igsid, text: text.slice(0, 4000), externalId: msg.mid, accounts });
    }
  return out;
}

export function verifyInstagramSignature(rawBody: string, signature: string | null) {
  // Conta da unidade assina com o App Secret da Meta; contas conectadas pelo Login do Instagram, com o segredo do app do Instagram.
  const secrets = [env.META_APP_SECRET, env.INSTAGRAM_APP_SECRET].filter((x): x is string => !!x);
  if (!secrets.length) throw Forbidden('Webhook do Instagram sem App Secret configurado (Super Admin → Configurar APIs).');
  const got = Buffer.from(signature ?? '');
  const ok = secrets.some((secret) => {
    const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`);
    return expected.length === got.length && crypto.timingSafeEqual(expected, got);
  });
  if (!ok) throw Forbidden('Assinatura do webhook inválida.');
}

// ---------- Conta do consultor (Login do Instagram) ----------

const REDIRECT = () => `${env.APP_URL}/api/v1/instagram/callback`;
const STATE_TTL_MS = 15 * 60_000;
const sign = (payload: string) => crypto.createHmac('sha256', `ig-connect:${env.SESSION_SECRET}`).update(payload).digest('base64url');

/** Endereço de autorização do Instagram. O `state` assinado amarra a volta ao consultor que iniciou. */
export function instagramAuthorizeUrl(consultantId: string) {
  if (!instagramConnectConfigured()) throw BadRequest('Login do Instagram não configurado (Super Admin → Configurar APIs → Instagram Direct).');
  const payload = `${consultantId}.${Date.now()}`;
  const q = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID!,
    redirect_uri: REDIRECT(),
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_manage_messages',
    state: `${payload}.${sign(payload)}`,
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

export function readConnectState(state: string | null): string | null {
  const [consultantId, ts, sig] = (state ?? '').split('.');
  if (!consultantId || !ts || !sig) return null;
  const expected = Buffer.from(sign(`${consultantId}.${ts}`));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  return Date.now() - Number(ts) <= STATE_TTL_MS ? consultantId : null;
}

type IgJson = Record<string, unknown> & { error?: { message?: string }; error_message?: string };
async function igJson(url: string, init?: RequestInit): Promise<IgJson> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const b = (await res.json().catch(() => ({}))) as IgJson;
  if (!res.ok || b.error || b.error_message) throw BadRequest(`Instagram recusou: ${b.error?.message ?? b.error_message ?? `HTTP ${res.status}`}`);
  return b;
}

/** Volta da autorização: troca o código por um token de longa duração, assina o webhook da conta e grava no consultor. */
export async function completeInstagramConnect(ctx: Ctx, code: string, state: string | null) {
  const consultantId = readConnectState(state);
  if (!consultantId || consultantId !== ctx.consultantId) throw Forbidden('Autorização expirada ou iniciada por outra pessoa. Clique em "Conectar Instagram" de novo.');
  const short = await igJson('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: env.INSTAGRAM_APP_ID!, client_secret: env.INSTAGRAM_APP_SECRET!, grant_type: 'authorization_code', redirect_uri: REDIRECT(), code }),
  });
  // A resposta vem direta ou dentro de data[0], conforme a versão da API.
  const shortToken = String(((short.data as IgJson[] | undefined)?.[0] ?? short).access_token ?? '');
  if (!shortToken) throw BadRequest('Instagram não devolveu o token de acesso.');
  const long = await igJson(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: env.INSTAGRAM_APP_SECRET!, access_token: shortToken })}`);
  return saveInstagramAccount(consultantId, String(long.access_token), Number(long.expires_in ?? 60 * 86400));
}

/**
 * Alternativa ao botão: colar um token de acesso da conta (gerado no painel do app da Meta).
 * O id e o usuário da conta são descobertos pelo próprio token — ninguém digita ID.
 * Quem pode: o próprio consultor, ou o Super Admin para qualquer consultor.
 */
export async function connectInstagramWithToken(ctx: Ctx, input: { consultantId?: string | null; token: string }) {
  const consultantId = input.consultantId || ctx.consultantId;
  if (!consultantId) throw BadRequest('Informe o consultor.');
  if (consultantId !== ctx.consultantId && ctx.roleKey !== 'SUPER_ADMIN') throw Forbidden('Só o próprio consultor ou o Super Admin conecta o Instagram de um consultor.');
  if (!(await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId }, select: { id: true } }))) throw BadRequest('Consultor não encontrado.');
  const token = input.token.trim();
  if (token.length < 20) throw BadRequest('Token inválido.');
  return saveInstagramAccount(consultantId, token, 60 * 86400);
}

/** Confere o token na Meta, assina o webhook da conta e grava no consultor (token criptografado). */
async function saveInstagramAccount(consultantId: string, token: string, expiresInSeconds: number) {
  const me = await igJson(`${igBase()}/me?fields=user_id,username`, { headers: { authorization: `Bearer ${token}` } });
  // user_id é o id da conta profissional — o mesmo que chega nos webhooks.
  const accountId = String(me.user_id ?? me.id ?? '');
  if (!accountId) throw BadRequest('Instagram não informou o id da conta.');

  const other = await db.consultant.findFirst({ where: { instagramAccountId: accountId, NOT: { id: consultantId } }, select: { name: true } });
  if (other) throw Conflict(`Esta conta do Instagram já está conectada a ${other.name}.`);
  // Sem esta assinatura a Meta não entrega as mensagens da conta ao nosso webhook.
  await igJson(`${igBase()}/me/subscribed_apps?subscribed_fields=messages`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });

  const username = me.username ? String(me.username) : null;
  await db.consultant.update({
    where: { id: consultantId },
    data: {
      instagramAccountId: accountId,
      instagramUsername: username,
      instagramTokenEnc: encryptSecret(token),
      instagramTokenExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      ...(username ? { instagramUrl: `https://www.instagram.com/${username}/` } : {}),
    },
  });
  logger.info('instagram.connected', { consultantId, username });
  return { username };
}

export async function disconnectInstagram(ctx: Ctx, consultantId?: string | null) {
  const id = consultantId || ctx.consultantId;
  if (!id || (id !== ctx.consultantId && ctx.roleKey !== 'SUPER_ADMIN')) throw Forbidden('Só o próprio consultor ou o Super Admin desconecta o Instagram.');
  await db.consultant.updateMany({ where: { id, organizationId: ctx.orgId }, data: { instagramAccountId: null, instagramUsername: null, instagramTokenEnc: null, instagramTokenExpiresAt: null } });
}

type Owner = { id: string; instagramAccountId: string | null; instagramTokenEnc: string | null; instagramTokenExpiresAt: Date | null };
const OWNER_SELECT = { id: true, instagramAccountId: true, instagramTokenEnc: true, instagramTokenExpiresAt: true } as const;

/** Token do consultor; renova quando faltam menos de 10 dias (o token dura 60 e só renova depois de 24 h de uso). */
async function ownerToken(o: Owner): Promise<string | null> {
  const token = o.instagramTokenEnc ? decryptSecret(o.instagramTokenEnc) : null;
  if (!token) return null;
  if (o.instagramTokenExpiresAt && o.instagramTokenExpiresAt.getTime() - Date.now() < 10 * 86400_000) {
    try {
      const r = await igJson(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`);
      const fresh = String(r.access_token);
      await db.consultant.update({ where: { id: o.id }, data: { instagramTokenEnc: encryptSecret(fresh), instagramTokenExpiresAt: new Date(Date.now() + Number(r.expires_in ?? 60 * 86400) * 1000) } });
      return fresh;
    } catch (e) {
      logger.warn('instagram.refresh_failed', { consultantId: o.id, error: String(e) });
    }
  }
  return token;
}

/** Nome/usuário da pessoa (a Meta libera para quem escreveu para a conta). */
async function profileName(igsid: string, ownerTok?: string | null) {
  if (!ownerTok && !instagramConfigured()) return null;
  try {
    const res = await fetch(`${ownerTok ? igBase() : base()}/${igsid}?fields=name,username`, { headers: { authorization: `Bearer ${ownerTok ?? env.INSTAGRAM_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
    const b = (await res.json()) as { name?: string; username?: string };
    return b.name || (b.username ? `@${b.username}` : null);
  } catch {
    return null;
  }
}

export async function receiveInstagram(orgSlug: string | null, body: IgWebhook) {
  const org = orgSlug ? await db.organization.findUnique({ where: { slug: orgSlug } }) : await db.organization.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  if (!org) throw Forbidden('Organização desconhecida.');
  const events = parseInstagramWebhook(body);
  const results = [];
  for (const ev of events) {
    // Idempotência pelo id da mensagem.
    if (await db.message.findFirst({ where: { organizationId: org.id, externalId: ev.externalId, direction: 'INBOUND' }, select: { id: true } })) continue;
    // Mensagem para a conta de um consultor → lead dele. Senão, conta da unidade → divisão igual.
    const owner = ev.accounts.length ? await db.consultant.findFirst({ where: { organizationId: org.id, active: true, instagramAccountId: { in: ev.accounts } }, select: OWNER_SELECT }) : null;
    if (!owner && ev.accounts.length && !ev.accounts.includes(env.INSTAGRAM_ACCOUNT_ID ?? '')) logger.warn('instagram.unknown_account', { accounts: ev.accounts });
    const externalId = owner ? `${ev.igsid}:${owner.instagramAccountId}` : ev.igsid;
    let identity = await db.leadIdentity.findUnique({ where: { organizationId_type_value: { organizationId: org.id, type: 'EXTERNAL', value: identityValue(externalId) } } });
    if (!identity) {
      const name = (await profileName(ev.igsid, owner ? await ownerToken(owner) : null)) ?? 'Contato Instagram';
      await ingestLead(systemCtx(org.id, 'Instagram'), { name, source: 'INSTAGRAM', externalId, medium: 'instagram-direct', routingHint: owner ? `OWNER:${owner.id}` : 'CENTRAL', dataOrigin: 'Mensagem enviada pelo titular no Instagram Direct' });
      identity = await db.leadIdentity.findUniqueOrThrow({ where: { organizationId_type_value: { organizationId: org.id, type: 'EXTERNAL', value: identityValue(externalId) } } });
    }
    const lead = await db.lead.findUniqueOrThrow({ where: { id: identity.leadId }, select: { id: true, consultantId: true } });
    const { conversation } = await findOrCreateOpenConversation(org.id, lead.id, 'INSTAGRAM', { currentAgent: 'PROSPECT', assignedConsultantId: lead.consultantId });
    await enqueue('ai.respond', { orgId: org.id, conversationId: conversation.id, text: ev.text, externalId: ev.externalId });
    results.push({ leadId: lead.id, conversationId: conversation.id });
  }
  return { ok: true, received: events.length, results };
}

/** Envia a resposta pelo Instagram Direct (usado pela mensageria para conversas do canal INSTAGRAM). */
export async function sendInstagram(orgId: string, leadId: string, text: string): Promise<{ status: string; externalId?: string; error?: string }> {
  const ident = await db.leadIdentity.findFirst({ where: { organizationId: orgId, leadId, type: 'EXTERNAL', value: { startsWith: 'INSTAGRAM:' } }, select: { value: true } });
  if (!ident) return { status: 'FAILED', error: 'Lead sem conta do Instagram vinculada' };
  // "INSTAGRAM:<IGSID>" (conta da unidade) ou "INSTAGRAM:<IGSID>:<conta do consultor>".
  const [igsid, account] = ident.value.slice('INSTAGRAM:'.length).split(':');
  let url = `${base()}/me/messages`;
  let token = env.INSTAGRAM_ACCESS_TOKEN;
  if (account) {
    const owner = await db.consultant.findFirst({ where: { organizationId: orgId, instagramAccountId: account }, select: OWNER_SELECT });
    const t = owner ? await ownerToken(owner) : null;
    if (!t) return { status: 'FAILED', error: 'A conta do Instagram que recebeu esta conversa foi desconectada. Reconecte em Meu perfil.' };
    url = `${igBase()}/${account}/messages`;
    token = t;
  } else if (!instagramConfigured()) return { status: 'SENT', externalId: `mock_ig_${crypto.randomUUID()}` }; // simulado
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ recipient: { id: igsid }, message: { text: text.slice(0, 1000) } }),
      signal: AbortSignal.timeout(15_000),
    });
    const b = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string; code?: number } };
    if (res.ok && b.message_id) return { status: 'SENT', externalId: b.message_id };
    return { status: 'FAILED', error: `Meta (${b.error?.code ?? res.status}): ${b.error?.message ?? 'erro'}` };
  } catch (e) {
    logger.error('instagram.send_failed', { leadId, error: String(e) });
    return { status: 'FAILED', error: String(e) };
  }
}

export async function instagramHealth() {
  if (!instagramConfigured()) return { ok: true, mode: 'mock' as const, detail: 'Sem token: respostas do Instagram são simuladas.' };
  try {
    const id = env.INSTAGRAM_ACCOUNT_ID ?? 'me';
    const res = await fetch(`${base()}/${id}?fields=username,name`, { headers: { authorization: `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
    const b = (await res.json().catch(() => ({}))) as { username?: string; name?: string; error?: { message?: string } };
    if (!res.ok || b.error) return { ok: false, mode: 'real' as const, detail: `Meta recusou: ${b.error?.message ?? res.status}` };
    return { ok: true, mode: 'real' as const, detail: `Conectado a ${b.username ? `@${b.username}` : (b.name ?? id)}` };
  } catch (e) {
    return { ok: false, mode: 'real' as const, detail: String(e) };
  }
}
