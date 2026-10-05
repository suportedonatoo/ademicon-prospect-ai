import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { resolveFilters } from '@/modules/analytics/filters';
import { filterOptions, globalFilterFields } from '@/modules/analytics/options';
import { aiContribution, cohortAnalysis, campaignIntelligence, commercialStages, funnelBy, productIntelligence, revenueFunnel } from '@/modules/revenue/revenue.service';
import { productLabel, sourceLabel } from '@/modules/leads/catalog';
import { Badge, Card, Notice, PageHeader, Table, Td, Th, cx } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { Kpi, DataNote } from '@/components/v2-ui';
import { brl, brlShort, num, pct } from '@/lib/format';

export const metadata = { title: 'Revenue Intelligence' };

const TABS = [
  { key: 'funil', label: 'Funil de receita' },
  { key: 'dimensao', label: 'Onde perdemos' },
  { key: 'campanhas', label: 'Campaign Intelligence' },
  { key: 'produtos', label: 'Product Intelligence' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'ia', label: 'IA × Humano' },
  { key: 'coortes', label: 'Coortes' },
];
const DIMS = [
  ['source', 'Origem'],
  ['campaignId', 'Campanha'],
  ['product', 'Produto'],
  ['region', 'Região'],
  ['pjId', 'PJ'],
  ['consultantId', 'Consultor'],
] as const;
const rate = (v: number | null | undefined) => (v == null ? '—' : pct(v));
const money = (v: number | null | undefined) => (v == null ? '—' : brl(v));

export default async function RevenuePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('analytics.read');
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab : 'funil';
  const f = resolveFilters(sp);
  const options = await filterOptions(ctx);
  const qs = (p: Record<string, string>) => `/revenue?${new URLSearchParams({ ...sp, ...p }).toString()}`;
  return (
    <>
      <PageHeader crumb="Inteligência" title="Revenue Intelligence" subtitle="Marketing → aquisição → leads → IA → consultores → oportunidades → conversão → receita. De onde vêm as oportunidades, onde se perdem e o que funciona." />
      <div className="inline-flex flex-wrap gap-0.5 mb-5 rounded-2xl bg-slate-100 p-1 max-w-full" role="tablist">
        {TABS.map((t) => (
          <Link key={t.key} role="tab" aria-selected={tab === t.key} href={qs({ tab: t.key })} className={cx('px-4 py-2 text-sm rounded-xl whitespace-nowrap', tab === t.key ? 'bg-white text-ink font-medium shadow-sm' : 'text-muted hover:text-ink')}>
            {t.label}
          </Link>
        ))}
      </div>
      <FilterBar className="mb-5" fields={globalFilterFields(options)} />
      {tab === 'funil' && <FunnelTab ctx={ctx} f={f} />}
      {tab === 'dimensao' && <ByTab ctx={ctx} f={f} dim={(DIMS.find(([k]) => k === sp.dim)?.[0] ?? 'source') as 'source'} qs={qs} />}
      {tab === 'campanhas' && <CampaignsTab ctx={ctx} f={f} />}
      {tab === 'produtos' && <ProductsTab ctx={ctx} f={f} />}
      {tab === 'comercial' && <CommercialTab ctx={ctx} f={f} />}
      {tab === 'ia' && <AiTab ctx={ctx} f={f} />}
      {tab === 'coortes' && <CohortTab ctx={ctx} f={f} />}
    </>
  );
}

type P = { ctx: Awaited<ReturnType<typeof requireCtx>>; f: ReturnType<typeof resolveFilters> };

