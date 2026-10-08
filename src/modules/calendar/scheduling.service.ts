import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { firstName } from '@/lib/normalize';
import { BadRequest, Forbidden, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { getOrgSettings } from '../organizations/settings';
import { consultantPersona, schedulingOf, type Scheduling } from '../ai/consultant-persona';
import { deliverMessage } from '../messaging/messaging.service';
import { notifyConsultant } from '../notifications/notification.service';
import { formatWhen, localParts, norm, parseOption, parseWhen, zoned } from './when';
import { googleBusy, googleCreateEvent } from './google-calendar.service';

/**
 * REUNIÕES COM O CLIENTE
 *
 * - Pela IA: o cliente pede para marcar ("dá pra gente conversar amanhã?") → a IA oferece 3 horários livres
 *   da agenda do consultor → o cliente escolhe ("a segunda opção", "terça 10h") → reunião marcada.
 * - Pelo Maestro: o consultor escreve "agenda com Maria amanhã às 15h" → reunião marcada.
 * Nos dois casos: evento no Google Agenda do consultor (com Google Meet se online), tarefa no sistema,
 * aviso ao consultor e CONFIRMAÇÃO automática para o cliente na conversa.
 */

const tz = () => env.APP_TIMEZONE;
const OFFER_TTL_MS = 48 * 3600_000;
const MODE_LABEL = { ONLINE: 'online (Google Meet)', PRESENCIAL: 'presencial', LIGACAO: 'por ligação' } as const;

/** Pedido de reunião na mensagem do cliente. */
export const SCHEDULE_INTENT =
  /\b(agend|marc(ar|a|amos)\b|reuniao|reunir|call\b|videochamada|chamada de video|encontro|visita|conversar (com (ele|ela|o consultor|a consultora|voce)|pessoalmente|por video|amanha|hoje)|falar com (ele|ela|o consultor|a consultora) (amanha|hoje|segunda|terca|quarta|quinta|sexta)|qual (o )?(melhor )?horario|que horas (voce|vc|ele|ela) pode|tem horario)/;
export const wantsMeeting = (text: string) => SCHEDULE_INTENT.test(norm(text));

type Consultant = { id: string; name: string; aiProfile: unknown; googleCalendarTokenEnc: string | null };
const CONSULTANT_SELECT = { id: true, name: true, aiProfile: true, googleCalendarTokenEnc: true } as const;

// ---------- horários livres ----------

async function busyFor(consultantId: string, from: Date, to: Date) {
  const [google, local] = await Promise.all([
    googleBusy(consultantId, from, to).catch((e) => {
      logger.warn('google_calendar.busy_failed', { consultantId, error: String(e) });
      return [];
    }),
    db.meeting.findMany({ where: { consultantId, status: 'SCHEDULED', startAt: { lt: to }, endAt: { gt: from } }, select: { startAt: true, endAt: true } }),
  ]);
  return [...google, ...local.map((m) => ({ start: m.startAt, end: m.endAt }))];
}

const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start < b.end && b.start < a.end;

function withinHours(start: Date, s: Scheduling) {
  const p = localParts(start, tz());
  const end = localParts(new Date(start.getTime() + s.durationMin * 60_000), tz());
  const endMin = end.h * 60 + end.min || 24 * 60;
  return s.days.includes(p.wd) && p.h * 60 + p.min >= s.start * 60 && endMin <= s.end * 60 && end.d === p.d;
}

/** Horários livres nos próximos dias (passo = duração da reunião), respeitando antecedência mínima e expediente. */
export async function freeSlots(c: Consultant, opts: { now?: Date; days?: number; onDay?: { y: number; m: number; d: number } | null } = {}) {
  const s = schedulingOf(c.aiProfile);
  const now = opts.now ?? new Date();
  const earliest = new Date(now.getTime() + s.minNoticeHours * 3600_000);
  const today = localParts(now, tz());
  const days = opts.onDay ? 1 : (opts.days ?? 7);
  const from = opts.onDay ? zoned(opts.onDay.y, opts.onDay.m, opts.onDay.d, 0, 0, tz()) : zoned(today.y, today.m, today.d, 0, 0, tz());
  const to = new Date(from.getTime() + (days + 1) * 86400_000);
  const busy = await busyFor(c.id, from, to);
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const base = new Date(from.getTime() + i * 86400_000 + 12 * 3600_000);
    const p = localParts(base, tz());
    for (let m = s.start * 60; m + s.durationMin <= s.end * 60; m += s.durationMin) {
      const start = zoned(p.y, p.m, p.d, Math.floor(m / 60), m % 60, tz());
      const slot = { start, end: new Date(start.getTime() + s.durationMin * 60_000) };
      if (start < earliest || !withinHours(start, s) || busy.some((b) => overlaps(slot, b))) continue;
      out.push(start);
    }
  }
  return out;
}

