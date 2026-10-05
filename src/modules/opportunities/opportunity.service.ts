import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { leadScope, opportunityScope } from '../leads/scope';
import { getDefaultPipeline } from '../pipelines/pipeline.service';
import { notifyConsultant } from '../notifications/notification.service';
import { LOSS_CATEGORIES, classifyLoss } from './health-engine';
import { dispatchOutbox, enqueueOutbox } from '@/lib/outbox';

// Opportunity Engine — Lead e Oportunidade são entidades distintas.
// Um lead pode gerar várias oportunidades (ex.: imóvel agora, veículo depois).

export const opportunityFilterSchema = z.object({
  q: z.string().optional(),
  stageKey: z.string().optional(),
  status: z.string().optional(),
  pjId: z.string().optional(),
  consultantId: z.string().optional(),
  product: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export function opportunityWhere(ctx: Ctx, f: Partial<z.infer<typeof opportunityFilterSchema>>): Prisma.OpportunityWhereInput {
  return {
    ...opportunityScope(ctx),
    ...(f.stageKey ? { stage: { key: f.stageKey } } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.pjId ? { pjId: f.pjId } : {}),
    ...(f.consultantId ? { consultantId: f.consultantId } : {}),
    ...(f.product ? { product: f.product } : {}),
    ...(f.q ? { lead: { name: { contains: f.q, mode: 'insensitive' } } } : {}),
  };
}

export async function listOpportunities(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'opportunity.read');
  const f = opportunityFilterSchema.parse(raw ?? {});
  const where = opportunityWhere(ctx, f);
  const [items, total] = await Promise.all([
    db.opportunity.findMany({
      where,
      include: { lead: { select: { id: true, name: true, score: true, temperature: true, phone: true } }, stage: true, consultant: { select: { id: true, name: true } }, pj: { select: { code: true } } },
      orderBy: { updatedAt: 'desc' },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    db.opportunity.count({ where }),
  ]);
  return { items, total, page: f.page, pageSize: f.pageSize };
}

/** Dados do Kanban: estágios + oportunidades (limitadas por coluna para manter a página leve). */
export async function getBoard(ctx: Ctx, raw: unknown, perStage = 40) {
  assertCan(ctx, 'opportunity.read');
  const f = opportunityFilterSchema.parse(raw ?? {});
  const pipeline = await getDefaultPipeline(ctx.orgId);
  const where = opportunityWhere(ctx, f);
  const [counts, sums] = await Promise.all([
    db.opportunity.groupBy({ by: ['stageId'], where, _count: { _all: true } }),
    db.opportunity.groupBy({ by: ['stageId'], where, _sum: { value: true } }),
  ]);
  const columns = await Promise.all(
    pipeline.stages.map(async (stage) => ({
      stage,
      count: counts.find((c) => c.stageId === stage.id)?._count._all ?? 0,
      total: sums.find((s) => s.stageId === stage.id)?._sum.value ?? 0,
      items: await db.opportunity.findMany({
        where: { ...where, stageId: stage.id },
        include: { lead: { select: { id: true, name: true, score: true, temperature: true } }, consultant: { select: { id: true, name: true } }, pj: { select: { code: true } } },
        orderBy: { updatedAt: 'desc' },
        take: perStage,
      }),
    }))
  );
  return { pipeline, columns };
}

export async function getOpportunity(ctx: Ctx, id: string) {
  assertCan(ctx, 'opportunity.read');
  const opp = await db.opportunity.findFirst({
    where: { ...opportunityScope(ctx), id },
    include: { lead: true, stage: true, pipeline: { include: { stages: { orderBy: { order: 'asc' } } } }, consultant: true, pj: true, activities: { orderBy: { createdAt: 'desc' } }, tasks: true },
  });
  if (!opp) throw NotFound('Oportunidade');
  return opp;
}

export const createOpportunitySchema = z.object({
  leadId: z.string(),
  value: z.coerce.number().int().min(0).optional(),
  product: z.string().optional(),
  stageKey: z.string().default('OPORTUNIDADE'),
});

export async function createOpportunity(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'opportunity.create');
  const input = createOpportunitySchema.parse(raw);
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: input.leadId } });
  if (!lead) throw NotFound('Lead');
  if (['CONVERTED', 'BLOCKED'].includes(lead.status)) throw BadRequest('Lead convertido ou bloqueado não pode gerar nova oportunidade.');
  const pipeline = await getDefaultPipeline(ctx.orgId);
  const stage = pipeline.stages.find((s) => s.key === input.stageKey) ?? pipeline.stages.find((s) => s.key === 'OPORTUNIDADE')!;

  const opp = await db.$transaction(async (tx) => {
    const created = await tx.opportunity.create({
      data: {
        organizationId: ctx.orgId,
        leadId: lead.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        pjId: lead.pjId,
        consultantId: lead.consultantId ?? ctx.consultantId,
        product: input.product ?? lead.product,
        value: input.value ?? lead.desiredValue ?? 0,
        source: lead.source,
        campaignId: lead.campaignId,
        experimentVariantId: lead.experimentVariantId,
        lastActivityAt: new Date(),
      },
    });
    await tx.opportunityActivity.create({
      data: { organizationId: ctx.orgId, opportunityId: created.id, type: 'CREATED', toStage: stage.key, description: `Oportunidade criada por ${ctx.userName}`, actorId: ctx.userId },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { status: 'OPPORTUNITY' } });
    await tx.leadActivity.create({
      data: { organizationId: ctx.orgId, leadId: lead.id, type: 'OPPORTUNITY', description: `Oportunidade #${created.code} criada (${stage.name})`, actorType: ctx.via === 'session' ? 'USER' : 'SYSTEM', actorId: ctx.userId },
    });
    await tx.attributionEvent.create({ data: { organizationId: ctx.orgId, type: 'OPPORTUNITY_CREATED', leadId: lead.id, opportunityId: created.id, consultantId: created.consultantId, campaignId: lead.campaignId, value: created.value } });
    return created;
  });

  await audit(ctx, 'opportunity.created', { type: 'Opportunity', id: opp.id }, { leadId: lead.id, value: opp.value });
  await publish(ctx.orgId, 'opportunity.created', { opportunityId: opp.id, leadId: lead.id, value: opp.value });
  if (opp.consultantId && opp.consultantId !== ctx.consultantId) {
    await notifyConsultant(ctx.orgId, opp.consultantId, { type: 'opportunity.created', title: 'Oportunidade criada', body: `${lead.name} · #${opp.code}`, link: `/oportunidades/${opp.id}`, entityType: 'Lead', entityId: lead.id });
  }
  return opp;
}

