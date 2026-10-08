import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { BadRequest, Forbidden } from '@/lib/errors';
import { decryptSecret, encryptSecret } from '@/lib/secrets';
import type { Ctx } from '../auth/context';

/**
 * GOOGLE AGENDA DE CADA CONSULTOR (OAuth 2.0 do Google).
 *
 * O consultor clica em "Conectar Google Agenda" (Configurar IA), autoriza, e o sistema guarda o
 * refresh token criptografado. Com ele:
 * - consulta os horários ocupados (freeBusy) para oferecer só horários livres ao cliente;
 * - cria o evento da reunião (com link do Google Meet nas reuniões online) e convida o cliente se houver e-mail.
 * Escopos mínimos: e-mail da conta, eventos e disponibilidade — o sistema não lê o conteúdo dos outros eventos.
 */

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy'];
const CAL = 'https://www.googleapis.com/calendar/v3';
const REDIRECT = () => `${env.APP_URL}/api/v1/google/calendar/callback`;
const STATE_TTL_MS = 15 * 60_000;

export const googleCalendarConfigured = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const sign = (payload: string) => crypto.createHmac('sha256', `gcal-connect:${env.SESSION_SECRET}`).update(payload).digest('base64url');

export function googleAuthorizeUrl(consultantId: string) {
  if (!googleCalendarConfigured()) throw BadRequest('Google Agenda ainda não configurado: a equipe da plataforma precisa preencher o Client ID e o segredo em Configurar APIs.');
  const payload = `${consultantId}.${Date.now()}`;
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: REDIRECT(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: `${payload}.${sign(payload)}`,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export function readGoogleState(state: string | null): string | null {
  const [consultantId, ts, sig] = (state ?? '').split('.');
  if (!consultantId || !ts || !sig) return null;
  const expected = Buffer.from(sign(`${consultantId}.${ts}`));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  return Date.now() - Number(ts) <= STATE_TTL_MS ? consultantId : null;
}

type Json = Record<string, unknown> & { error?: unknown; error_description?: string };
async function gjson(url: string, init?: RequestInit): Promise<Json> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const b = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || b.error) {
    const err = b.error as { message?: string } | string | undefined;
    throw BadRequest(`Google recusou: ${b.error_description ?? (typeof err === 'string' ? err : err?.message) ?? `HTTP ${res.status}`}`);
  }
  return b;
}

/** Volta da autorização: troca o código pelo refresh token e grava no consultor (criptografado). */
export async function completeGoogleConnect(ctx: Ctx, code: string, state: string | null) {
  const consultantId = readGoogleState(state);
  if (!consultantId || consultantId !== ctx.consultantId) throw Forbidden('Autorização expirada ou iniciada por outra pessoa. Clique em "Conectar Google Agenda" de novo.');
  const tok = await gjson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: REDIRECT(), grant_type: 'authorization_code' }),
  });
  const refresh = String(tok.refresh_token ?? '');
  if (!refresh) throw BadRequest('O Google não devolveu a autorização permanente. Remova o acesso do app em myaccount.google.com/permissions e conecte de novo.');
  const info = await gjson('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } });
  const email = info.email ? String(info.email) : null;
  await db.consultant.update({ where: { id: consultantId }, data: { googleCalendarTokenEnc: encryptSecret(refresh), googleCalendarEmail: email } });
  cache.delete(consultantId);
  logger.info('google_calendar.connected', { consultantId });
  return { email };
}

export async function disconnectGoogle(ctx: Ctx, consultantId?: string | null) {
  const id = consultantId || ctx.consultantId;
  if (!id || (id !== ctx.consultantId && ctx.roleKey !== 'SUPER_ADMIN')) throw Forbidden('Só o próprio consultor ou o Super Admin desconecta a agenda.');
  const c = await db.consultant.findFirst({ where: { id, organizationId: ctx.orgId }, select: { googleCalendarTokenEnc: true } });
  const token = c?.googleCalendarTokenEnc ? decryptSecret(c.googleCalendarTokenEnc) : null;
  if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  await db.consultant.updateMany({ where: { id, organizationId: ctx.orgId }, data: { googleCalendarTokenEnc: null, googleCalendarEmail: null } });
  cache.delete(id);
}

// ---------- uso da agenda ----------

const cache = new Map<string, { token: string; until: number }>();

/** Token de acesso (1 h) a partir do refresh token. null = agenda não conectada. */
export async function googleAccessToken(consultantId: string): Promise<string | null> {
  const hit = cache.get(consultantId);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  const c = await db.consultant.findUnique({ where: { id: consultantId }, select: { googleCalendarTokenEnc: true } });
  const refresh = c?.googleCalendarTokenEnc ? decryptSecret(c.googleCalendarTokenEnc) : null;
  if (!refresh || !googleCalendarConfigured()) return null;
  const tok = await gjson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const token = String(tok.access_token);
  cache.set(consultantId, { token, until: Date.now() + Number(tok.expires_in ?? 3600) * 1000 });
  return token;
}

/** Intervalos ocupados na agenda principal do consultor. Sem agenda conectada: lista vazia. */
export async function googleBusy(consultantId: string, from: Date, to: Date): Promise<{ start: Date; end: Date }[]> {
  const token = await googleAccessToken(consultantId);
  if (!token) return [];
  const b = await gjson(`${CAL}/freeBusy`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: 'primary' }] }),
  });
  const busy = ((b.calendars as Record<string, { busy?: { start: string; end: string }[] }> | undefined)?.primary?.busy ?? []) as { start: string; end: string }[];
  return busy.map((x) => ({ start: new Date(x.start), end: new Date(x.end) }));
}

export interface NewEvent {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  tz: string;
  online: boolean;
  location?: string | null;
  attendeeEmail?: string | null;
}

/** Cria o evento na agenda principal. Reunião online ganha link do Google Meet. */
export async function googleCreateEvent(consultantId: string, e: NewEvent) {
  const token = await googleAccessToken(consultantId);
  if (!token) return null;
  const body = {
    summary: e.summary,
    description: e.description,
    start: { dateTime: e.start.toISOString(), timeZone: e.tz },
    end: { dateTime: e.end.toISOString(), timeZone: e.tz },
    ...(e.location ? { location: e.location } : {}),
    ...(e.attendeeEmail ? { attendees: [{ email: e.attendeeEmail }] } : {}),
    ...(e.online ? { conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
  };
  const q = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: e.attendeeEmail ? 'all' : 'none' });
  const r = await gjson(`${CAL}/calendars/primary/events?${q}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { id: String(r.id), htmlLink: r.htmlLink ? String(r.htmlLink) : null, meetLink: r.hangoutLink ? String(r.hangoutLink) : null };
}
