import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { getOrgSettings } from '../organizations/settings';

// A/B TESTING — variantes com peso, atribuição determinística por visitante/lead e resultado medido
// por métricas de NEGÓCIO (qualificados, oportunidades, conversões, receita) — não só CPL.

export const EXPERIMENT_TARGETS = { LANDING: 'Landing page', HEADLINE: 'Headline', CTA: 'CTA', FORM: 'Formulário', MESSAGE: 'Mensagem', CAMPAIGN: 'Campanha', PLAYBOOK: 'Playbook', QUALIFICATION_FLOW: 'Fluxo de qualificação' } as const;
export const PRIMARY_METRICS = { LEADS: 'Leads', QUALIFIED: 'Qualificados', OPPORTUNITIES: 'Oportunidades', CONVERSIONS: 'Conversões', REVENUE: 'Receita' } as const;

export const experimentInput = z.object({
  name: z.string().min(3).max(120),
  hypothesis: z.string().max(500).optional(),
  target: z.enum(Object.keys(EXPERIMENT_TARGETS) as [keyof typeof EXPERIMENT_TARGETS]),
  targetId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  primaryMetric: z.enum(Object.keys(PRIMARY_METRICS) as [keyof typeof PRIMARY_METRICS]).default('OPPORTUNITIES'),
  variants: z.array(z.object({ key: z.string().regex(/^[A-E]$/), name: z.string().min(1).max(80), weight: z.number().int().min(1).max(100), config: z.record(z.unknown()).default({}) })).min(2).max(5),
});

export async function listExperiments(ctx: Ctx) {
  assertCan(ctx, 'campaign.read');
  return db.experiment.findMany({ where: { organizationId: ctx.orgId }, include: { variants: { orderBy: { key: 'asc' } } }, orderBy: { createdAt: 'desc' } });
}

export async function createExperiment(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'campaign.create');
  const input = experimentInput.parse(raw);
  if (new Set(input.variants.map((v) => v.key)).size !== input.variants.length) throw BadRequest('Chaves de variante repetidas.');
  const exp = await db.experiment.create({
    data: {
      organizationId: ctx.orgId,
      name: input.name,
      hypothesis: input.hypothesis,
      target: input.target,
      targetId: input.targetId ?? null,
      campaignId: input.campaignId ?? null,
      primaryMetric: input.primaryMetric,
      variants: { create: input.variants.map((v) => ({ organizationId: ctx.orgId, key: v.key, name: v.name, weight: v.weight, config: v.config as object })) },
    },
    include: { variants: true },
  });
  await audit(ctx, 'experiment.changed', { type: 'Experiment', id: exp.id }, { action: 'created', name: exp.name });
  return exp;
}

export async function setExperimentStatus(ctx: Ctx, id: string, status: 'RUNNING' | 'PAUSED' | 'COMPLETED') {
  assertCan(ctx, 'campaign.update');
  const exp = await db.experiment.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!exp) throw NotFound('Experimento');
  await db.experiment.update({ where: { id }, data: { status, ...(status === 'RUNNING' && !exp.startedAt ? { startedAt: new Date() } : {}), ...(status === 'COMPLETED' ? { endedAt: new Date() } : {}) } });
  await audit(ctx, 'experiment.changed', { type: 'Experiment', id }, { from: exp.status, to: status });
  return { ok: true };
}

/** Atribuição determinística (mesmo visitante → mesma variante), proporcional aos pesos. */
export function pickVariant<T extends { key: string; weight: number }>(variants: T[], subjectKey: string): T {
  const total = variants.reduce((s, v) => s + v.weight, 0);
  const h = parseInt(crypto.createHash('sha256').update(subjectKey).digest('hex').slice(0, 8), 16) % total;
  let acc = 0;
  for (const v of variants) {
    acc += v.weight;
    if (h < acc) return v;
  }
  return variants[variants.length - 1];
}

