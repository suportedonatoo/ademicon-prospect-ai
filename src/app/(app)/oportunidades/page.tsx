import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { listOpportunities } from '@/modules/opportunities/opportunity.service';
import { filterOptions } from '@/modules/analytics/options';
import { DEFAULT_STAGES } from '@/modules/pipelines/pipeline.service';
import { productLabel, sourceLabel } from '@/modules/leads/catalog';
import { Badge, Card, Empty, PageHeader, Table, Td, Th } from '@/components/ui';
import { FilterBar, Pagination } from '@/components/client';
import { ScoreBadge } from '@/components/badges';
import { brl, date } from '@/lib/format';

export const metadata = { title: 'Oportunidades' };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('opportunity.read');
  const sp = await searchParams;
  const [{ items, total, page, pageSize }, o] = await Promise.all([listOpportunities(ctx, sp), filterOptions(ctx)]);
  return (
    <>
      <PageHeader title="Oportunidades" crumb="CRM" subtitle="Opportunity Engine: cada oportunidade tem etapa, valor, consultor, origem, campanha e histórico próprio." />
      <FilterBar
        className="mb-4"
        fields={[
          { name: 'q', label: 'Buscar lead', type: 'search' },
          { name: 'stageKey', label: 'Etapa', options: DEFAULT_STAGES.map((s) => ({ value: s.key, label: s.name })) },
          { name: 'status', label: 'Situação', options: [{ value: 'OPEN', label: 'Em aberto' }, { value: 'WON', label: 'Ganha' }, { value: 'LOST', label: 'Perdida' }] },
          ...(ctx.scope === 'ORG' ? [{ name: 'pjId', label: 'PJ', options: o.pjId }] : []),
          ...(ctx.scope !== 'OWN' ? [{ name: 'consultantId', label: 'Consultor', options: o.consultantId }] : []),
          { name: 'product', label: 'Produto', options: o.product },
        ]}
      />
      <Card pad={false}>
        {items.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Oportunidade</Th>
                  <Th>Etapa</Th>
                  <Th className="text-right">Valor</Th>
                  <Th>Consultor</Th>
                  <Th>Origem</Th>
                  <Th>Criada</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50/70">
                    <Td>
                      <Link href={`/oportunidades/${i.id}`} className="flex items-center gap-3 group">
                        <ScoreBadge score={i.lead.score} temperature={i.lead.temperature} size="sm" />
                        <span>
                          <b className="font-medium group-hover:text-brand-600">{i.lead.name}</b>
                          <span className="block text-xs text-muted">
                            #{i.code} · {productLabel(i.product)}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={i.status === 'WON' ? 'green' : i.status === 'LOST' ? 'red' : 'blue'}>{i.stage.name}</Badge>
                    </Td>
                    <Td className="text-right tabular">{brl(i.value)}</Td>
                    <Td>
                      {i.consultant?.name ?? '—'}
                      <span className="block text-xs text-muted">{i.pj?.code}</span>
                    </Td>
                    <Td>{sourceLabel(i.source)}</Td>
                    <Td className="text-xs text-muted">{date(i.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        ) : (
          <Empty title="Nenhuma oportunidade">Crie oportunidades a partir da tela do lead.</Empty>
        )}
      </Card>
    </>
  );
}
