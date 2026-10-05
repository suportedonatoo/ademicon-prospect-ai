import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Forbidden, Unauthorized } from '@/lib/errors';
import { systemCtx } from '../auth/context';
import { acquire } from '../leads/acquisition-engine';
import { providers } from './registry';
import { MetaProvider } from './meta/meta.provider';

/**
 * LEADS DOS FORMULÁRIOS DE ANÚNCIO (Google Ads Lead Form e Meta Lead Ads).
 * Chegam por webhook, viram lead com pedido de contato e entram na DIVISÃO IGUAL
 * (mesma regra da landing central). Idempotente pelo id do lead no provedor.
 */

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function resolveOrg(slug: string | null) {
  return slug ? db.organization.findUnique({ where: { slug } }) : db.organization.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
}

/** Registra o webhook bruto; devolve null se o mesmo lead já foi processado. */
async function logOnce(provider: string, orgId: string, externalId: string, payload: unknown) {
  const key = `${provider}:${orgId}:${externalId}`;
  if (await db.webhook.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) return null;
  try {
    return await db.webhook.create({ data: { organizationId: orgId, provider, headers: {}, payload: payload as object, idempotencyKey: key } });
  } catch {
    return null; // corrida: outra entrega igual chegou junto
  }
}

// ───────── Google Ads ─────────

interface GoogleLeadPayload {
  lead_id?: string;
  google_key?: string;
  is_test?: boolean;
  campaign_id?: string | number;
  form_id?: string | number;
  user_column_data?: { column_id?: string; column_name?: string; string_value?: string }[];
}

export function mapGoogleLead(p: GoogleLeadPayload) {
  const col = (...ids: string[]) => p.user_column_data?.find((c) => ids.includes(String(c.column_id ?? '').toUpperCase()))?.string_value?.trim();
  const full = col('FULL_NAME') ?? [col('FIRST_NAME'), col('LAST_NAME')].filter(Boolean).join(' ');
  return {
    full_name: full || 'Lead Google Ads',
    email: col('EMAIL', 'WORK_EMAIL'),
    phone_number: col('PHONE_NUMBER', 'WORK_PHONE'),
    city: col('CITY'),
    lead_id: p.lead_id,
    campaign: p.campaign_id != null ? String(p.campaign_id) : undefined,
    consent: true, // a pessoa enviou o formulário pedindo contato
  };
}

export async function receiveGoogleAdsLead(orgSlug: string | null, body: GoogleLeadPayload) {
  if (!env.GOOGLE_ADS_LEAD_FORM_KEY) throw Forbidden('Webhook do Google Ads sem chave configurada (Super Admin → Configurar APIs).');
  if (!body.google_key || !safeEqual(body.google_key, env.GOOGLE_ADS_LEAD_FORM_KEY)) throw Unauthorized('Chave do formulário inválida.');
  const org = await resolveOrg(orgSlug);
  if (!org) throw Forbidden('Organização desconhecida.');
  const externalId = String(body.lead_id ?? '');
  if (!externalId) return { ok: false, reason: 'sem lead_id' };
  const log = await logOnce('google_ads_leads', org.id, externalId, body);
  if (!log) return { ok: true, duplicate: true };
  const lead = mapGoogleLead(body);
  const res = await acquire(systemCtx(org.id, 'Google Ads'), 'GOOGLE_ADS', { ...lead, full_name: body.is_test ? `${lead.full_name} (teste Google)` : lead.full_name });
  await db.webhook.update({ where: { id: log.id }, data: { status: 'PROCESSED' } });
  return { ok: true, leadId: res.leadId };
}

// ───────── Meta Lead Ads ─────────

export function verifyMetaSignature(rawBody: string, signature: string | null) {
  if (!env.META_APP_SECRET) throw Forbidden('Webhook da Meta sem App Secret configurado (Super Admin → Configurar APIs).');
  const expected = `sha256=${crypto.createHmac('sha256', env.META_APP_SECRET).update(rawBody, 'utf8').digest('hex')}`;
  if (!safeEqual(expected, signature ?? '')) throw Unauthorized('Assinatura do webhook inválida.');
}

export function mapMetaLead(lead: { id: string; field_data: { name: string; values: string[] }[]; campaign_id?: string }) {
  const f = (...names: string[]) => lead.field_data.find((d) => names.includes(d.name.toLowerCase()))?.values?.[0]?.trim();
  const full = f('full_name', 'nome_completo', 'nome') ?? [f('first_name'), f('last_name')].filter(Boolean).join(' ');
  return {
    full_name: full || 'Lead Meta Ads',
    email: f('email', 'e-mail'),
    phone_number: f('phone_number', 'telefone', 'whatsapp'),
    city: f('city', 'cidade'),
    lead_id: lead.id,
    campaign: lead.campaign_id,
    consent: true,
  };
}

interface MetaWebhook {
  object?: string;
  entry?: { changes?: { field?: string; value?: { leadgen_id?: string | number } }[] }[];
}

export async function receiveMetaLeads(orgSlug: string | null, body: MetaWebhook) {
  const org = await resolveOrg(orgSlug);
  if (!org) throw Forbidden('Organização desconhecida.');
  const ids = (body.entry ?? []).flatMap((e) => (e.changes ?? []).filter((c) => c.field === 'leadgen').map((c) => String(c.value?.leadgen_id ?? ''))).filter(Boolean);
  const meta = providers.meta;
  const results: { leadgenId: string; leadId?: string; duplicate?: boolean; error?: string }[] = [];
  for (const id of ids) {
    const log = await logOnce('meta_leads', org.id, id, { leadgen_id: id });
    if (!log) {
      results.push({ leadgenId: id, duplicate: true });
      continue;
    }
    try {
      if (!(meta instanceof MetaProvider)) throw new Error('Meta Ads não configurada (token e conta de anúncios).');
      const data = await meta.getLead(id);
      const res = await acquire(systemCtx(org.id, 'Meta Lead Ads'), 'META', mapMetaLead(data));
      await db.webhook.update({ where: { id: log.id }, data: { status: 'PROCESSED' } });
      results.push({ leadgenId: id, leadId: res.leadId });
    } catch (e) {
      await db.webhook.update({ where: { id: log.id }, data: { status: 'FAILED', error: String(e).slice(0, 500) } });
      results.push({ leadgenId: id, error: (e as Error).message });
    }
  }
  return { ok: true, received: ids.length, results };
}