async function FunnelTab({ ctx, f }: P) {
  const r = await revenueFunnel(ctx, f);
  const max = Math.max(1, ...r.steps.map((s) => s.value ?? 0));
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Kpi label="Investimento (mídia)" value={r.spend == null ? '—' : brlShort(r.spend)} hint="CampaignMetric no período" />
        <Kpi label="Volume ganho (carta)" value={brlShort(r.wonValue)} hint="Oportunidades ganhas" />
        <Kpi label="Receita atribuída" value={r.revenue == null ? 'Não configurada' : brlShort(r.revenue)} hint={r.roiConfigured ? '% configurado em Configurações' : 'Defina o % de receita para calcular'} />
        <Kpi label="ROI" value={r.roi == null ? '—' : pct(r.roi)} hint={r.roas == null ? 'Sem base configurada' : `ROAS ${r.roas.toLocaleString('pt-BR')}`} />
        <Kpi label="Lead → Oportunidade" value={r.avgDaysLeadToOpportunity == null ? '—' : `${r.avgDaysLeadToOpportunity.toFixed(1).replace('.', ',')} dias`} hint={r.avgDaysLeadToConversion == null ? '' : `Lead → conversão: ${r.avgDaysLeadToConversion.toFixed(1).replace('.', ',')} dias`} />
      </div>
      <Card title="Funil de receita" subtitle="Cada etapa com volume e taxa de passagem da etapa anterior">
        <ol className="space-y-2">
          {r.steps.map((s) => (
            <li key={s.key} className="grid grid-cols-[130px_1fr_90px_70px] items-center gap-3 text-sm">
              <span className="text-ink-2">{s.label}</span>
              <span className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <span className="block h-full bg-series-1 rounded-full" style={{ width: `${s.value == null ? 0 : Math.max(1, (s.value / max) * 100)}%` }} />
              </span>
              <b className="text-right tabular">{s.value == null ? '—' : num(s.value)}</b>
              <span className="text-right text-xs text-muted tabular">{s.rateFromPrevious == null ? '' : pct(s.rateFromPrevious)}</span>
            </li>
          ))}
        </ol>
        <DataNote>
          Fontes: {r.steps.map((s) => `${s.label} = ${s.source}`).join(' · ')}. {r.spend == null && 'Mídia visível apenas para perfis com escopo da organização.'}
        </DataNote>
        <DataNote>{r.roiFormula}</DataNote>
      </Card>
    </>
  );
}

