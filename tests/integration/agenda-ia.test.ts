import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { encryptSecret } from '@/lib/secrets';
import { createOrg, resetDb } from '../helpers';
import { receiveInboundMessage } from '@/modules/ai/maestro/maestro.engine';
import { maestroCommand } from '@/modules/calendar/scheduling.service';
import { saveAiProfile } from '@/modules/consultants/consultant.service';
import { consultantPersona, parseAiProfile } from '@/modules/ai/consultant-persona';
import { localParts, zoned } from '@/modules/calendar/when';
import { testConsultantAi } from '@/modules/ai/consultant-ai-test.service';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
const E = env as unknown as Record<string, unknown>;
const TZ = 'America/Sao_Paulo';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
type Call = { url: string; method: string; body: Record<string, unknown> };

// Amanhã, 10h–11h em São Paulo: ocupado no Google Agenda.
const tomorrow = () => {
  const p = localParts(new Date(Date.now() + 86400_000), TZ);
  return { y: p.y, m: p.m, d: p.d };
};
const at = (h: number, min = 0) => {
  const t = tomorrow();
  return zoned(t.y, t.m, t.d, h, min, TZ);
};

function fakeGoogle() {
  const calls: Call[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    const url = String(u);
    const method = (init as RequestInit)?.method ?? 'GET';
    const raw = (init as RequestInit)?.body;
    const body = raw && typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {};
    calls.push({ url, method, body });
    if (url.includes('oauth2.googleapis.com/token')) return json({ access_token: 'ya29.teste', expires_in: 3600 });
    if (url.endsWith('/freeBusy')) return json({ calendars: { primary: { busy: [{ start: at(10).toISOString(), end: at(11).toISOString() }] } } });
    if (url.includes('/calendars/primary/events')) return json({ id: `evt-${calls.length}`, htmlLink: 'https://calendar.google.com/event?eid=1', hangoutLink: 'https://meet.google.com/abc-defg-hij' });
    return json({ error: { message: `não previsto: ${url}` } }, 404);
  });
  return calls;
}

async function newLead(name: string, consultantId: string) {
  const lead = await db.lead.create({ data: { organizationId: A.org.id, name, source: 'INSTAGRAM', consultantId, phone: `55119${Math.floor(10000000 + Math.random() * 89999999)}`, email: `${name.split(' ')[0].toLowerCase()}@cliente.test` } });
  const conv = await db.conversation.create({ data: { organizationId: A.org.id, leadId: lead.id, channel: 'WEB', assignedConsultantId: consultantId, currentAgent: 'PROSPECT' } });
  return { lead, conv };
}
const lastAi = async (conversationId: string) => (await db.message.findFirstOrThrow({ where: { conversationId, senderType: 'AI' }, orderBy: { createdAt: 'desc' } })).content;

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Agenda');
  E.GOOGLE_CLIENT_ID = 'cliente.apps.googleusercontent.com';
  E.GOOGLE_CLIENT_SECRET = 'segredo-google';
  const c = A.consultants[0];
  await db.consultant.update({ where: { id: c.id }, data: { name: 'Joana Barros', googleCalendarTokenEnc: encryptSecret('1//refresh-joana'), googleCalendarEmail: 'joana@gmail.test' } });
  const ctx = await A.ctx(A.users.consultant);
  // Todos os dias, 8h às 20h, sem antecedência mínima: o teste não depende do dia em que roda.
  await saveAiProfile(ctx, c.id, {
    enabled: true,
    assistantName: 'Bia',
    training: 'Sou uma corretora extrovertida e gosto de marcar reunião por vídeo logo no começo.',
    scheduling: { enabled: true, durationMin: 30, mode: 'ONLINE', minNoticeHours: 0, days: [0, 1, 2, 3, 4, 5, 6], start: 8, end: 20 },
  });
}, 120_000);
afterEach(() => vi.restoreAllMocks());

