import { db } from '@/lib/db';

export const DEFAULT_STAGES = [
  { key: 'NOVO', name: 'Novo' },
  { key: 'QUALIFICADO', name: 'Qualificado' },
  { key: 'OPORTUNIDADE', name: 'Oportunidade' },
  { key: 'CONTATO', name: 'Contato' },
  { key: 'NECESSIDADE', name: 'Necessidade' },
  { key: 'SIMULACAO', name: 'Simulação' },
  { key: 'PROPOSTA', name: 'Proposta' },
  { key: 'NEGOCIACAO', name: 'Negociação' },
  { key: 'FECHADO', name: 'Fechado', isWon: true },
  { key: 'PERDIDO', name: 'Perdido', isLost: true },
] as const;

export async function ensureDefaultPipeline(orgId: string) {
  const existing = await db.pipeline.findFirst({ where: { organizationId: orgId, isDefault: true }, include: { stages: { orderBy: { order: 'asc' } } } });
  if (existing) return existing;
  return db.pipeline.create({
    data: {
      organizationId: orgId,
      name: 'Pipeline comercial',
      isDefault: true,
      stages: {
        create: DEFAULT_STAGES.map((s, i) => ({
          organizationId: orgId,
          key: s.key,
          name: s.name,
          order: i,
          isWon: 'isWon' in s ? s.isWon : false,
          isLost: 'isLost' in s ? s.isLost : false,
        })),
      },
    },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
}

export async function getDefaultPipeline(orgId: string) {
  return ensureDefaultPipeline(orgId);
}