async function ByTab({ ctx, f, dim, qs }: P & { dim: 'source'; qs: (p: Record<string, string>) => string }) {
  const rows = await funnelBy(ctx, f, dim);
  return (
    <Card
      title="Onde os leads são perdidos"
      subtitle="Funil por dimensão com a maior queda relativa entre etapas"
      pad={false}
      actions={
        <nav className="flex flex-wrap gap-1" aria-label="Dimensão">
          {DIMS.map(([k, l]) => (
            <Link key={k} href={qs({ tab: 'dimensao', dim: k })} className={cx('rounded-full border px-2.5 py-0.5 text-xs', dim === k ? 'bg-ink text-white border-ink' : 'border-line')}>
              {l}
            </Link>
          ))}
        </nav>
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>{DIMS.find(([k]) => k === dim)?.[1]}</Th>
            <Th className="text-right">Leads</Th>
            <Th className="text-right">Qualif.</Th>
            <Th className="text-right">Quentes</Th>
            <Th className="text-right">Oport.</Th>
            <Th className="text-right">Propostas</Th>
            <Th className="text-right">Conversões</Th>
            <Th className="text-right">Volume ganho</Th>
            <Th>Maior queda</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key ?? 'na'}>
              <Td className="font-medium">{dim === 'source' ? sourceLabel(r.label) : dim === 'product' ? productLabel(r.key) : r.label}</Td>
              <Td className="text-right tabular">{num(r.leads)}</Td>
              <Td className="text-right tabular">
                {num(r.qualified)} <small className="text-faint">{rate(r.qualificationRate)}</small>
              </Td>
              <Td className="text-right tabular">{num(r.hot)}</Td>
              <Td className="text-right tabular">
                {num(r.opportunities)} <small className="text-faint">{rate(r.opportunityRate)}</small>
              </Td>
              <Td className="text-right tabular">{num(r.proposals)}</Td>
              <Td className="text-right tabular">
                {num(r.conversions)} <small className="text-faint">{rate(r.winRate)}</small>
              </Td>
              <Td className="text-right tabular">{brlShort(r.wonValue)}</Td>
              <Td className="text-xs">{r.biggestDrop ? <Badge tone={r.biggestDrop.lossPct > 80 ? 'red' : 'amber'}>{`${r.biggestDrop.stage}: −${r.biggestDrop.lossPct}%`}</Badge> : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

async function CampaignsTab({ ctx, f }: P) {
  const { rows, roiConfigured, formula } = await campaignIntelligence(ctx, f);
  return (
    <Card title="Campaign Intelligence" subtitle="Sucesso não é só volume: qualidade do lead e da oportunidade lado a lado com o custo" pad={false}>
      {!roiConfigured && (
        <div className="px-5 pt-3">
          <Notice tone="amber">Receita/ROI/ROAS não são calculados até que o % de receita sobre o volume ganho seja configurado (Configurações). Nenhum valor é estimado sem base.</Notice>
        </div>
      )}
      <Table>
        <thead>
          <tr>
            <Th>Campanha</Th>
            <Th className="text-right">Gasto</Th>
            <Th className="text-right">Cliques</Th>
            <Th className="text-right">Leads</Th>
            <Th className="text-right">CPL</Th>
            <Th className="text-right">Qualif.</Th>
            <Th className="text-right">CPQL</Th>
            <Th className="text-right">Quentes</Th>
            <Th className="text-right">Oport.</Th>
            <Th className="text-right">CPO</Th>
            <Th className="text-right">Conv.</Th>
            <Th className="text-right">CAC</Th>
            <Th className="text-right">ROI</Th>
            <Th>Qualidade</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <Link href={`/campanhas/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <span className="block text-[11px] text-faint">
                  {sourceLabel(r.source)} · {r.dataSource === 'demo' ? <Badge tone="violet">métricas demo/mock</Badge> : r.dataSource}
                </span>
              </Td>
              <Td className="text-right tabular">{money(r.spend)}</Td>
              <Td className="text-right tabular">{r.clicks == null ? '—' : num(r.clicks)}</Td>
              <Td className="text-right tabular">{num(r.leads)}</Td>
              <Td className="text-right tabular">{money(r.cpl)}</Td>
              <Td className="text-right tabular">{num(r.qualified)}</Td>
              <Td className="text-right tabular">{money(r.cpql)}</Td>
              <Td className="text-right tabular">{num(r.hot)}</Td>
              <Td className="text-right tabular">{num(r.opportunities)}</Td>
              <Td className="text-right tabular">{money(r.cpo)}</Td>
              <Td className="text-right tabular">{num(r.conversions)}</Td>
              <Td className="text-right tabular">{money(r.cac)}</Td>
              <Td className="text-right tabular">{r.roi == null ? '—' : pct(r.roi)}</Td>
              <Td className="text-xs whitespace-nowrap">
                score médio {r.leadQuality.avgScore ?? '—'} · qualif. {rate(r.leadQuality.qualifiedRate)} · ganho {rate(r.opportunityQuality.winRate)}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="px-5 pb-4">
        <DataNote>{formula}</DataNote>
      </div>
    </Card>
  );
}

async function ProductsTab({ ctx, f }: P) {
  const rows = await productIntelligence(ctx, f);
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {rows.map((p) => (
        <Card key={p.product ?? 'na'} title={productLabel(p.product)} subtitle={`${num(p.leads)} leads · ${num(p.simulations)} simulações · intenção média ${p.avgIntent}/100`}>
          <dl className="grid grid-cols-4 gap-3 text-sm mb-3">
            <div>
              <dt className="text-xs text-muted">Qualificação</dt>
              <dd className="font-semibold tabular">{rate(p.qualificationRate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Oportunidades</dt>
              <dd className="font-semibold tabular">{num(p.opportunities)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Conversão</dt>
              <dd className="font-semibold tabular">{rate(p.conversionRate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Volume ganho</dt>
              <dd className="font-semibold tabular">{brlShort(p.wonValue)}</dd>
            </div>
          </dl>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            {[
              ['Objeções', p.topObjections],
              ['Cidades', p.topCities],
              ['PJs', p.topPjs],
              ['Campanhas', p.topCampaigns],
            ].map(([label, list]) => (
              <div key={label as string}>
                <b className="text-muted uppercase tracking-wider text-[10.5px]">{label as string}</b>
                <ul className="mt-1 space-y-0.5">
                  {(list as { label: string; count: number }[]).length === 0 && <li className="text-faint">—</li>}
                  {(list as { label: string; count: number }[]).map((x) => (
                    <li key={x.label} className="flex justify-between gap-2">
                      <span className="truncate">{x.label}</span>
                      <span className="tabular text-muted">{x.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

async function CommercialTab({ ctx, f }: P) {
  const rows = await commercialStages(ctx, f);
  return (
    <Card title="Conversão comercial por etapa" subtitle="Taxa, tempo médio e perda entre etapas">
      <Table>
        <thead>
          <tr>
            <Th>Etapa</Th>
            <Th className="text-right">Conversão</Th>
            <Th className="text-right">Tempo médio</Th>
            <Th className="text-right">Perda (drop-off)</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.from}>
              <Td>
                {r.from} → {r.to}
              </Td>
              <Td className="text-right tabular">{rate(r.rate)}</Td>
              <Td className="text-right tabular">{r.avgDays == null ? '—' : `${r.avgDays.toFixed(1).replace('.', ',')} dias`}</Td>
              <Td className="text-right tabular">{num(r.dropOff)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

async function AiTab({ ctx, f }: P) {
  const r = await aiContribution(ctx, f);
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Leads atendidos pela IA" value={num(r.withAi)} />
        <Kpi label="Qualificados só pela IA" value={num(r.aiOnlyQualified)} hint="morno/quente sem mensagem humana" />
        <Kpi label="Handoffs (IA → humano)" value={num(r.handoffs)} hint={`taxa ${rate(r.handoffRate)}`} />
        <Kpi label="Leads com intervenção humana" value={num(r.humanTouched)} />
      </div>
      <Card title="Taxa de oportunidade: com IA × sem IA">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <Kpi label="Com IA" value={rate(r.opportunityRateWithAi)} hint={`${num(r.oppsWithAi)} de ${num(r.withAi)} leads`} />
          <Kpi label="Sem IA" value={rate(r.opportunityRateWithoutAi)} hint={`${num(r.oppsWithoutAi)} de ${num(r.leadsWithoutAi)} leads`} />
        </div>
        <DataNote>{r.note}</DataNote>
      </Card>
    </>
  );
}

async function CohortTab({ ctx, f }: P) {
  const rows = await cohortAnalysis(ctx, f);
  return (
    <Card
      title="Coortes por mês de entrada"
      subtitle="O que cada grupo de leads (pelo mês em que entrou) alcançou até hoje. Coortes recentes ainda estão amadurecendo — compare meses com esse cuidado."
      pad={false}
    >
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Coorte</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Qualificados</Th>
              <Th className="text-right">Oportunidades</Th>
              <Th className="text-right">Vendas</Th>
              <Th className="text-right">Volume vendido</Th>
              <Th className="text-right">Dias até a venda</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cohort.toISOString()}>
                <Td className="font-medium">{r.cohort.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</Td>
                <Td className="text-right tabular">{num(r.leads)}</Td>
                <Td className="text-right tabular">{num(r.qualified)} <span className="text-muted">({pct(r.qualifiedRate)})</span></Td>
                <Td className="text-right tabular">{num(r.opportunities)} <span className="text-muted">({pct(r.opportunityRate)})</span></Td>
                <Td className="text-right tabular">{num(r.won)} <span className="text-muted">({pct(r.wonRate)})</span></Td>
                <Td className="text-right tabular">{brl(r.wonValue)}</Td>
                <Td className="text-right tabular">{r.avgDaysToWin == null ? '—' : r.avgDaysToWin.toLocaleString('pt-BR')}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="p-5 text-sm text-muted">Nenhum lead no período filtrado.</p>
      )}
    </Card>
  );
}