/** Até 3 sugestões variadas: o primeiro horário, um em outro período do dia e um em outro dia. */
export function pickSuggestions(slots: Date[]) {
  if (slots.length <= 3) return slots;
  const key = (d: Date) => localParts(d, tz());
  const picked: Date[] = [slots[0]];
  const first = key(slots[0]);
  const otherPeriod = slots.find((d) => {
    const k = key(d);
    return k.d === first.d && (k.h < 12) !== (first.h < 12);
  });
  if (otherPeriod) picked.push(otherPeriod);
  const otherDay = slots.find((d) => key(d).d !== first.d && !picked.includes(d));
  if (otherDay) picked.push(otherDay);
  for (const d of slots) if (picked.length < 3 && !picked.includes(d) && d.getTime() - picked[picked.length - 1].getTime() >= 3 * 3600_000) picked.push(d);
  return picked.sort((a, b) => a.getTime() - b.getTime()).slice(0, 3);
}

async function isFree(c: Consultant, start: Date, now = new Date()) {
  const s = schedulingOf(c.aiProfile);
  if (start.getTime() < now.getTime() + s.minNoticeHours * 3600_000 || !withinHours(start, s)) return false;
  const slot = { start, end: new Date(start.getTime() + s.durationMin * 60_000) };
  return !(await busyFor(c.id, slot.start, slot.end)).some((b) => overlaps(slot, b));
}

// ---------- marcar ----------

