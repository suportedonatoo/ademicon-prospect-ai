import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { publish } from '@/lib/events';
import { providers } from '../integrations/registry';
import { notifyConsultant, notifyRoles } from '../notifications/notification.service';

/**
 * POOL DE NÚMEROS POR CONSULTOR + BACKUP
 *
 * Cada consultor tem de 1 a 7 números de WhatsApp (o 1º por prioridade é o principal; os demais
 * são backup). Todas as conversas, de qualquer número, caem no mesmo Inbox.
 * Se o número da conversa cair (desconectado, erro, pausado ou no limite do dia), a conversa
 * passa para o próximo número saudável DO MESMO consultor, e as mensagens que ficaram na fila
 * são reenviadas por ele. Sem número do consultor, usa os números da operação (bots/equipe).
 *
 * Não há rodízio de números para burlar limites/bloqueios: a troca só acontece quando o número CAI
 * (desconectado, erro no provedor ou pausado). Número no limite diário NÃO troca — a mensagem
 * fica na fila até o dia seguinte. Toda troca fica registrada na conversa.
 */

export const MAX_NUMBERS_PER_CONSULTANT = 7;
export const MIN_NUMBERS_PER_CONSULTANT = 1;
/** Com 1 número só não há backup: o sistema avisa, mas aceita. */
export const BACKUP_RECOMMENDED = 2;

export interface PoolNumber {
  id: string;
  name: string;
  phone: string;
  status: string;
  paused: boolean;
  sentToday: number;
  dailyLimit: number;
  priority: number;
  consultantId: string | null;
  purpose: string;
}

/** No ar: conectado e não pausado. */
export function isHealthy(n: Pick<PoolNumber, 'status' | 'paused'>) {
  return n.status === 'CONNECTED' && !n.paused;
}

/** No ar e com saldo de envios hoje. */
export function isUsable(n: Pick<PoolNumber, 'status' | 'paused' | 'sentToday' | 'dailyLimit'>) {
  return isHealthy(n) && n.sentToday < n.dailyLimit;
}

/** Motivo legível para o número não estar enviando. */
export function unusableReason(n: Pick<PoolNumber, 'status' | 'paused' | 'sentToday' | 'dailyLimit'>) {
  if (n.status === 'ERROR') return 'com erro no provedor';
  if (n.status !== 'CONNECTED') return 'desconectado';
  if (n.paused) return 'pausado';
  if (n.sentToday >= n.dailyLimit) return 'no limite diário';
  return null;
}

/** Próximo número utilizável: prioridade (principal primeiro) e, no empate, o menos usado hoje. */
export function nextUsable<T extends PoolNumber>(pool: T[], excludeIds: string[] = []): T | null {
  return (
    pool
      .filter((n) => isUsable(n) && !excludeIds.includes(n.id))
      .sort((a, b) => a.priority - b.priority || a.sentToday - b.sentToday || a.id.localeCompare(b.id))[0] ?? null
  );
}

const numberSelect = { id: true, name: true, phone: true, status: true, paused: true, sentToday: true, dailyLimit: true, priority: true, consultantId: true, purpose: true } as const;

export async function consultantNumbers(orgId: string, consultantId: string) {
  return db.whatsAppNumber.findMany({ where: { organizationId: orgId, consultantId }, select: numberSelect, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
}

/** Número principal utilizável do consultor (para abrir conversa nova com lead dele). */
export async function primaryNumberFor(orgId: string, consultantId: string | null | undefined) {
  if (!consultantId) return null;
  return nextUsable(await consultantNumbers(orgId, consultantId));
}

/**
 * Número que vai enviar a próxima mensagem da conversa.
 * 1) o número atual, se estiver no ar (mesmo no limite do dia — aí a mensagem fica na fila);
 * 2) se caiu: backup do mesmo consultor; 3) conversa sem dono: números da operação.
 */
export async function resolveSendingNumber(orgId: string, conv: { whatsappNumberId: string | null; assignedConsultantId: string | null }, excludeIds: string[] = []) {
  const current = conv.whatsappNumberId ? await db.whatsAppNumber.findFirst({ where: { id: conv.whatsappNumberId, organizationId: orgId }, select: numberSelect }) : null;
  if (current && isHealthy(current) && !excludeIds.includes(current.id)) return { number: current, previous: null };
  const exclude = [...excludeIds, ...(current ? [current.id] : [])];
  const ownerId = current?.consultantId ?? conv.assignedConsultantId;
  let next = ownerId ? nextUsable(await consultantNumbers(orgId, ownerId), exclude) : null;
  // Sem dono: números da operação (nunca usa o número pessoal de outro consultor).
  if (!next && !ownerId) next = nextUsable(await db.whatsAppNumber.findMany({ where: { organizationId: orgId, consultantId: null }, select: numberSelect }), exclude);
  return { number: next, previous: current };
}

/** Troca o número da conversa e deixa registrado (nota de sistema visível no Inbox). */
export async function switchConversationNumber(orgId: string, conversationId: string, from: PoolNumber | null, to: PoolNumber) {
  await db.conversation.update({ where: { id: conversationId }, data: { whatsappNumberId: to.id } });
  await db.message.create({
    data: {
      organizationId: orgId,
      conversationId,
      direction: 'OUTBOUND',
      senderType: 'SYSTEM',
      content: `Número ${from ? `${from.name} (${unusableReason(from) ?? 'indisponível'})` : 'anterior'} → conversa segue pelo backup ${to.name}.`,
      status: 'SENT',
    },
  });
  await publish(orgId, 'conversation.number_switched', { conversationId, fromNumberId: from?.id ?? null, toNumberId: to.id });
}

/** Reenvia, pelo número atual da conversa, as mensagens que ficaram na fila. */
export async function flushQueued(orgId: string, conversationId: string) {
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, include: { lead: { select: { phone: true, optOut: true } } } });
  if (!conv?.whatsappNumberId || conv.lead.optOut) return 0;
  const queued = await db.message.findMany({ where: { conversationId, direction: 'OUTBOUND', status: 'QUEUED', senderType: { in: ['AI', 'HUMAN'] } }, orderBy: { createdAt: 'asc' }, take: 20 });
  let sent = 0;
  for (const m of queued) {
    const n = await db.whatsAppNumber.findUnique({ where: { id: conv.whatsappNumberId }, select: numberSelect });
    if (!n || !isUsable(n)) break;
    try {
      const res = await providers.whatsapp.send({ fromNumberId: n.id, to: conv.lead.phone ?? '', text: m.content });
      await db.message.update({ where: { id: m.id }, data: { status: res.status, externalId: res.externalId } });
      await db.whatsAppNumber.update({ where: { id: n.id }, data: { sentToday: { increment: 1 } } });
      if (res.status === 'SENT') sent++;
    } catch (e) {
      await markNumberError(orgId, n.id, String(e));
      break;
    }
  }
  return sent;
}

