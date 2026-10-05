import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { enqueue } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { Forbidden } from '@/lib/errors';
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
 */

const base = () => `https://graph.facebook.com/${env.META_API_VERSION}`;
export const instagramConfigured = () => !!env.INSTAGRAM_ACCESS_TOKEN;
const identityValue = (igsid: string) => `INSTAGRAM:${igsid}`;

interface IgWebhook {
  object?: string;
  entry?: { id?: string; messaging?: { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string }[] } }[] }[];
}

export function parseInstagramWebhook(body: IgWebhook) {
  if (body?.object !== 'instagram') return [];
  const out: { igsid: string; text: string; externalId: string }[] = [];
  for (const e of body.entry ?? [])
    for (const m of e.messaging ?? []) {
      const msg = m.message;
      const igsid = m.sender?.id;
      if (!msg || msg.is_echo || !igsid || igsid === env.INSTAGRAM_ACCOUNT_ID || igsid === e.id) continue;
      const text = msg.text ?? (msg.attachments?.length ? `[${msg.attachments[0].type ?? 'anexo'} recebido]` : '');
      if (text && msg.mid) out.push({ igsid, text: text.slice(0, 4000), externalId: msg.mid });
    }
  return out;
}

export function verifyInstagramSignature(rawBody: string, signature: string | null) {
  if (!env.META_APP_SECRET) throw Forbidden('Webhook do Instagram sem App Secret da Meta configurado (Super Admin → Configurar APIs).');
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', env.META_APP_SECRET).update(rawBody, 'utf8').digest('hex')}`);
  const got = Buffer.from(signature ?? '');
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) throw Forbidden('Assinatura do webhook inválida.');
}

/** Nome/usuário da pessoa (a Meta libera para quem escreveu para a conta). */
async function profileName(igsid: string) {
  if (!instagramConfigured()) return null;
  try {
    const res = await fetch(`${base()}/${igsid}?fields=name,username`, { headers: { authorization: `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
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
    let identity = await db.leadIdentity.findUnique({ where: { organizationId_type_value: { organizationId: org.id, type: 'EXTERNAL', value: identityValue(ev.igsid) } } });
    if (!identity) {
      const name = (await profileName(ev.igsid)) ?? 'Contato Instagram';
      await ingestLead(systemCtx(org.id, 'Instagram'), { name, source: 'INSTAGRAM', externalId: ev.igsid, medium: 'instagram-direct', routingHint: 'CENTRAL', dataOrigin: 'Mensagem enviada pelo titular no Instagram Direct' });
      identity = await db.leadIdentity.findUniqueOrThrow({ where: { organizationId_type_value: { organizationId: org.id, type: 'EXTERNAL', value: identityValue(ev.igsid) } } });
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
  const igsid = ident.value.slice('INSTAGRAM:'.length);
  if (!instagramConfigured()) return { status: 'SENT', externalId: `mock_ig_${crypto.randomUUID()}` }; // simulado
  try {
    const res = await fetch(`${base()}/me/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`, 'content-type': 'application/json' },
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
