import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { resolveFilters } from '@/modules/analytics/filters';
import { roiReport } from '@/modules/analytics/analytics.service';
import { CAMPAIGN_SOURCES } from '@/modules/campaigns/campaign.service';
import { Card, Notice, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { brl, brlShort, num } from '@/lib/format';

export const metadata = { title: 'ROI' };

export default async function RoiPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('roi.read');
  const f = resolveFilters(await searchParams);
  const r = await roiReport(ctx, f);
  const t = r.totals;
  const m = (v: number | null) => (v != null ? brl(v, 2) : '—');
  return (
    <>
      <PageHeader title="ROI" crumb="Inteligência" subtitle="CPL = custo ÷ leads · CPQL = custo ÷ qualificados · CPO = custo ÷ oportunidades · CAC = custo ÷ conversões" />
      <FilterBar className="mb-4" fields={[{ name: 'period', label: 'Últimos 30 dias', options: [{ value: '7d', label: 'Últimos 7 dias' }, { value: '90d', label: 'Últimos 90 dias' }, { value: '365d', label: 'Últimos 12 meses' }] }]} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat tone="hero" label="Custo total" value={brlShort(t.cost)} />
        <Stat label="CPL" value={m(t.cpl)} hint={`${num(t.leads)} leads`} />
        <Stat label="CPQL" value={m(t.cpql)} hint={`${num(t.qualified)} qualificados`} />
        <Stat label="CPO" value={m(t.cpo)} hint={`${num(t.opportunities)} oportunidades`} />
        <Stat label="CAC" value={m(t.cac)} hint={`${num(t.conversions)} conversões`} />
      </div>
      <Notice tone="blue">
        Custo = gasto sincronizado do provider no período; campanhas sem métricas (orgânico, offline) usam o <b>orçamento configurado</b> na campanha — edite em Campanhas para ajustar. &quot;Volume convertido&quot; é o valor das cartas/créditos fechados, não receita da operação.
      </Notice>
      <Card pad={false} className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Campanha</Th>
              <Th className="text-right">Custo</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">CPL</Th>
              <Th className="text-right">Qualif.</Th>
              <Th className="text-right">CPQL</Th>
              <Th className="text-right">Oport.</Th>
              <Th className="text-right">CPO</Th>
              <Th className="text-right">Conv.</Th>
              <Th className="text-right">CAC</Th>
              <Th className="text-right">Volume convertido</Th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link href={`/campanhas/${c.id}`} className="font-medium hover:text-brand-600">
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {CAMPAIGN_SOURCES[c.source as keyof typeof CAMPAIGN_SOURCES]} · {c.costBasis}
                  </div>
                </Td>
                <Td className="text-right tabular">{brl(c.cost)}</Td>
                <Td className="text-right tabular">{num(c.leads)}</Td>
                <Td className="text-right tabular">{m(c.cpl)}</Td>
                <Td className="text-right tabular">{num(c.qualified)}</Td>
                <Td className="text-right tabular">{m(c.cpql)}</Td>
                <Td className="text-right tabular">{num(c.opportunities)}</Td>
                <Td className="text-right tabular">{m(c.cpo)}</Td>
                <Td className="text-right tabular">{num(c.conversions)}</Td>
                <Td className="text-right tabular">{m(c.cac)}</Td>
                <Td className="text-right tabular">{brlShort(c.convertedVolume)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