describe('Treinar a IA', () => {
  it('o texto de treinamento entra nas instruções da IA, sem passar por cima das regras', async () => {
    const c = await db.consultant.findUniqueOrThrow({ where: { id: A.consultants[0].id } });
    const p = consultantPersona(c.aiProfile, c.name, { personality: { formality: 'm', objectivity: 'm', emojis: false, style: '' }, disclosure: 'Sou assistente virtual.' });
    expect(p.instructions).toContain('Sou uma corretora extrovertida');
    expect(p.instructions).toMatch(/regras da empresa .* prioridade/);
    expect(p.instructions).toContain('ofereça marcar uma reunião');
    expect(p.disclosure).toMatch(/Bia, assistente virtual de Joana/);
  });

  it('salvar só uma parte (perfil) não apaga o treinamento nem a agenda', async () => {
    const ctx = await A.ctx(A.users.consultant);
    await saveAiProfile(ctx, A.consultants[0].id, { enabled: true, assistantName: 'Bia', presentation: null, style: 'Tom alegre', emojis: false });
    const p = parseAiProfile((await db.consultant.findUniqueOrThrow({ where: { id: A.consultants[0].id } })).aiProfile);
    expect(p.style).toBe('Tom alegre');
    expect(p.training).toContain('extrovertida');
    expect(p.scheduling?.start).toBe(8);
    await expect(saveAiProfile(ctx, A.consultants[0].id, { scheduling: { enabled: true, mode: 'PRESENCIAL', days: [1], start: 9, end: 18 } })).rejects.toThrow(/endereço/);
  });

  it('testar a IA: pedido de reunião mostra horários livres de verdade, sem marcar nada', async () => {
    fakeGoogle();
    const ctx = await A.ctx(A.users.consultant);
    const r = await testConsultantAi(ctx, A.consultants[0].id, { message: 'dá pra gente marcar uma reunião?', history: [] });
    expect(r.reply).toMatch(/1\) .*\n2\) /);
    expect(await db.meeting.count()).toBe(0);
  });
});

describe('Testar a IA (conversa de teste)', () => {
  it('lembra o que o cliente disse: valor informado não é bloqueado e a IA não chama ninguém de "Cliente"', async () => {
    const ctx = await A.ctx(A.users.consultant);
    const id = A.consultants[0].id;
    const r1 = await testConsultantAi(ctx, id, { message: 'Oi, quero entender como funciona o consórcio de imóvel', history: [] });
    expect(r1.reply).not.toMatch(/Cliente/);
    expect(r1.reply).toMatch(/assistente virtual/);
    const history = [
      { role: 'lead' as const, content: 'Oi, quero entender como funciona o consórcio de imóvel' },
      { role: 'assistant' as const, content: r1.reply },
    ];
    const r2 = await testConsultantAi(ctx, id, { message: 'quero uma carta de 300 mil, moro em Campinas', history });
    expect(r2.reply).not.toMatch(/precisa ser confirmada por um consultor/);
    expect(r2.reply).not.toMatch(/qual (o )?valor/i); // não pergunta de novo o que já sabe
  });
});

