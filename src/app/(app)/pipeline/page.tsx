import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getBoard } from '@/modules/opportunities/opportunity.service';
import { filterOptions } from '@/modules/analytics/options';
import { PageHeader } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { Board } from './board';

export const metadata = { title: 'Pipeline' };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('opportunity.read');
  const sp = await searchParams;
  const [{ columns }, o] = await Promise.all([getBoard(ctx, sp), filterOptions(ctx)]);
  return (
    <>
      <PageHeader title="Pipeline" crumb="CRM" subtitle="NOVO → QUALIFICADO → OPORTUNIDADE → CONTATO → NECESSIDADE → SIMULAÇÃO → PROPOSTA → NEGOCIAÇÃO → FECHADO / PERDIDO. Arraste os cards entre as etapas." />
      <FilterBar
        className="mb-4"
        fields={[
          { name: 'q', label: 'Buscar lead', type: 'search' },
          ...(ctx.scope === 'ORG' ? [{ name: 'pjId', label: 'PJ', options: o.pjId }] : []),
          ...(ctx.scope !== 'OWN' ? [{ name: 'consultantId', label: 'Consultor', options: o.consultantId }] : []),
          { name: 'product', label: 'Produto', options: o.product },
        ]}
      />
      <Board
        canMove={can(ctx, 'opportunity.update')}
        columns={columns.map((c) => ({
          key: c.stage.key,
          name: c.stage.name,
          isWon: c.stage.isWon,
          isLost: c.stage.isLost,
          count: c.count,
          total: c.total,
          items: c.items.map((i) => ({
            id: i.id,
            code: i.code,
            leadId: i.lead.id,
            leadName: i.lead.name,
            score: i.lead.score,
            temperature: i.lead.temperature,
            value: i.value,
            product: i.product,
            consultant: i.consultant?.name ?? null,
            pj: i.pj?.code ?? null,
            updatedAt: i.updatedAt.toISOString(),
          })),
        }))}
      />
    </>
  );
}