export async function bookMeeting(input: { orgId: string; consultant: Consultant; leadId: string; conversationId?: string | null; start: Date; createdBy: 'AI' | 'MAESTRO' | 'MANUAL'; notify?: boolean }) {
  const { orgId, consultant: c } = input;
  const s = schedulingOf(c.aiProfile);
  const lead = await db.lead.findFirstOrThrow({ where: { id: input.leadId, organizationId: orgId }, select: { id: true, name: true, phone: true, email: true, product: true, desiredValue: true } });
  const end = new Date(input.start.getTime() + s.durationMin * 60_000);
  const when = formatWhen(input.start, tz());
  const location = s.mode === 'PRESENCIAL' ? s.address || null : null;

  // 1 · Google Agenda (se conectada). Falha no Google não impede a reunião: vira tarefa e o consultor é avisado.
  let event: { id: string; htmlLink: string | null; meetLink: string | null } | null = null;
  let googleError: string | null = null;
  if (c.googleCalendarTokenEnc) {
    try {
      event = await googleCreateEvent(c.id, {
        summary: `Reunião com ${lead.name} (consórcio)`,
        description: [
          `Cliente: ${lead.name}`,
          lead.phone ? `WhatsApp: +${lead.phone}` : '',
          lead.product ? `Interesse: ${lead.product}${lead.desiredValue ? ` · R$ ${Number(lead.desiredValue).toLocaleString('pt-BR')}` : ''}` : '',
          `Marcado por: ${input.createdBy === 'AI' ? 'assistente virtual' : input.createdBy === 'MAESTRO' ? 'Maestro' : 'consultor'}`,
          `Ficha: ${env.APP_URL}/leads/${lead.id}`,
        ]
          .filter(Boolean)
          .join('\n'),
        start: input.start,
        end,
        tz: tz(),
        online: s.mode === 'ONLINE',
        location,
        attendeeEmail: lead.email,
      });
    } catch (e) {
      googleError = (e as Error).message;
      logger.warn('google_calendar.create_failed', { consultantId: c.id, error: googleError });
    }
  }

  // 2 · Tarefa + reunião no sistema
  const task = await db.task.create({
    data: { organizationId: orgId, type: 'MEETING', title: `Reunião com ${lead.name}`, description: `${MODE_LABEL[s.mode]}${event?.meetLink ? ` · ${event.meetLink}` : ''}${location ? ` · ${location}` : ''}`, consultantId: c.id, leadId: lead.id, dueAt: input.start, priority: 'HIGH', origin: 'AUTOMATION' },
  });
  const meeting = await db.meeting.create({
    data: { organizationId: orgId, consultantId: c.id, leadId: lead.id, conversationId: input.conversationId ?? null, taskId: task.id, startAt: input.start, endAt: end, mode: s.mode, location, googleEventId: event?.id ?? null, meetLink: event?.meetLink ?? null, htmlLink: event?.htmlLink ?? null, createdBy: input.createdBy },
  });
  await db.leadActivity.create({
    data: { organizationId: orgId, leadId: lead.id, type: 'MEETING_SCHEDULED', description: `Reunião marcada para ${when} (${MODE_LABEL[s.mode]})${event ? ' · no Google Agenda' : ''}`, actorType: input.createdBy === 'MANUAL' ? 'USER' : 'AI', metadata: { meetingId: meeting.id, googleError } },
  });
  if (input.notify !== false) {
    await notifyConsultant(orgId, c.id, { type: 'meeting.scheduled', priority: 'HIGH', title: `Reunião marcada: ${lead.name}`, body: `${when}${googleError ? ' · não entrou no Google Agenda: ' + googleError : event ? ' · no seu Google Agenda' : ''}`, link: `/leads/${lead.id}`, entityType: 'Lead', entityId: lead.id, dedupeKey: `meeting:${meeting.id}` });
  }

  // 3 · Confirmação para o cliente na conversa
  const conversationId = input.conversationId ?? (await db.conversation.findFirst({ where: { organizationId: orgId, leadId: lead.id }, orderBy: { lastMessageAt: 'desc' }, select: { id: true } }))?.id ?? null;
  let confirmation: { status: string } | null = null;
  if (conversationId) {
    const how = s.mode === 'ONLINE' ? (event?.meetLink ? `por vídeo. Link: ${event.meetLink}` : 'por vídeo; o link chega antes da reunião.') : s.mode === 'PRESENCIAL' ? `presencial${location ? `, em ${location}` : ''}.` : 'por ligação, no seu número.';
    const msg = await deliverMessage(orgId, conversationId, {
      content: `Prontinho, ${firstName(lead.name)}! Sua reunião com ${firstName(c.name)} está marcada para ${when}, ${how}${lead.email && event ? ' O convite também foi para o seu e-mail.' : ''} Se precisar remarcar, é só me avisar por aqui.`,
      senderType: 'AI',
      agentKey: 'AGENDA',
    });
    confirmation = { status: msg.status };
  }
  return { meeting, when, googleEvent: !!event, googleError, confirmation };
}

// ---------- conversa com a IA ----------

interface SchedState {
  offered?: string[];
  offeredAt?: string;
}

/**
 * Chamado a cada mensagem do cliente com a IA ativa. Se a mensagem é sobre marcar reunião
 * (ou a escolha de um horário oferecido), o agendamento responde e a IA não precisa gerar texto.
 */