describe('IA marca reunião na conversa', () => {
  it('cliente pede reunião → a IA oferece 3 horários livres (nenhum no horário ocupado do Google)', async () => {
    fakeGoogle();
    const { conv } = await newLead('Maria Souza', A.consultants[0].id);
    const r = await receiveInboundMessage(A.org.id, conv.id, 'Oi! Podemos marcar uma reunião para eu entender melhor?');
    expect(r.skipped).toBe('Horários oferecidos');
    const msg = await lastAi(conv.id);
    expect(msg).toMatch(/assistente virtual/); // primeira resposta se apresenta
    expect(msg).toMatch(/1\) .+\n2\) .+\n3\) .+/);
    const st = (await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })).scheduling as { offered: string[] };
    expect(st.offered).toHaveLength(3);
    const busy = { s: at(10).getTime(), e: at(11).getTime() };
    expect(st.offered.every((x) => new Date(x).getTime() + 30 * 60_000 <= busy.s || new Date(x).getTime() >= busy.e)).toBe(true);
  });

  it('cliente escolhe "a segunda opção" → evento no Google Agenda com Meet, tarefa, aviso e confirmação', async () => {
    const calls = fakeGoogle();
    const conv = await db.conversation.findFirstOrThrow({ where: { lead: { name: 'Maria Souza' } } });
    const offered = (conv.scheduling as { offered: string[] }).offered;
    const r = await receiveInboundMessage(A.org.id, conv.id, 'pode ser a segunda opção');
    expect(r.skipped).toBe('Reunião marcada');

    const m = await db.meeting.findFirstOrThrow({ where: { conversationId: conv.id } });
    expect(m.startAt.toISOString()).toBe(offered[1]);
    expect(m).toMatchObject({ mode: 'ONLINE', createdBy: 'AI', meetLink: 'https://meet.google.com/abc-defg-hij', status: 'SCHEDULED' });
    const ev = calls.find((c) => c.url.includes('/calendars/primary/events'))!;
    expect(ev.url).toContain('conferenceDataVersion=1');
    expect(ev.url).toContain('sendUpdates=all');
    expect(ev.body).toMatchObject({ summary: 'Reunião com Maria Souza (consórcio)', attendees: [{ email: 'maria@cliente.test' }] });
    expect((ev.body.conferenceData as { createRequest: { conferenceSolutionKey: { type: string } } }).createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');

    expect(await db.task.findUniqueOrThrow({ where: { id: m.taskId! } })).toMatchObject({ type: 'MEETING', consultantId: A.consultants[0].id });
    const confirm = await lastAi(conv.id);
    expect(confirm).toMatch(/^Prontinho, Maria! Sua reunião com Joana está marcada para .+ Link: https:\/\/meet\.google\.com\/abc-defg-hij/);
    expect(confirm).toContain('convite também foi para o seu e-mail');
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })).scheduling).toEqual({});
    expect(await db.notification.count({ where: { title: 'Reunião marcada: Maria Souza' } })).toBe(1);
  });

  it('cliente pede um horário ocupado → a IA avisa e oferece outros', async () => {
    fakeGoogle();
    const { conv } = await newLead('Carlos Lima', A.consultants[0].id);
    await receiveInboundMessage(A.org.id, conv.id, 'Quero agendar amanhã às 10h');
    expect(await lastAi(conv.id)).toMatch(/não está livre.*\n1\) /s);
    expect(await db.meeting.count({ where: { conversationId: conv.id } })).toBe(0);
    // Depois ele diz um horário livre direto:
    await receiveInboundMessage(A.org.id, conv.id, 'então amanhã às 16h');
    const m = await db.meeting.findFirstOrThrow({ where: { conversationId: conv.id } });
    expect(m.startAt.toISOString()).toBe(at(16).toISOString());
  });

  it('o mesmo horário não é oferecido nem marcado duas vezes', async () => {
    fakeGoogle();
    const { conv } = await newLead('Paula Reis', A.consultants[0].id);
    await receiveInboundMessage(A.org.id, conv.id, 'Pode ser amanhã às 16h? quero marcar uma reunião');
    expect(await lastAi(conv.id)).toMatch(/não está livre/);
  });

  it('mensagem sem relação com agenda segue para a IA normal', async () => {
    fakeGoogle();
    const { conv } = await newLead('Rui Alves', A.consultants[0].id);
    const r = await receiveInboundMessage(A.org.id, conv.id, 'Como funciona a contemplação?');
    expect(r.skipped).toBeUndefined();
    expect(await db.meeting.count({ where: { conversationId: conv.id } })).toBe(0);
  });
});

describe('Maestro marca a pedido do consultor', () => {
  it('"agenda com Rui amanhã às 17h" → reunião marcada e confirmação para o cliente', async () => {
    fakeGoogle();
    const ctx = await A.ctx(A.users.consultant);
    const r = await maestroCommand(ctx, 'agenda com Rui Alves amanhã às 17h');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Marquei a reunião com Rui Alves para .+ no seu Google Agenda e mandei a confirmação/);
    const m = await db.meeting.findFirstOrThrow({ where: { createdBy: 'MAESTRO' } });
    expect(m.startAt.toISOString()).toBe(at(17).toISOString());
    const conv = await db.conversation.findFirstOrThrow({ where: { lead: { name: 'Rui Alves' } } });
    expect(await lastAi(conv.id)).toMatch(/^Prontinho, Rui!/);
  });

  it('pede o que falta, avisa conflito e lista a agenda', async () => {
    fakeGoogle();
    const ctx = await A.ctx(A.users.consultant);
    expect((await maestroCommand(ctx, 'agenda com Carlos Lima')).message).toMatch(/^Para quando\?/);
    expect((await maestroCommand(ctx, 'marca com Carlos amanhã às 10h')).message).toMatch(/não está livre/);
    expect((await maestroCommand(ctx, 'agenda com Fulano Inexistente amanhã 15h')).message).toMatch(/Não achei/);
    const lista = await maestroCommand(ctx, 'minhas reuniões');
    expect(lista.message.split('\n')).toHaveLength(3);
  });

  it('sem Google Agenda conectado a reunião vira tarefa e o consultor é orientado', async () => {
    fakeGoogle();
    await db.consultant.update({ where: { id: A.consultants[0].id }, data: { googleCalendarTokenEnc: null } });
    const ctx = await A.ctx(A.users.consultant);
    const r = await maestroCommand(ctx, 'agenda com Paula Reis amanhã às 18h');
    expect(r.message).toMatch(/conecte o Google Agenda em Configurar IA/);
    const m = await db.meeting.findFirstOrThrow({ where: { startAt: at(18) } });
    expect(m.googleEventId).toBeNull();
    expect(m.taskId).not.toBeNull();
  });
});
