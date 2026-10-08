import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { BadRequest, NotFound } from '@/lib/errors';
import { normalizePhone } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { providers } from '../integrations/registry';

/**
 * CONEXÃO COM A META (WhatsApp Cloud API) — os passos que antes eram feitos à mão no painel da Meta:
 * 1. ver os números da conta WhatsApp Business (WABA) e o estado de cada um;
 * 2. inscrever o app na WABA (sem isso a Meta não manda as mensagens recebidas para o webhook);
 * 3. importar os números para o sistema, já com o ID da Meta (phone_number_id);
 * 4. registrar o número na API com o PIN de 6 dígitos (verificação em duas etapas).
 */

type GraphError = { error?: { message?: string; code?: number; error_user_msg?: string } };
export interface MetaNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  name_status?: string;
  status?: string;
  platform_type?: string;
  messaging_limit_tier?: string;
}

const base = () => (env.WHATSAPP_API_URL || 'https://graph.facebook.com/v23.0').replace(/\/$/, '');

async function graph<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${base()}/${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`, 'content-type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || body.error) throw BadRequest(`Meta recusou: ${body.error?.error_user_msg ?? body.error?.message ?? `HTTP ${res.status}`}`);
  return body;
}

function requireReal() {
  if (providers.whatsapp.mode !== 'real') throw BadRequest('WhatsApp em modo simulado. Em Super Admin → Configurar APIs → WhatsApp, use o modo cloud-api e salve o token.');
  if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) throw BadRequest('Falta o ID da conta WhatsApp Business (WABA) em Configurar APIs.');
  return env.WHATSAPP_BUSINESS_ACCOUNT_ID;
}

const FIELDS = 'id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,platform_type,messaging_limit_tier';
const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');

/** Número pronto para a API: registrado na Cloud API e conectado. */
export const registeredOnCloud = (m: MetaNumber) => m.platform_type === 'CLOUD_API' && (m.status ?? 'CONNECTED') === 'CONNECTED';

export async function metaStatus(ctx: Ctx) {
  assertCan(ctx, 'whatsapp.configure');
  const real = providers.whatsapp.mode === 'real';
  const checks = { token: real, waba: !!env.WHATSAPP_BUSINESS_ACCOUNT_ID, appSecret: !!(env.WHATSAPP_APP_SECRET || env.META_APP_SECRET), verifyToken: !!(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || env.META_VERIFY_TOKEN), subscribed: false };
  if (!real || !checks.waba) return { checks, numbers: [], error: null as string | null, webhookUrl: `${env.APP_URL}/api/v1/webhooks/inbound/whatsapp` };
  try {
    const waba = env.WHATSAPP_BUSINESS_ACCOUNT_ID!;
    const [apps, nums] = await Promise.all([graph<{ data?: unknown[] }>(`${waba}/subscribed_apps`), graph<{ data?: MetaNumber[] }>(`${waba}/phone_numbers?fields=${FIELDS}`)]);
    checks.subscribed = (apps.data?.length ?? 0) > 0;
    const local = await db.whatsAppNumber.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true, phone: true, providerNumberId: true, consultant: { select: { name: true } } } });
    const numbers = (nums.data ?? []).map((m) => {
      const l = local.find((x) => x.providerNumberId === m.id) ?? local.find((x) => digits(x.phone) === digits(m.display_phone_number));
      return { ...m, registered: registeredOnCloud(m), local: l ? { id: l.id, name: l.name, linked: l.providerNumberId === m.id, owner: l.consultant?.name ?? null } : null };
    });
    return { checks, numbers, error: null, webhookUrl: `${env.APP_URL}/api/v1/webhooks/inbound/whatsapp` };
  } catch (e) {
    return { checks, numbers: [], error: (e as Error).message, webhookUrl: `${env.APP_URL}/api/v1/webhooks/inbound/whatsapp` };
  }
}

/** Inscreve o app na WABA: a Meta passa a entregar as mensagens recebidas no webhook. */
export async function subscribeApp(ctx: Ctx) {
  assertCan(ctx, 'whatsapp.configure');
  const waba = requireReal();
  await graph(`${waba}/subscribed_apps`, { method: 'POST' });
  await audit(ctx, 'whatsapp.changed', { type: 'WhatsAppAccount', id: waba }, { action: 'subscribed_app' });
  return { ok: true };
}

/**
 * Traz os números da WABA para o sistema. Número já cadastrado (mesmo telefone) ganha o ID da Meta;
 * número novo entra como número da operação (bot) — depois dá para passar para um consultor em Editar.
 */
export async function importMetaNumbers(ctx: Ctx) {
  assertCan(ctx, 'whatsapp.configure');
  const waba = requireReal();
  const nums = (await graph<{ data?: MetaNumber[] }>(`${waba}/phone_numbers?fields=${FIELDS}`)).data ?? [];
  const account =
    (await db.whatsAppAccount.findFirst({ where: { organizationId: ctx.orgId } })) ?? (await db.whatsAppAccount.create({ data: { organizationId: ctx.orgId, name: 'Conta principal', provider: 'real' } }));
  let linked = 0;
  let created = 0;
  for (const m of nums) {
    const phone = normalizePhone(`+${digits(m.display_phone_number)}`);
    if (!phone) continue;
    const status = registeredOnCloud(m) ? 'CONNECTED' : 'DISCONNECTED';
    const lastError = registeredOnCloud(m) ? null : 'Número ainda não registrado na API: use "Registrar" com o PIN de 6 dígitos.';
    const existing = await db.whatsAppNumber.findFirst({ where: { organizationId: ctx.orgId, OR: [{ providerNumberId: m.id }, { phone }] } });
    if (existing) {
      if (existing.providerNumberId !== m.id || existing.status !== status) {
        await db.whatsAppNumber.update({ where: { id: existing.id }, data: { providerNumberId: m.id, status, lastError, lastErrorAt: lastError ? new Date() : null } });
        linked++;
      }
    } else {
      await db.whatsAppNumber.create({
        data: { organizationId: ctx.orgId, accountId: account.id, provider: 'real', name: (m.verified_name ?? 'Número Meta').slice(0, 60), phone, purpose: 'PROSPECT_BOT', dailyLimit: 250, priority: 0, providerNumberId: m.id, status, lastError, lastErrorAt: lastError ? new Date() : null },
      });
      created++;
    }
  }
  await audit(ctx, 'whatsapp.changed', { type: 'WhatsAppAccount', id: waba }, { action: 'import_numbers', linked, created });
  return { total: nums.length, linked, created };
}

/** Registra o número na Cloud API com o PIN de 6 dígitos (o mesmo da verificação em duas etapas). */
export async function registerMetaNumber(ctx: Ctx, numberId: string, pin: string) {
  assertCan(ctx, 'whatsapp.configure');
  requireReal();
  if (!/^\d{6}$/.test(pin)) throw BadRequest('O PIN tem 6 dígitos.');
  const n = await db.whatsAppNumber.findFirst({ where: { id: numberId, organizationId: ctx.orgId } });
  if (!n) throw NotFound('Número');
  if (!n.providerNumberId) throw BadRequest('Este número ainda não tem o ID da Meta. Use "Importar números da Meta" primeiro.');
  await graph(`${n.providerNumberId}/register`, { body: { messaging_product: 'whatsapp', pin } });
  await db.whatsAppNumber.update({ where: { id: n.id }, data: { status: 'CONNECTED', lastError: null, lastErrorAt: null } });
  await audit(ctx, 'whatsapp.changed', { type: 'WhatsAppNumber', id: n.id }, { action: 'registered' });
  return { ok: true };
}
