import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import type { Ctx } from '../auth/context';
import { getOrgSettings } from '../organizations/settings';
import { computeScore, inferIntent, type ScoreBreakdownItem } from './scoring-engine';

/** Recalcula e persiste o score do lead, registrando os eventos de pontuação novos. */
export async function rescoreLead(ctx: Ctx, leadId: string, opts: { reason?: string; intentOverride?: string } = {}) {
  const lead = await db.lead.findFirstOrThrow({ where: { id: leadId, organizationId: ctx.orgId }, include: { scoreSnapshot: true } });
  const settings = await getOrgSettings(ctx.orgId);
  const signals = (lead.signals ?? {}) as Record<string, boolean>;
  const intent = opts.intentOverride ?? (lead.intent === 'HIGH' ? 'HIGH' : inferIntent({ ...lead, signals }));
  const result = computeScore({ ...lead, intent, signals }, settings.scoring);

  const previous = ((lead.scoreSnapshot?.breakdown ?? []) as unknown as ScoreBreakdownItem[]).filter((b) => b.hit).map((b) => b.key);
  const newlyHit = result.breakdown.filter((b) => b.hit && !previous.includes(b.key));

  await db.$transaction([
    db.lead.update({ where: { id: lead.id }, data: { score: result.score, temperature: result.temperature, intent } }),
    db.leadScore.upsert({
      where: { leadId: lead.id },
      create: { organizationId: ctx.orgId, leadId: lead.id, score: result.score, temperature: result.temperature, breakdown: result.breakdown as object },
      update: { score: result.score, temperature: result.temperature, breakdown: result.breakdown as object, computedAt: new Date() },
    }),
    ...newlyHit.map((b) =>
      db.leadScoreEvent.create({ data: { organizationId: ctx.orgId, leadId: lead.id, ruleKey: b.key, points: b.points, reason: opts.reason ?? b.label } })
    ),
  ]);

  if (lead.score !== result.score) {
    await db.leadActivity.create({
      data: {
        organizationId: ctx.orgId,
        leadId: lead.id,
        type: 'SCORED',
        description: `Score ${lead.score} → ${result.score} (${result.temperature})`,
        actorType: ctx.via === 'system' ? 'SYSTEM' : 'USER',
        actorId: ctx.userId,
        metadata: { added: newlyHit.map((b) => `+${b.points} ${b.label}`) },
      },
    });
    await publish(ctx.orgId, 'lead.scored', { leadId: lead.id, score: result.score, previousScore: lead.score, temperature: result.temperature });
  }
  return { ...result, intent, previousScore: lead.score };
}
