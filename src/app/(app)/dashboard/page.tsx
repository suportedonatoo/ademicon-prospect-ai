import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { resolveFilters } from '@/modules/analytics/filters';
import { aiObservability, executiveDashboard, managementBreakdown, opportunitiesByStage, performance, marketingAnalytics } from '@/modules/analytics/analytics.service';
import { filterOptions, globalFilterFields } from '@/modules/analytics/options';
import { getOrgSettings } from '@/modules/organizations/settings';
import { productLabel, sourceLabel } from '@/modules/leads/catalog';
import { Card, PageHeader, Stat, Badge } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { BarList, Columns, Funnel } from '@/components/charts';
import { brlShort, minutesToHuman, num, pct } from '@/lib/format';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('analytics.read');
  const sp = await searchParams;
  const f = resolveFilters(sp);
  const [d, perf, stages, options, settings, bySource] = await Promise.all([
    executiveDashboard(ctx, f),
    performance(ctx, f),
    opportunitiesByStage(ctx, f),
    filterOptions(ctx),
    getOrgSettings(ctx.orgId),
    managementBreakdown(ctx, f, 'source'),
  ]);
  const ai = can(ctx, 'ai.read') ? await aiObservability(ctx, f) : null;
  const mkt = can(ctx, 'campaign.read') ? await marketingAnalytics(ctx, f) : null;
  const k = d.kpis;
  const demo = ((settings as unknown as { demoScenarios?: { n: number; title: string; leadId: string; description: string }[] }).demoScenarios ?? []).filter(Boolean);

  const days = d.series.map((s) => ({ label: new Date(s.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }), values: [s.leads, s.qualified] }));

  return (
    <>
      <PageHeader
        title={settings.appName}
        crumb="Dashboard executivo"
        subtitle="Encontrar oportunidades → capturar → enriquecer → qualificar → conversar → distribuir → oportunidade → acompanhar → medir."
      />
      <FilterBar className="mb-5" fields={globalFilterFields(options)} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        <Stat tone="hero" label="Leads no período" value={num(k.leads)} hint={`${num(k.leadsToday)} hoje`} href="/leads" />
        <Stat label="Qualificados" value={num(k.qualified)} hint={`Taxa de qualificação ${pct(k.qualificationRate)}`} href="/leads?sort=score" />
        <Stat label="Oportunidades" value={num(k.opportunities)} hint={`${num(k.proposals)} propostas`} href="/pipeline" />
        <Stat label="Conversões" value={num(k.conversions)} hint={`Taxa de conversão ${pct(k.conversionRate)}`} />
        <Stat label="Tempo médio de atendimento" value={minutesToHuman(k.avgResponseMinutes)} hint="Captura → primeira resposta" />
      </div>

      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-4 mb-4">
        <Card title="Evolução de leads" subtitle="Leads captados por dia">
          <Columns items={days.map((x) => ({ label: x.label, value: x.values[0] }))} tipSuffix=" hoje" />
        </Card>
        <Card title="Funil de prospecção" subtitle="Leads → qualificados → oportunidades → propostas → conversões">
          <Funnel steps={d.funnel} />
        </Card>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        <Card title="Leads por origem">
          <BarList items={d.bySource.map((s) => ({ label: sourceLabel(s.key), value: s.value }))} />
        </Card>
        <Card title="Leads por produto">
          <BarList items={d.byProduct.map((s) => ({ label: s.key === 'NAO_INFORMADO' ? 'Não informado' : productLabel(s.key), value: s.value }))} />
        </Card>
        <Card title="Oportunidades por etapa" actions={<Link className="text-xs text-brand-600 hover:underline" href="/pipeline">Pipeline →</Link>}>
          <BarList items={stages.map((s) => ({ label: s.label, value: s.value, sub: s.total ? brlShort(s.total) : undefined }))} />
        </Card>
      </div>

      {ai && (
        <Card title="Inteligência Artificial" subtitle="Maestro orquestra os agentes; o Supervisor revisa cada resposta antes do envio." className="mb-4" actions={<Link className="text-xs text-brand-600 hover:underline" href="/ia/maestro">Observabilidade →</Link>}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { name: 'Maestro', desc: 'Contexto, memória, KB, agente, handoff', stat: `${num(ai.executions)} execuções`, sub: `Latência média ${ai.avgLatencyMs ? Math.round(ai.avgLatencyMs) + ' ms' : '—'}` },
              { name: 'Prospect Agent', desc: 'Relacionamento e necessidade', stat: `${num(ai.byAgent.find((a) => a.key === 'PROSPECT')?.value ?? 0)} respostas`, sub: `${num(ai.conversations)} conversas` },
              { name: 'Qualification Agent', desc: 'Contexto, objeções, handoff', stat: `${num(ai.byAgent.find((a) => a.key === 'QUALIFICATION')?.value ?? 0)} respostas`, sub: `${num(ai.handoffs)} handoffs (${pct(ai.handoffRate)})` },
              { name: 'AI Supervisor', desc: 'Política · conhecimento · risco', stat: `${num((ai.supervisor.blocked ?? 0) + (ai.supervisor.rewritten ?? 0))} intervenções`, sub: `${num(ai.openGaps)} perguntas sem resposta` },
            ].map((a) => (
              <div key={a.name} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <b className="text-sm">{a.name}</b>
                  <Badge tone="green" dot>
                    Ativo
                  </Badge>
                </div>
                <div className="text-xs text-muted mt-0.5">{a.desc}</div>
                <div className="text-lg font-semibold mt-3 tabular">{a.stat}</div>
                <div className="text-xs text-muted">{a.sub}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <Card title="Performance por PJ" subtitle="Conversões no período">
          <BarList items={perf.byPj.slice(0, 10).map((p) => ({ label: p.label, value: p.conversions, sub: `${p.leads} leads` }))} empty="Sem conversões no período." />
        </Card>
        <Card title="Performance por consultor" subtitle="Top 10 em conversões">
          <BarList items={perf.byConsultant.slice(0, 10).map((c) => ({ label: c.label, value: c.conversions, sub: c.pj }))} empty="Sem conversões no período." />
        </Card>
        <Card title="Campanhas" subtitle="Leads gerados">
          {mkt ? <BarList items={mkt.rows.filter((r) => r.leads).sort((a, b) => b.leads - a.leads).slice(0, 8).map((r) => ({ label: r.name, value: r.leads, sub: r.cpl ? `CPL ${brlShort(r.cpl)}` : undefined }))} /> : <p className="text-sm text-muted">Sem permissão.</p>}
        </Card>
        <Card title="Origem" subtitle="Conversões por origem">
          <BarList items={bySource.map((s) => ({ label: sourceLabel(s.key), value: s.conversions, sub: `${s.qualified} qualificados` }))} empty="Sem conversões no período." />
        </Card>
      </div>

      {demo.length > 0 && (
        <Card title="Cenários de demonstração" subtitle="Gerados pelos motores reais (Lead Engine, Maestro, Router) durante o seed">
          <ol className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {demo.map((s) => (
              <li key={s.n}>
                <Link href={`/leads/${s.leadId}`} className="block rounded-xl border border-line p-3.5 hover:border-brand-200 hover:bg-brand-50/40 h-full">
                  <div className="text-xs text-muted">Cenário {s.n}</div>
                  <b className="text-sm text-ink">{s.title}</b>
                  <p className="text-xs text-muted mt-1">{s.description}</p>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}
