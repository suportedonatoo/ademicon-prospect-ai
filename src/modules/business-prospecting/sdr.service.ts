import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { BadRequest, Forbidden, NotFound } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { getAIProvider } from '../ai/providers';
import { convertProspect, ownProspects } from './prospecting.service';
import type { Research } from './research';
import { CADENCE, LEARN_FROM, nextState, qualificationProgress, RESULTS, stepMessage, type Channel, type Qualification, type Stage } from './sdr';

/** Etapas em que a empresa ainda está "viva" na fila do SDR. */
export const ACTIVE_STAGES: Stage[] = ['NOVO', 'EM_CADENCIA', 'CONVERSANDO'];

async function load(ctx: Ctx, id: string) {
  const p = await db.businessProspect.findFirst({ where: { id, organizationId: ctx.orgId, ...ownProspects(ctx) } });
  if (!p) throw NotFound('Empresa');
  return p;
}

/** Início do próximo dia no fuso da organização (o que vence "hoje" é tudo antes disso). */
export function startOfNextLocalDay(now: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  const localAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day + 1) - offset);
}

/** Mensagem da etapa: IA quando configurada, senão o modelo padrão da etapa. */
async function messageFor(step: number, p: { name: string; city: string; uf: string; cnae: string | null; research: unknown }) {
  const r = p.research as Research | null;
  const base = r ?? { segment: 'empresas', decisionMaker: null, message: `Olá! Tudo bem? Sou consultor de consórcio e ajudo empresas da região a planejar veículos, máquinas e imóvel sem juros de financiamento. Posso te mandar uma simulação rápida?` };
  const fallback = stepMessage(step, p.name, base);
  if (step <= 1 || CADENCE[step]?.channel !== 'WHATSAPP') return fallback;
  const ai = getAIProvider();
  if (ai.name === 'mock' || !r) return fallback;
  try {
    const out = await ai.pitch({ company: p.name, segment: r.segment, activity: p.cnae ?? r.segment, product: r.product, city: `${p.city}/${p.uf}`, decisionMaker: r.decisionMaker, reasons: r.reasons, step: { label: CADENCE[step].label, goal: CADENCE[step].goal } });
    return out?.message ?? fallback;
  } catch (e) {
    logger.warn('sdr.message_fallback', { error: String(e).slice(0, 200) });
    return fallback;
  }
}

/** Coloca (ou recoloca) a empresa na cadência, a partir de hoje. */
export async function startCadence(ctx: Ctx, id: string, now = new Date()) {
  assertCan(ctx, 'prospecting.convert');
  const p = await load(ctx, id);
  if (p.sdrStage && ACTIVE_STAGES.includes(p.sdrStage as Stage)) throw BadRequest('A empresa já está na cadência.');
  if (p.status === 'CONVERTED') throw BadRequest('A empresa já virou lead.');
  if (!p.phone && !p.email) throw BadRequest('Empresa sem telefone nem e-mail.');
  return db.businessProspect.update({
    where: { id },
    data: { sdrStage: 'NOVO', sdrStep: 0, sdrStartedAt: now, sdrNextAt: now, sdrMessage: await messageFor(0, p), status: 'NEW', assignedConsultantId: p.assignedConsultantId ?? ctx.consultantId },
  });
}

export const touchInput = z.object({ result: z.string().min(2).max(30), note: z.string().trim().max(1000).optional() });

/** Registra o resultado de um toque e anda a cadência. */
export async function registerTouch(ctx: Ctx, id: string, raw: unknown, now = new Date()) {
  assertCan(ctx, 'prospecting.convert');
  const input = touchInput.parse(raw);
  const p = await load(ctx, id);
  if (!p.sdrStage || !ACTIVE_STAGES.includes(p.sdrStage as Stage)) throw BadRequest('A empresa não está na cadência.');
  const talking = p.sdrStage === 'CONVERSANDO';
  // Em conversa vale qualquer resultado (ligação ou WhatsApp); na cadência, o canal da etapa.
  const channel: Channel | 'NOTE' = talking ? (input.result in RESULTS.CALL ? 'CALL' : input.result in RESULTS.WHATSAPP ? 'WHATSAPP' : 'NOTE') : CADENCE[p.sdrStep].channel;
  if (channel === 'NOTE' ? input.result !== 'ANOTACAO' : !(input.result in RESULTS[channel])) throw BadRequest('Resultado inválido para esta etapa.');

  const next = nextState({ stage: p.sdrStage as Stage, step: p.sdrStep, startedAt: p.sdrStartedAt ?? p.collectedAt }, input.result, now);
  const learn = LEARN_FROM[input.result];
  const [activity] = await db.$transaction([
    db.prospectActivity.create({ data: { organizationId: ctx.orgId, prospectId: id, consultantId: ctx.consultantId ?? p.assignedConsultantId, step: talking ? null : p.sdrStep, channel, result: input.result, note: input.note || null } }),
    db.businessProspect.update({
      where: { id },
      data: {
        sdrStage: next.stage,
        sdrStep: next.step,
        sdrNextAt: next.nextAt,
        ...(next.step !== p.sdrStep ? { sdrMessage: await messageFor(next.step, p) } : {}),
        ...(next.stage === 'DESCARTADA' ? { status: 'DISCARDED' } : {}),
        ...(learn && p.researchScore != null ? { outcome: learn, outcomeAt: now } : {}),
      },
    }),
  ]);
  return { activity, stage: next.stage, step: next.step, nextAt: next.nextAt };
}

