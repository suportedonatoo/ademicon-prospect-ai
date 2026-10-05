import webpush from 'web-push';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { systemCtx } from '../auth/context';
import { audit } from '../audit/audit.service';

// WEB PUSH (VAPID) — entrega real para navegadores/PWA inscritos (Chrome, Edge, Firefox, Safari 16.4+).
// Sem VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY o canal fica NOT_CONFIGURED: nada é enviado nem simulado.

export const pushConfigured = () => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
export const pushPublicKey = () => env.VAPID_PUBLIC_KEY ?? null;

let configured = false;
function ensureVapid() {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

/** Texto seguro para tela bloqueada: sem nome de cliente, telefone ou valores. */
export function lockScreenText(category: string, priority: string): { title: string; body: string } {
  const map: Record<string, string> = {
    LEAD: priority === 'CRITICAL' || priority === 'HIGH' ? '🔥 Lead prioritário' : 'Novo lead',
    CONVERSATION: '💬 Nova mensagem de cliente',
    SLA: '⚠️ Alerta de SLA',
    OPPORTUNITY: '📈 Atualização de oportunidade',
    TASK: '📋 Nova tarefa',
    SYSTEM: '🔴 Alerta do sistema',
  };
  return { title: map[category] ?? 'Nova notificação', body: 'Toque para abrir com segurança.' };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  priority: string;
}

async function sendToDevice(device: { id: string; pushEndpoint: string | null; pushP256dh: string | null; pushAuth: string | null }, payload: PushPayload) {
  if (!device.pushEndpoint || !device.pushP256dh || !device.pushAuth) return { ok: false, error: 'sem inscrição' };
  try {
    const res = await webpush.sendNotification({ endpoint: device.pushEndpoint, keys: { p256dh: device.pushP256dh, auth: device.pushAuth } }, JSON.stringify(payload), { TTL: 3600, urgency: payload.priority === 'CRITICAL' ? 'high' : 'normal', topic: payload.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') });
    return { ok: true, status: res.statusCode };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // 404/410 = inscrição expirada/cancelada no navegador → dispositivo deixa de receber.
    if (status === 404 || status === 410) await db.userDevice.update({ where: { id: device.id }, data: { status: 'REVOKED', revokedAt: new Date(), pushEndpoint: null } });
    return { ok: false, status, error: String((e as Error).message ?? e).slice(0, 200) };
  }
}

/** Job push.send: envia uma notificação para todos os dispositivos ativos do usuário. */
export async function deliverPush(notificationId: string) {
  if (!ensureVapid()) return { sent: 0, reason: 'NOT_CONFIGURED' };
  const n = await db.notification.findUnique({ where: { id: notificationId } });
  if (!n) return { sent: 0 };
  const [devices, prefs] = await Promise.all([
    db.userDevice.findMany({ where: { userId: n.userId, organizationId: n.organizationId, status: 'ACTIVE', pushEndpoint: { not: null } } }),
    db.notificationPreference.findUnique({ where: { userId: n.userId }, select: { hideSensitiveOnLockScreen: true } }),
  ]);
  const safe = prefs?.hideSensitiveOnLockScreen ?? true;
  const text = safe ? lockScreenText(n.category, n.priority) : { title: n.title, body: n.body ?? '' };
  const payload: PushPayload = { ...text, url: `/api/v1/notifications/${n.id}/open?via=push`, tag: n.dedupeKey ?? n.id, priority: n.priority };
  let sent = 0;
  const ctx = systemCtx(n.organizationId, 'Push');
  for (const d of devices) {
    const r = await sendToDevice(d, payload);
    if (r.ok) sent++;
    await audit(ctx, r.ok ? 'push.sent' : 'push.failed', { type: 'UserDevice', id: d.id }, { notificationId: n.id, status: r.status, error: r.ok ? undefined : r.error });
  }
  if (!sent && devices.length) logger.warn('push.none_delivered', { notificationId, devices: devices.length });
  return { sent, devices: devices.length };
}

/** Envio direto (ex.: "Enviar para meu celular" → dispositivo escolhido). */
export async function pushToDevice(orgId: string, userId: string, deviceId: string, payload: PushPayload) {
  if (!ensureVapid()) return { ok: false, error: 'Push não configurado (VAPID ausente).' };
  const d = await db.userDevice.findFirst({ where: { id: deviceId, userId, organizationId: orgId, status: 'ACTIVE' } });
  if (!d) return { ok: false, error: 'Dispositivo não encontrado ou revogado.' };
  const r = await sendToDevice(d, payload);
  await audit(systemCtx(orgId, 'Push'), r.ok ? 'push.sent' : 'push.failed', { type: 'UserDevice', id: d.id }, { kind: 'send_to_phone', status: r.status, error: r.ok ? undefined : r.error });
  return r;
}