export async function handleSchedulingTurn(orgId: string, conversationId: string, text: string, now = new Date()): Promise<{ handled: boolean; booked?: boolean }> {
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, select: { id: true, leadId: true, assignedConsultantId: true, scheduling: true, messages: { where: { direction: 'OUTBOUND', senderType: 'AI' }, take: 1, select: { id: true } } } });
  if (!conv?.assignedConsultantId) return { handled: false };
  const c = await db.consultant.findUnique({ where: { id: conv.assignedConsultantId }, select: CONSULTANT_SELECT });
  if (!c || !schedulingOf(c.aiProfile).enabled) return { handled: false };
  const st = (conv.scheduling ?? {}) as SchedState;
  const offered = st.offered && st.offeredAt && now.getTime() - new Date(st.offeredAt).getTime() < OFFER_TTL_MS ? st.offered.map((x) => new Date(x)) : [];
  const parsed = parseWhen(text, now, tz());
  const option = offered.length ? parseOption(text, offered.length) : null;
  if (!offered.length && !wantsMeeting(text)) return { handled: false };
  // Com horários oferecidos, só trata a mensagem se ela falar de horário/dia ou escolher uma opção.
  if (offered.length && option === null && !parsed.day && !parsed.time && !wantsMeeting(text)) return { handled: false };

  const reply = async (content: string) => {
    // Primeira resposta da IA nesta conversa: apresenta-se como assistente virtual (regra da plataforma).
    let intro = '';
    if (!conv.messages.length) {
      const settings = await getOrgSettings(orgId);
      intro = `${consultantPersona(c.aiProfile, c.name, { personality: settings.ai.personality, disclosure: settings.ai.rules.disclosure }).disclosure} `;
    }
    await deliverMessage(orgId, conversationId, { content: intro + content, senderType: 'AI', agentKey: 'AGENDA' });
  };
  const book = async (start: Date) => {
    await db.conversation.update({ where: { id: conversationId }, data: { scheduling: {} } });
    if (!conv.messages.length) await reply('Vou confirmar seu horário.');
    await bookMeeting({ orgId, consultant: c, leadId: conv.leadId, conversationId, start, createdBy: 'AI' });
    return { handled: true, booked: true };
  };
  const offer = async (slots: Date[], prefix: string) => {
    if (!slots.length) {
      await reply(`${prefix}Não encontrei horário livre com ${firstName(c.name)} nos próximos dias. Vou pedir para ${firstName(c.name)} te chamar para combinar, tudo bem?`);
      await notifyConsultant(orgId, c.id, { type: 'meeting.no_slots', priority: 'HIGH', title: 'Cliente quer marcar reunião e a agenda está cheia', body: text.slice(0, 120), link: `/conversas?c=${conversationId}`, entityType: 'Lead', entityId: conv.leadId });
      return { handled: true };
    }
    await db.conversation.update({ where: { id: conversationId }, data: { scheduling: { offered: slots.map((d) => d.toISOString()), offeredAt: now.toISOString() } } });
    const list = slots.map((d, i) => `${i + 1}) ${formatWhen(d, tz())}`).join('\n');
    await reply(`${prefix}Tenho estes horários com ${firstName(c.name)}:\n${list}\nQual fica melhor para você? Se preferir outro dia ou horário, é só dizer.`);
    return { handled: true };
  };

  if (option !== null) return book(offered[option]);
  if (parsed.at) {
    // O cliente disse dia/hora: confere se bate com uma oferta ou se está livre.
    const match = offered.find((d) => Math.abs(d.getTime() - parsed.at!.getTime()) < 60_000);
    if (match || (await isFree(c, parsed.at, now))) return book(match ?? parsed.at);
    const sameDay = await freeSlots(c, { now, onDay: parsed.day ?? null });
    return offer(pickSuggestions(sameDay.length ? sameDay : await freeSlots(c, { now })), `Esse horário (${formatWhen(parsed.at, tz())}) não está livre. `);
  }
  if (parsed.day) {
    const slots = await freeSlots(c, { now, onDay: parsed.day });
    return offer(pickSuggestions(slots.length ? slots : await freeSlots(c, { now })), slots.length ? '' : 'Nesse dia não tenho horário livre. ');
  }
  return offer(pickSuggestions(await freeSlots(c, { now })), 'Claro! ');
}

// ---------- Maestro (pedido do consultor) ----------