export async function moveOpportunity(ctx: Ctx, id: string, stageKey: string, lostReason?: string, loss: { category?: string; competitor?: string } = {}) {
  assertCan(ctx, 'opportunity.update');
  const opp = await getOpportunity(ctx, id);
  const target = opp.pipeline.stages.find((s) => s.key === stageKey);
  if (!target) throw BadRequest('Etapa inválida.');
  if (target.id === opp.stageId) return opp;
  if (target.isLost && !lostReason) throw BadRequest('Informe o motivo da perda.');

  const closing = target.isWon || target.isLost;
  const lossCategory = target.isLost ? (loss.category && loss.category in LOSS_CATEGORIES ? loss.category : classifyLoss(lostReason)) : null;
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id },
      data: {
        stageId: target.id,
        status: target.isWon ? 'WON' : target.isLost ? 'LOST' : 'OPEN',
        closedAt: closing ? now : null,
        lostReason: target.isLost ? lostReason : null,
        lostCategory: lossCategory,
        competitor: target.isLost ? loss.competitor?.slice(0, 120) || null : null,
        stageChangedAt: now,
        lastActivityAt: now,
        ...(closing ? { health: null, healthScore: null, healthReasons: [] } : {}),
      },
    });
    if (target.isLost) {
      // LOSS INTELLIGENCE: registro estruturado para análise de padrões.
      await tx.lossRecord.upsert({
        where: { opportunityId: id },
        create: { organizationId: ctx.orgId, opportunityId: id, leadId: opp.leadId, category: lossCategory!, reason: lostReason, competitor: loss.competitor?.slice(0, 120) || null, stageKey: opp.stage.key, product: opp.product, pjId: opp.pjId, consultantId: opp.consultantId, campaignId: opp.campaignId, value: opp.value },
        update: { category: lossCategory!, reason: lostReason, competitor: loss.competitor?.slice(0, 120) || null, stageKey: opp.stage.key },
      });
    } else {
      await tx.lossRecord.deleteMany({ where: { opportunityId: id } });
    }
    await tx.opportunityActivity.create({
      data: {
        organizationId: ctx.orgId,
        opportunityId: id,
        type: target.isWon ? 'CLOSED_WON' : target.isLost ? 'CLOSED_LOST' : 'STAGE_CHANGED',
        fromStage: opp.stage.key,
        toStage: target.key,
        description: `${opp.stage.name} → ${target.name}${lostReason ? ` · ${lostReason}` : ''}`,
        actorId: ctx.userId,
      },
    });
    if (target.isWon) {
      await tx.lead.update({ where: { id: opp.leadId }, data: { status: 'CONVERTED' } });
      await tx.attributionEvent.create({ data: { organizationId: ctx.orgId, type: 'CONVERSION', leadId: opp.leadId, opportunityId: id, consultantId: opp.consultantId, campaignId: opp.campaignId, value: opp.value } });
    } else if (target.isLost) {
      const openOthers = await tx.opportunity.count({ where: { leadId: opp.leadId, status: 'OPEN', id: { not: id } } });
      if (!openOthers) await tx.lead.update({ where: { id: opp.leadId }, data: { status: 'LOST', lostReason } });
    } else if (opp.status !== 'OPEN') {
      await tx.lead.update({ where: { id: opp.leadId }, data: { status: 'OPPORTUNITY' } });
    }
    // OUTBOX: o fechamento (receita) é gravado na MESMA transação — o evento não se perde.
    if (closing) await enqueueOutbox(tx, ctx.orgId, 'opportunity.closed', { opportunityId: id, leadId: opp.leadId, won: target.isWon, value: opp.value });
  });

  await audit(ctx, 'opportunity.stage_changed', { type: 'Opportunity', id }, { from: opp.stage.key, to: target.key, lostReason });
  await publish(ctx.orgId, 'opportunity.stage_changed', { opportunityId: id, leadId: opp.leadId, from: opp.stage.key, to: target.key });
  if (closing) {
    await audit(ctx, 'opportunity.closed', { type: 'Opportunity', id }, { won: target.isWon });
    await dispatchOutbox(); // despacho imediato; se falhar, o job outbox.dispatch reprocessa
  }
  return getOpportunity(ctx, id);
}

export async function updateOpportunityValue(ctx: Ctx, id: string, value: number) {
  assertCan(ctx, 'opportunity.update');
  const opp = await getOpportunity(ctx, id);
  await db.opportunity.update({ where: { id }, data: { value, lastActivityAt: new Date() } });
  await db.opportunityActivity.create({
    data: { organizationId: ctx.orgId, opportunityId: id, type: 'VALUE_CHANGED', description: `Valor ${opp.value.toLocaleString('pt-BR')} → ${value.toLocaleString('pt-BR')}`, actorId: ctx.userId },
  });
  return getOpportunity(ctx, id);
}

export async function addOpportunityNote(ctx: Ctx, id: string, text: string) {
  assertCan(ctx, 'activity.create');
  await getOpportunity(ctx, id);
  await db.opportunity.update({ where: { id }, data: { lastActivityAt: new Date() } });
  return db.opportunityActivity.create({ data: { organizationId: ctx.orgId, opportunityId: id, type: 'NOTE', description: text.slice(0, 2000), actorId: ctx.userId } });
}