/** Expõe um visitante a um experimento ativo do alvo (landing / campanha) e registra a exposição. */
export async function assignVariant(orgId: string, target: { landingPageId?: string | null; campaignId?: string | null }, subjectKey: string) {
  const exp = await db.experiment.findFirst({
    where: { organizationId: orgId, status: 'RUNNING', OR: [...(target.landingPageId ? [{ targetId: target.landingPageId }] : []), ...(target.campaignId ? [{ campaignId: target.campaignId }] : [])] },
    include: { variants: true },
  });
  if (!exp || !exp.variants.length) return null;
  const v = pickVariant(exp.variants, `${exp.id}:${subjectKey}`);
  await db.experimentVariant.update({ where: { id: v.id }, data: { exposures: { increment: 1 } } });
  return { experimentId: exp.id, variantId: v.id, key: v.key, config: v.config };
}

/** Resultado por variante: funil de negócio completo + intervalo simples (erro padrão de proporção). */
export async function experimentResults(ctx: Ctx, id: string) {
  assertCan(ctx, 'campaign.read');
  const exp = await db.experiment.findFirst({ where: { id, organizationId: ctx.orgId }, include: { variants: { orderBy: { key: 'asc' } } } });
  if (!exp) throw NotFound('Experimento');
  const settings = await getOrgSettings(ctx.orgId);
  const rows = await Promise.all(
    exp.variants.map(async (v) => {
      const [leads, qualified, opps, won] = await Promise.all([
        db.lead.count({ where: { organizationId: ctx.orgId, experimentVariantId: v.id, deletedAt: null } }),
        db.lead.count({ where: { organizationId: ctx.orgId, experimentVariantId: v.id, deletedAt: null, temperature: { in: ['MORNO', 'QUENTE'] } } }),
        db.opportunity.count({ where: { organizationId: ctx.orgId, experimentVariantId: v.id } }),
        db.opportunity.aggregate({ where: { organizationId: ctx.orgId, experimentVariantId: v.id, status: 'WON' }, _count: { _all: true }, _sum: { value: true } }),
      ]);
      const revenue = settings.roi.revenuePctOfWonValue != null ? Math.round(((won._sum.value ?? 0) * settings.roi.revenuePctOfWonValue) / 100) : null;
      const rate = (a: number, b: number) => (b ? a / b : 0);
      const primary = { LEADS: leads, QUALIFIED: qualified, OPPORTUNITIES: opps, CONVERSIONS: won._count._all, REVENUE: revenue ?? 0 }[exp.primaryMetric as keyof typeof PRIMARY_METRICS];
      const p = rate(primary, v.exposures);
      const se = v.exposures ? Math.sqrt((p * (1 - p)) / v.exposures) : 0;
      return {
        id: v.id,
        key: v.key,
        name: v.name,
        weight: v.weight,
        exposures: v.exposures,
        spend: v.spend,
        leads,
        qualified,
        opportunities: opps,
        conversions: won._count._all,
        revenue,
        cpl: leads && v.spend ? v.spend / leads : null,
        primaryRate: exp.primaryMetric === 'REVENUE' ? null : Math.round(p * 10000) / 100,
        ci95: exp.primaryMetric === 'REVENUE' ? null : [Math.max(0, Math.round((p - 1.96 * se) * 10000) / 100), Math.round((p + 1.96 * se) * 10000) / 100],
      };
    })
  );
  // Vencedor só quando o intervalo do líder não sobrepõe o do 2º (e com volume mínimo).
  const sorted = [...rows].filter((r) => r.primaryRate != null).sort((a, b) => b.primaryRate! - a.primaryRate!);
  const [lead, second] = sorted;
  const enough = rows.every((r) => r.exposures >= 100);
  const winner = lead && second && enough && lead.ci95 && second.ci95 && lead.ci95[0] > second.ci95[1] ? lead.key : null;
  return { experiment: exp, rows, winner, note: winner ? `Variante ${winner} vence em ${PRIMARY_METRICS[exp.primaryMetric as keyof typeof PRIMARY_METRICS]} (IC 95% sem sobreposição).` : 'Sem vencedor estatístico ainda — continue coletando (mín. 100 exposições por variante) e compare os resultados de negócio, não só o CPL.' };
}
