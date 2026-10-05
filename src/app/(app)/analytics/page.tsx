import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { resolveFilters } from '@/modules/analytics/filters';
import { commercialAnalytics, managementBreakdown, marketingAnalytics, performance } from '@/modules/analytics/analytics.service';
import { filterOptions, globalFilterFields } from '@/modules/analytics/options';
import { productLabel, sourceLabel } from '@/modules/leads/catalog';
import { Card, PageHeader, Stat, Table, Td, Th, cx } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { BarList, Funnel } from '@/components/charts';
import { brl, brlShort, num, pct } from '@/lib/format';

export const metadata = { title: 'Analytics' };

const TABS = [
  { key: 'marketing', label: 'Marketing' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'gestao', label: 'Gestão' },
];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('analytics.read');
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab : 'marketing';
  const f = resolveFilters(sp);
  const options = await filterOptions(ctx);
  const qs = (k: string) => {
    const p = new URLSearchParams(sp);
    p.set('tab', k);
    return `/analytics?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="Analytics" crumb="Inteligência" subtitle="Três níveis: marketing (investimento → leads), comercial (lead → fechamento) e gestão (PJ, consultor, produto, região, campanha, origem)." />
      <div className="inline-flex flex-wrap gap-0.5 mb-5 rounded-2xl bg-slate-100 p-1 max-w-full">
        {TABS.map((t) => (
          <Link key={t.key} href={qs(t.key)} className={cx('px-4 py-2 text-sm rounded-xl whitespace-nowrap', tab === t.key ? 'bg-white text-ink font-medium shadow-sm' : 'text-muted hover:text-ink')}>
            {t.label}
          </Link>
        ))}
      </div>
      <FilterBar className="mb-5" fields={globalFilterFields(options)} />
      {tab === 'marketing' && <Marketing ctx={ctx} f={f} />}
      {tab === 'comercial' && <Commercial ctx={ctx} f={f} />}
      {tab === 'gestao' && <Management ctx={ctx} f={f} />}
    </>
  );
}

type P = { ctx: Awaited<ReturnType<typeof requireCtx>>; f: ReturnType<typeof resolveFilters> };

async function Marketing({ ctx, f }: P) {
  const m = await marketingAnalytics(ctx, f);
  const t = m.totals;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-3 mb-4">
        <Stat label="Investimento" value={brlShort(t.spend)} />
        <Stat label="Impressões" value={num(t.impressions)} />
        <Stat label="Cliques" value={num(t.clicks)} />
        <Stat label="CTR" value={pct(t.ctr, 2)} />
        <Stat label="CPC" value={t.cpc != null ? brl(t.cpc, 2) : '—'} />
        <Stat label="Leads" value={num(t.leads)} />
        <Stat label="CPL" value={t.cpl != null ? brl(t.cpl, 2) : '—'} />
        <Stat label="Qualificados" value={num(t.qualified)} />
        <Stat label="Custo / qualificado" value={t.cpql != null ? brl(t.cpql, 2) : '—'} />
      </div>
      <Card title="Por campanha" pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Campanha</Th>
              <Th className="text-right">Investimento</Th>
              <Th className="text-right">Impressões</Th>
              <Th className="text-right">Cliques</Th>
              <Th className="text-right">CTR</Th>
              <Th className="text-right">CPC</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">CPL</Th>
              <Th className="text-right">Qualificados</Th>
              <Th className="text-right">Custo/qualif.</Th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link className="font-medium hover:text-brand-600" href={`/campanhas/${r.id}`}>
                    {r.name}
                  </Link>
                </Td>
                <Td className="text-right tabular">{brl(r.spend)}</Td>
                <Td className="text-right tabular">{num(r.impressions)}</Td>
                <Td className="text-right tabular">{num(r.clicks)}</Td>
                <Td className="text-right tabular">{pct(r.ctr, 2)}</Td>
                <Td className="text-right tabular">{r.cpc != null ? brl(r.cpc, 2) : '—'}</Td>
                <Td className="text-right tabular">{num(r.leads)}</Td>
                <Td className="text-right tabular">{r.cpl != null ? brl(r.cpl, 2) : '—'}</Td>
                <Td className="text-right tabular">{num(r.qualified)}</Td>
                <Td className="text-right tabular">{r.cpql != null ? brl(r.cpql, 2) : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

async function Commercial({ ctx, f }: P) {
  const steps = await commercialAnalytics(ctx, f);
  return (
    <div className="grid xl:grid-cols-[1.3fr_1fr] gap-4">
      <Card title="Funil comercial" subtitle="Leads → contato → respostas → simulações → oportunidades → propostas → fechamentos">
        <Funnel steps={steps} />
      </Card>
      <Card title="Taxas de passagem">
        <ul className="space-y-2 text-sm">
          {steps.slice(1).map((s, i) => (
            <li key={s.label} className="flex justify-between">
              <span className="text-ink-2">
                {steps[i].label} → {s.label}
              </span>
              <b className="tabular">{pct(steps[i].value ? (s.value / steps[i].value) * 100 : 0)}</b>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

async function Management({ ctx, f }: P) {
  const [perf, region, product, source, campaign] = await Promise.all([
    performance(ctx, f),
    managementBreakdown(ctx, f, 'region'),
    managementBreakdown(ctx, f, 'product'),
    managementBreakdown(ctx, f, 'source'),
    managementBreakdown(ctx, f, 'campaignId'),
  ]);
  const Breakdown = ({ title, rows, label }: { title: string; rows: { key: string | null; leads: number; qualified: number; opportunities: number; conversions: number }[]; label: (k: string | null) => string }) => (
    <Card title={title} pad={false}>
      <Table>
        <thead>
          <tr>
            <Th>{title.split(' ')[1] ?? ''}</Th>
            <Th className="text-right">Leads</Th>
            <Th className="text-right">Qualif.</Th>
            <Th className="text-right">Oport.</Th>
            <Th className="text-right">Conv.</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key ?? 'null'}>
              <Td className="truncate max-w-48">{label(r.key)}</Td>
              <Td className="text-right tabular">{num(r.leads)}</Td>
              <Td className="text-right tabular">{num(r.qualified)}</Td>
              <Td className="text-right tabular">{num(r.opportunities)}</Td>
              <Td className="text-right tabular">{num(r.conversions)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
  return (
    <>
      <div className="grid xl:grid-cols-2 gap-4 mb-4">
        <Card title="Performance por PJ" pad={false}>
          <Table>
            <thead>
              <tr>
                <Th>PJ</Th>
                <Th className="text-right">Leads</Th>
                <Th className="text-right">Qualif.</Th>
                <Th className="text-right">Oport.</Th>
                <Th className="text-right">Conv.</Th>
                <Th className="text-right">Taxa</Th>
                <Th className="text-right">Volume</Th>
              </tr>
            </thead>
            <tbody>
              {perf.byPj.map((p) => (
                <tr key={p.id}>
                  <Td>{p.label}</Td>
                  <Td className="text-right tabular">{num(p.leads)}</Td>
                  <Td className="text-right tabular">{num(p.qualified)}</Td>
                  <Td className="text-right tabular">{num(p.opportunities)}</Td>
                  <Td className="text-right tabular">{num(p.conversions)}</Td>
                  <Td className="text-right tabular">{pct(p.conversionRate)}</Td>
                  <Td className="text-right tabular">{brlShort(p.value)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Performance por consultor" subtitle="Top 15 por conversões">
          <BarList items={perf.byConsultant.slice(0, 15).map((c) => ({ label: `${c.label} · ${c.pj}`, value: c.conversions, sub: `${c.leads} leads · ${pct(c.conversionRate)}` }))} empty="Sem conversões no período." />
        </Card>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Breakdown title="Por região" rows={region} label={(k) => k ?? 'Não identificada'} />
        <Breakdown title="Por produto" rows={product} label={(k) => (k ? productLabel(k) : 'Não informado')} />
        <Breakdown title="Por origem" rows={source} label={(k) => sourceLabel(k)} />
        <Breakdown title="Por campanha" rows={campaign} label={(k) => k ?? 'Sem campanha'} />
      </div>
    </>
  );
}
