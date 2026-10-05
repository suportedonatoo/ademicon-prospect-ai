import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { resolveFilters } from '@/modules/analytics/filters';
import { filterOptions, globalFilterFields } from '@/modules/analytics/options';
import { lossIntelligence } from '@/modules/revenue/revenue.service';
import { productLabel } from '@/modules/leads/catalog';
import { Card, Empty, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { BarList } from '@/components/charts';
import { Kpi } from '@/components/v2-ui';
import { brl, brlShort, date, num, pct } from '@/lib/format';

export const metadata = { title: 'Loss Intelligence' };

export default async function LossPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('analytics.read');
  const sp = await searchParams;
  const f = resolveFilters({ period: '90d', ...sp });
  const [r, options] = await Promise.all([lossIntelligence(ctx, f), filterOptions(ctx)]);
  return (
    <>
      <PageHeader crumb="Inteligência" title="Loss Intelligence" subtitle="Perdas → classificação → agrupamento → padrão → ação. Cada perda exige categoria e motivo ao mover a oportunidade para Perdido." />
      <FilterBar className="mb-5" fields={globalFilterFields(options)} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Perdas no período" value={num(r.total)} />
        <Kpi label="Volume perdido (carta)" value={brlShort(r.lostValue)} />
        <Kpi label="Principal causa" value={r.byCategory[0]?.label ?? '—'} hint={r.byCategory[0] ? `${pct(r.byCategory[0].share)} das perdas` : ''} />
        <Kpi label="Concorrentes citados" value={num(r.competitors.length)} hint={r.competitors[0]?.key ?? ''} />
      </div>
      {r.patterns.length > 0 && (
        <div className="space-y-2 mb-4">
          {r.patterns.map((p) => (
            <Notice key={p.id} tone="amber" title={p.title}>
              {p.description} <span className="text-xs text-muted">(confiança {Math.round(p.confidence * 100)}% · regra)</span>
            </Notice>
          ))}
        </div>
      )}
      {r.total === 0 ? (
        <Card>
          <Empty title="Nenhuma perda registrada no período" />
        </Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <Card title="Por categoria">
              <BarList items={r.byCategory.map((c) => ({ label: c.label, value: c.count, sub: brlShort(c.value) }))} />
            </Card>
            <Card title="Etapa em que perdeu">
              <BarList items={r.byStage.map((s) => ({ label: s.key, value: s.count }))} />
            </Card>
            <Card title="Por produto">
              <BarList items={r.byProduct.map((s) => ({ label: productLabel(s.key), value: s.count }))} />
            </Card>
            <Card title="Por consultor" subtitle="Contexto para treinamento — não é ranking">
              <BarList items={r.byConsultant.map((s) => ({ label: s.key, value: s.count }))} />
            </Card>
            <Card title="Concorrentes">
              <BarList items={r.competitors.map((s) => ({ label: s.key, value: s.count }))} empty="Nenhum concorrente informado." />
            </Card>
          </div>
          <Card title="Perdas recentes" pad={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Lead</Th>
                  <Th>Categoria</Th>
                  <Th>Motivo</Th>
                  <Th>Etapa</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {r.recent.map((l) => (
                  <tr key={l.id}>
                    <Td className="text-xs text-muted">{date(l.createdAt)}</Td>
                    <Td>
                      <Link href={`/oportunidades/${l.opportunityId}`} className="hover:underline">
                        {l.leadName}
                      </Link>
                    </Td>
                    <Td>{l.categoryLabel}</Td>
                    <Td className="text-xs">
                      {l.reason ?? '—'}
                      {l.competitor && <span className="text-muted"> · {l.competitor}</span>}
                    </Td>
                    <Td className="text-xs">{l.stageKey ?? '—'}</Td>
                    <Td className="text-right tabular">{brl(l.value)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