/**
 * Número caiu: move as conversas abertas dele para o backup do mesmo consultor e reenvia a fila.
 * Avisa o consultor (e a gestão, se ele ficou sem nenhum número).
 */
export async function failoverNumber(orgId: string, numberId: string) {
  const down = await db.whatsAppNumber.findFirst({ where: { id: numberId, organizationId: orgId }, select: numberSelect });
  if (!down || isHealthy(down)) return { moved: 0, stranded: 0 };
  const convs = await db.conversation.findMany({ where: { organizationId: orgId, whatsappNumberId: numberId, status: 'OPEN' }, select: { id: true, assignedConsultantId: true } });
  let moved = 0;
  let stranded = 0;
  for (const c of convs) {
    const { number } = await resolveSendingNumber(orgId, { whatsappNumberId: numberId, assignedConsultantId: c.assignedConsultantId });
    if (!number) {
      stranded++;
      continue;
    }
    await switchConversationNumber(orgId, c.id, down, number);
    await flushQueued(orgId, c.id);
    moved++;
  }
  if (down.consultantId) {
    const backup = nextUsable(await consultantNumbers(orgId, down.consultantId));
    await notifyConsultant(orgId, down.consultantId, {
      type: 'whatsapp.number_down',
      priority: 'HIGH',
      title: `WhatsApp ${down.name} ${unusableReason(down) ?? 'indisponível'}`,
      body: backup ? `${moved} conversa(s) seguiram pelo backup ${backup.name}.` : 'Você está sem número de backup disponível — fale com a gestão.',
      link: '/perfil',
      dedupeKey: `number_down:${down.id}:${new Date().toISOString().slice(0, 13)}`,
    });
    if (!backup) {
      await notifyRoles(orgId, ['MANAGER', 'ADMIN'], {
        type: 'whatsapp.number_down',
        priority: 'HIGH',
        title: 'Consultor sem número de WhatsApp disponível',
        body: `${down.name} caiu e não há backup saudável. ${stranded} conversa(s) aguardando.`,
        link: '/whatsapp/numeros',
        dedupeKey: `no_backup:${down.consultantId}:${new Date().toISOString().slice(0, 13)}`,
      });
    }
  }
  logger.info('whatsapp.failover', { orgId, numberId, moved, stranded });
  return { moved, stranded };
}

/** Falha de envio no provedor: marca o número com erro e aciona o backup. */
export async function markNumberError(orgId: string, numberId: string, error: string) {
  await db.whatsAppNumber.update({ where: { id: numberId }, data: { status: 'ERROR', lastError: error.slice(0, 300), lastErrorAt: new Date() } });
  await publish(orgId, 'integration.error', { provider: 'whatsapp', error: error.slice(0, 300) });
  return failoverNumber(orgId, numberId);
}

/** Varredura periódica: números fora do ar que ainda têm conversas abertas → failover. */
export async function scanNumbers(orgId: string) {
  const down = await db.whatsAppNumber.findMany({ where: { organizationId: orgId, OR: [{ status: { not: 'CONNECTED' } }, { paused: true }] }, select: { id: true } });
  let moved = 0;
  for (const n of down) {
    const open = await db.conversation.count({ where: { organizationId: orgId, whatsappNumberId: n.id, status: 'OPEN' } });
    if (open) moved += (await failoverNumber(orgId, n.id)).moved;
  }
  return { checked: down.length, moved };
}