export const qualificationInput = z.object({
  want: z.string().trim().max(200).nullable().optional(),
  value: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  term: z.string().trim().max(80).nullable().optional(),
  hasBid: z.boolean().nullable().optional(),
  isDecisionMaker: z.boolean().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function saveQualification(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, 'prospecting.convert');
  const q = qualificationInput.parse(raw);
  const p = await load(ctx, id);
  const merged = { ...((p.qualification as Qualification | null) ?? {}), ...q };
  await db.businessProspect.update({ where: { id }, data: { qualification: merged as Prisma.InputJsonValue } });
  return { qualification: merged, ...qualificationProgress(merged) };
}

/** Qualificada → vira lead do consultor, levando o que foi levantado (objetivo, valor, prazo). */
export async function handoff(ctx: Ctx, id: string) {
  assertCan(ctx, 'prospecting.convert');
  const p = await load(ctx, id);
  const q = p.qualification as Qualification | null;
  if (!qualificationProgress(q).qualified) throw BadRequest('Complete a qualificação: o que quer comprar, valor, prazo e se falou com quem decide.');
  const product = (p.research as Research | null)?.product;
  const objective = [q!.want, q!.hasBid ? 'tem valor para lance' : null, q!.notes].filter(Boolean).join(' · ').slice(0, 200);
  const res = await convertProspect(ctx, id, product, { objective, desiredValue: q!.value, term: q!.term });
  await db.businessProspect.update({ where: { id }, data: { sdrStage: 'QUALIFICADA', sdrNextAt: null, ...(p.researchScore != null ? { outcome: 'INTERESSADO', outcomeAt: new Date() } : {}) } });
  return res;
}

/** Fila do dia do consultor + números da cadência. */
export async function sdrQueue(ctx: Ctx, now = new Date()) {
  assertCan(ctx, 'prospecting.read');
  if (!ctx.consultantId) throw Forbidden('A fila do SDR é do consultor.');
  const org = await db.organization.findUnique({ where: { id: ctx.orgId }, select: { timezone: true } });
  const end = startOfNextLocalDay(now, org?.timezone ?? 'America/Sao_Paulo');
  const mine = { organizationId: ctx.orgId, assignedConsultantId: ctx.consultantId };
  const [due, upcoming, byStage] = await Promise.all([
    db.businessProspect.findMany({ where: { ...mine, sdrStage: { in: ACTIVE_STAGES }, sdrNextAt: { lt: end } }, orderBy: [{ sdrNextAt: 'asc' }], take: 100 }),
    db.businessProspect.count({ where: { ...mine, sdrStage: { in: ACTIVE_STAGES }, sdrNextAt: { gte: end } } }),
    db.businessProspect.groupBy({ by: ['sdrStage'], where: { ...mine, sdrStage: { not: null } }, _count: { _all: true } }),
  ]);
  // Conversas primeiro (já tem gente do outro lado), depois maior nota.
  due.sort((a, b) => Number(b.sdrStage === 'CONVERSANDO') - Number(a.sdrStage === 'CONVERSANDO') || (b.researchScore ?? -1) - (a.researchScore ?? -1));
  return { due, upcoming, stages: Object.fromEntries(byStage.map((s) => [s.sdrStage!, s._count._all])) as Partial<Record<Stage, number>> };
}

/** Gestão: funil do SDR por consultor e toques dos últimos 7 dias. */
export async function sdrTeam(ctx: Ctx, now = new Date()) {
  assertCan(ctx, 'prospecting.read');
  if (ctx.scope !== 'ORG') throw Forbidden('Visão da gestão.');
  const [byStage, touches, consultants] = await Promise.all([
    db.businessProspect.groupBy({ by: ['assignedConsultantId', 'sdrStage'], where: { organizationId: ctx.orgId, sdrStage: { not: null } }, _count: { _all: true } }),
    db.prospectActivity.groupBy({ by: ['consultantId', 'result'], where: { organizationId: ctx.orgId, createdAt: { gte: new Date(now.getTime() - 7 * 24 * 3600_000) } }, _count: { _all: true } }),
    db.consultant.findMany({ where: { organizationId: ctx.orgId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return consultants
    .map((c) => {
      const stages = Object.fromEntries(byStage.filter((s) => s.assignedConsultantId === c.id).map((s) => [s.sdrStage!, s._count._all])) as Partial<Record<Stage, number>>;
      const mine = touches.filter((t) => t.consultantId === c.id);
      const count = (results?: string[]) => mine.filter((t) => !results || results.includes(t.result)).reduce((n, t) => n + t._count._all, 0);
      return { id: c.id, name: c.name, stages, touches7d: count(), decisors7d: count(['DECISOR', 'RESPONDEU']) };
    })
    .filter((c) => Object.keys(c.stages).length || c.touches7d);
}
