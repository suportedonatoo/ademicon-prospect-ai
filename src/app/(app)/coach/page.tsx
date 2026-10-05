import { requireCtx } from '@/modules/auth/session';
import { resolveFilters } from '@/modules/analytics/filters';
import { salesCoach } from '@/modules/coach/coach.service';
import { Badge, Card, Empty, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { minutesToHuman, num } from '@/lib/format';

export const metadata = { title: 'AI Sales Coach' };

export default async function CoachPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('consultant.read');
  const sp = await searchParams;
  const f = resolveFilters(sp);
  const { rows, note } = await salesCoach(ctx, f.from, f.to);
  return (
    <>
      <PageHeader crumb="Inteligência" title="AI Sales Coach" subtitle="Tempo de resposta, follow-ups, conversas abandonadas, objeções, etapas de perda e oportunidades sem atividade — com sugestões de treinamento." />
      <Notice tone="blue">{note}</Notice>
      <FilterBar
        className="my-4"
        fields={[{ name: 'period', label: 'Período', options: [{ value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '90d', label: '90 dias' }] }]}
      />
      {rows.length === 0 ? (
        <Card>
          <Empty title="Sem consultores no seu escopo" />
        </Card>
      ) : (
        <>
          <Card pad={false} title="Indicadores por consultor" subtitle="Ordem alfabética — sem ranking">
            <Table>
              <thead>
                <tr>
                  <Th>Consultor</Th>
                  <Th className="text-right">Leads recebidos</Th>
                  <Th className="text-right">1ª resposta (média)</Th>
                  <Th className="text-right">Conversas abandonadas</Th>
                  <Th className="text-right">Follow-ups feitos</Th>
                  <Th className="text-right">Vencidos</Th>
                  <Th className="text-right">Oport. sem atividade</Th>
                  <Th className="text-right">Ganhas / perdidas</Th>
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => a.name.localeCompare(b.name)).map((r) => (
                  <tr key={r.id}>
                    <Td>
                      {r.name} <span className="text-xs text-faint">{r.pj}</span>
                    </Td>
                    <Td className="text-right tabular">{num(r.leads)}</Td>
                    <Td className="text-right tabular">{minutesToHuman(r.firstResponseMin)}</Td>
                    <Td className="text-right tabular">{num(r.abandoned)}</Td>
                    <Td className="text-right tabular">{num(r.followupsDone)}</Td>
                    <Td className="text-right tabular">{num(r.followupsOverdue)}</Td>
                    <Td className="text-right tabular">
                      {r.idleOpps}/{r.openOpps}
                    </Td>
                    <Td className="text-right tabular">
                      {r.won} / {r.lost}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <h2 className="text-[15px] font-semibold mt-6 mb-3">Sugestões de desenvolvimento</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows
              .filter((r) => r.suggestions.length)
              .map((r) => (
                <Card key={r.id} title={r.name} subtitle={`PJ ${r.pj}`}>
                  <ul className="space-y-2">
                    {r.suggestions.map((s) => (
                      <li key={s.area} className="text-sm">
                        <Badge tone="blue">{s.area}</Badge> <span className="text-ink-2">{s.text}</span>
                        <span className="block text-xs text-muted mt-0.5">Evidência: {s.evidence}</span>
                      </li>
                    ))}
                  </ul>
                  {r.topObjections.length > 0 && <p className="text-xs text-muted mt-3">Objeções frequentes: {r.topObjections.map((o) => `${o.label} (${o.count})`).join(' · ')}</p>}
                </Card>
              ))}
          </div>
        </>
      )}
    </>
  );
}
