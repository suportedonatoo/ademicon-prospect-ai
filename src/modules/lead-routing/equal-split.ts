import { db } from '@/lib/db';
import { equalSplitPeriodStart } from './routing-engine';

/**
 * Só leads ORGÂNICOS contam na divisão igual geral: leads de anúncio patrocinado foram pagos por
 * consultores específicos e não podem deixá-los "atrás" na fila do orgânico.
 */
export const ORGANIC_ONLY = {
  AND: [
    { OR: [{ campaignId: null }, { campaign: { sponsorConsultantIds: { isEmpty: true } } }] },
    // o que o consultor trouxe sozinho (link da bio / WhatsApp dele) é dele e não entra na conta da divisão
    { OR: [{ routingHint: null }, { AND: [{ NOT: { routingHint: { startsWith: 'LINK:' } } }, { NOT: { routingHint: { startsWith: 'OWNER:' } } }] }] },
  ],
};

/**
 * ENTRADA NA DIVISÃO IGUAL
 *
 * A divisão igual entrega o próximo lead para quem recebeu menos no mês. Sem ajuste, quem entra no
 * meio do mês (ou volta a ficar ativo) teria 0 e receberia TODOS os próximos leads até alcançar a
 * equipe. Por isso, ao entrar, a pessoa começa empatada com quem tem menos na PJ (linha de base) e
 * passa a receber em rodízio igual a partir dali. A linha de base vale só no mês em que foi definida.
 */
export async function entryBaseline(orgId: string, pjId: string, excludeConsultantId?: string) {
  const since = equalSplitPeriodStart();
  const peers = await db.consultant.findMany({
    where: { organizationId: orgId, pjId, active: true, ...(excludeConsultantId ? { NOT: { id: excludeConsultantId } } : {}) },
    select: { id: true, splitBaseline: true, splitBaselineAt: true },
  });
  if (!peers.length) return 0;
  const counts = await db.lead.groupBy({
    by: ['consultantId'],
    where: { organizationId: orgId, consultantId: { in: peers.map((p) => p.id) }, assignedAt: { gte: since }, deletedAt: null, ...ORGANIC_ONLY },
    _count: { _all: true },
  });
  const effective = peers.map((p) => (counts.find((c) => c.consultantId === p.id)?._count._all ?? 0) + baselineOf(p, since));
  return Math.min(...effective);
}

/** Linha de base vigente (só conta no mês em que foi definida). */
export function baselineOf(c: { splitBaseline: number; splitBaselineAt: Date | null }, since = equalSplitPeriodStart()) {
  return c.splitBaselineAt && c.splitBaselineAt >= since ? c.splitBaseline : 0;
}

/** Marca a entrada do consultor na divisão (cadastro novo ou reativação). */
export async function enterEqualSplit(orgId: string, consultantId: string, pjId: string) {
  const baseline = await entryBaseline(orgId, pjId, consultantId);
  const since = equalSplitPeriodStart();
  const own = await db.lead.count({ where: { organizationId: orgId, consultantId, assignedAt: { gte: since }, deletedAt: null, ...ORGANIC_ONLY } });
  // Quem já recebeu leads no mês não ganha linha de base menor do que já tem.
  const splitBaseline = Math.max(0, baseline - own);
  await db.consultant.update({ where: { id: consultantId }, data: { splitBaseline, splitBaselineAt: new Date() } });
  return splitBaseline;
}
