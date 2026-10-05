import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { resolveFilters } from '@/modules/analytics/filters';
import { attributionReport, multiTouchAttribution, recentJourneys } from '@/modules/attribution/attribution.service';
import { isAttributionModel, type AttributionModel } from '@/modules/attribution/models';
import { sourceLabel, statusLabel } from '@/modules/leads/catalog';
import { Badge, Card, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { brl, dateTime, num, pct } from '@/lib/format';

export const metadata = { title: 'Attribution' };

const EVENT_LABEL: Record<string, string> = {
  PAGE_VIEW: 'Visita',
  SIMULATION_STARTED: 'Simulação iniciada',
  SIMULATION_COMPLETED: 'Simulação',
  LEAD_CREATED: 'Lead',
  QUALIFIED: 'Qualificado',
  ASSIGNED: 'Consultor',
  OPPORTUNITY_CREATED: 'Oportunidade',
  CONVERSION: 'Conversão',
};

export default async function AttributionPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('attribution.read');
  const sp = await searchParams;
  const f = resolveFilters(sp);
  const model: AttributionModel = isAttributionModel(sp.model) ? sp.model : 'LINEAR';
  const [report, journeys, multi] = await Promise.all([attributionReport(ctx, f), recentJourneys(ctx, 15), multiTouchAttribution(ctx, f)]);
  const ev = report.events;
  return (
    <>
      <PageHeader title="Attribution" crumb="Aquisição" subtitle="Source → Medium → Campaign → Content → Term → Landing → Lead → Consultor → Oportunidade → Conversão" />
      <FilterBar className="mb-4" fields={[{ name: 'period', label: 'Últimos 30 dias', options: [{ value: '7d', label: 'Últimos 7 dias' }, { value: '90d', label: 'Últimos 90 dias' }, { value: '365d', label: 'Últimos 12 meses' }] }]} />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
        <Stat label="Sessões (landing)" value={num(report.sessions)} />
        <Stat label="Visitas" value={num(ev.PAGE_VIEW ?? 0)} />
        <Stat label="Simulações" value={num(ev.SIMULATION_COMPLETED ?? 0)} />
        <Stat label="Leads" value={num(ev.LEAD_CREATED ?? 0)} />
        <Stat label="Oportunidades" value={num(ev.OPPORTUNITY_CREATED ?? 0)} />
        <Stat label="Conversões" value={num(ev.CONVERSION ?? 0)} />
      </div>
      <Card title="Funil por origem" subtitle="Da captação à conversão" pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Origem</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Qualificados</Th>
              <Th className="text-right">Oportunidades</Th>
              <Th className="text-right">Conversões</Th>
              <Th className="text-right">Lead → conversão</Th>
              <Th className="text-right">Volume convertido</Th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.source}>
                <Td>
                  <b className="font-medium">{sourceLabel(r.source)}</b>
                </Td>
                <Td className="text-right tabular">{num(r.leads)}</Td>
                <Td className="text-right tabular">{num(r.qualified)}</Td>
                <Td className="text-right tabular">{num(r.opportunities)}</Td>
                <Td className="text-right tabular">{num(r.conversions)}</Td>
                <Td className="text-right tabular">{pct(r.leads ? (r.conversions / r.leads) * 100 : 0)}</Td>
                <Td className="text-right tabular">{brl(r.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card
        title="Atribuição multi-toque das conversões"
        subtitle={`${num(multi.conversions)} conversão(ões) no período${multi.withoutTouches ? ` · ${multi.withoutTouches} sem toques registrados (fora do cálculo)` : ''}. Cada conversão distribui 100% do crédito entre os canais que tocaram o lead.`}
        className="mt-4"
        pad={false}
        actions={
          <nav className="flex flex-wrap gap-1.5" aria-label="Modelo de atribuição">
            {Object.entries(multi.models).map(([k, label]) => (
              <Link key={k} href={`/attribution?model=${k}${sp.period ? `&period=${sp.period}` : ''}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${k === model ? 'bg-ink border-ink text-white' : 'border-line text-ink-2 hover:bg-slate-50'}`}>
                {label}
              </Link>
            ))}
          </nav>
        }
      >
        {multi.rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Canal</Th>
                <Th className="text-right">Conversões ({multi.models[model]})</Th>
                <Th className="text-right">Receita atribuída</Th>
                {Object.keys(multi.models).filter((m) => m !== model).map((m) => (
                  <Th key={m} className="text-right text-muted">{multi.models[m as AttributionModel].split(' (')[0]}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {multi.rows.map((r) => (
                <tr key={r.channel}>
                  <Td className="font-medium">{sourceLabel(r.channel)}</Td>
                  <Td className="text-right tabular">{r.byModel[model].conversions.toLocaleString('pt-BR')}</Td>
                  <Td className="text-right tabular font-semibold">{brl(r.byModel[model].revenue)}</Td>
                  {Object.keys(multi.models).filter((m) => m !== model).map((m) => (
                    <Td key={m} className="text-right tabular text-muted">{brl(r.byModel[m].revenue)}</Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="p-5 text-sm text-muted">Nenhuma conversão com toques registrados no período.</p>
        )}
      </Card>
      <Card title="Jornadas recentes" subtitle="Cada ponto é um AttributionEvent registrado" className="mt-4">
        <ul className="divide-y divide-line">
          {journeys.map(({ session, lead }) => (
            <li key={session.id} className="py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-56">
                {lead ? (
                  <Link href={`/leads/${lead.id}`} className="font-medium hover:text-brand-600">
                    {lead.name}
                  </Link>
                ) : (
                  '—'
                )}
                <div className="text-xs text-muted">
                  {session.source ?? 'direto'}/{session.medium ?? '—'} · {session.campaign ?? 'sem campanha'} · {dateTime(session.firstSeenAt)}
                </div>
              </div>
              <ol className="flex flex-wrap items-center gap-1 text-xs">
                {session.events.map((e, i) => (
                  <li key={e.id} className="flex items-center gap-1">
                    {i > 0 && <span className="text-faint">→</span>}
                    <Badge tone={e.type === 'CONVERSION' ? 'green' : e.type === 'OPPORTUNITY_CREATED' ? 'blue' : 'gray'}>{EVENT_LABEL[e.type] ?? e.type}</Badge>
                  </li>
                ))}
                {lead && (
                  <>
                    <span className="text-faint">→</span>
                    <Badge tone="violet">{statusLabel(lead.status)}</Badge>
                    {lead.consultant && <span className="text-muted ml-1">· {lead.consultant.name}</span>}
                  </>
                )}
              </ol>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