const STOP = new Set(['agenda', 'agendar', 'agende', 'marca', 'marcar', 'marque', 'reuniao', 'com', 'para', 'pra', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dia', 'as', 'hoje', 'amanha', 'depois', 'uma', 'um', 'call', 'ligacao', 'video', 'cliente', 'lead', 'meu', 'minha', 'e', 'no', 'na']);

/** Resposta do Maestro a um pedido em texto: "agenda com Maria Souza amanhã às 15h", "minhas reuniões". */
export async function maestroCommand(ctx: Ctx, text: string, now = new Date()) {
  const t = norm(text);
  const consultantId = ctx.consultantId;
  if (/\b(minhas|proximas) reunioes\b|\bminha agenda\b|\bagenda de hoje\b/.test(t)) {
    if (!consultantId) throw Forbidden('Só consultores têm agenda de reuniões.');
    const list = await db.meeting.findMany({ where: { consultantId, status: 'SCHEDULED', startAt: { gte: now } }, orderBy: { startAt: 'asc' }, take: 8 });
    const leads = await db.lead.findMany({ where: { id: { in: list.map((m) => m.leadId) } }, select: { id: true, name: true } });
    return { ok: true, message: list.length ? list.map((m) => `• ${formatWhen(m.startAt, tz())} — ${leads.find((l) => l.id === m.leadId)?.name ?? 'cliente'}`).join('\n') : 'Nenhuma reunião marcada daqui para frente.' };
  }
  if (!/\b(agend|marc|reuni)/.test(t)) return { ok: false, message: 'Posso marcar reuniões: escreva, por exemplo, "agenda com Maria amanhã às 15h" ou "minhas reuniões".' };
  if (!consultantId) throw Forbidden('Peça ao consultor do lead para marcar pela conta dele (a reunião vai para a agenda dele).');
  const c = await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId }, select: CONSULTANT_SELECT });
  if (!c) throw NotFound('Consultor');

  // Qual cliente: o lead do consultor cujo nome mais aparece no pedido.
  const words = t.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w) && !/^(segunda|terca|quarta|quinta|sexta|sabado|domingo|feira|manha|tarde|noite|horas?|meia)$/.test(w));
  if (!words.length) return { ok: false, message: 'Com qual cliente? Ex.: "agenda com Maria Souza amanhã às 15h".' };
  const leads = await db.lead.findMany({ where: { organizationId: ctx.orgId, consultantId, deletedAt: null, OR: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })) }, select: { id: true, name: true }, take: 50 });
  const scored = leads.map((l) => ({ l, score: words.filter((w) => norm(l.name).split(/\s+/).includes(w)).length })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return { ok: false, message: `Não achei um lead seu com o nome "${words.join(' ')}".` };
  if (scored.length > 1 && scored[0].score === scored[1].score) return { ok: false, message: `Achei mais de um: ${scored.slice(0, 4).map((x) => x.l.name).join(', ')}. Escreva o nome completo.` };
  const lead = scored[0].l;

  const parsed = parseWhen(text, now, tz());
  if (!parsed.at) {
    const slots = pickSuggestions(await freeSlots(c, { now, onDay: parsed.day }));
    return { ok: false, message: `Para quando? Seus próximos horários livres: ${slots.map((d) => formatWhen(d, tz())).join('; ') || 'nenhum nos próximos dias'}.` };
  }
  if (!(await isFree(c, parsed.at, now))) {
    const slots = pickSuggestions(await freeSlots(c, { now, onDay: parsed.day }));
    return { ok: false, message: `${formatWhen(parsed.at, tz())} não está livre na sua agenda (ou fora do seu horário). Livres: ${slots.map((d) => formatWhen(d, tz())).join('; ') || 'nenhum nesse dia'}.` };
  }
  const r = await bookMeeting({ orgId: ctx.orgId, consultant: c, leadId: lead.id, start: parsed.at, createdBy: 'MAESTRO', notify: false });
  const sent = r.confirmation ? (['SENT', 'DELIVERED', 'QUEUED'].includes(r.confirmation.status) ? 'mandei a confirmação para o cliente na conversa' : `a confirmação não saiu (${r.confirmation.status}) — avise o cliente`) : 'o cliente ainda não tem conversa aberta, então avise ele';
  return { ok: true, message: `Marquei a reunião com ${lead.name} para ${r.when}${r.googleEvent ? ' no seu Google Agenda' : r.googleError ? ` (não entrou no Google Agenda: ${r.googleError})` : ' (conecte o Google Agenda em Configurar IA para ir direto para a agenda)'} e ${sent}.`, leadId: lead.id, meetingId: r.meeting.id };
}

/** Configuração de agenda na tela (validação simples além do schema). */
export function assertSchedulingSane(s: Scheduling) {
  if (s.end <= s.start) throw BadRequest('O fim do expediente precisa ser depois do início.');
  if (!s.days.length) throw BadRequest('Escolha ao menos um dia da semana.');
  if (s.mode === 'PRESENCIAL' && !s.address?.trim()) throw BadRequest('Informe o endereço das reuniões presenciais.');
}
