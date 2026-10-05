import { requireCtx } from '@/modules/auth/session';
import { consultantCapacity } from '@/modules/operations/operations.service';
import { productLabel } from '@/modules/leads/catalog';
import { Card, Notice, PageHeader, Table, Td, Th, cx } from '@/components/ui';
import { Kpi, StatusBadge2 } from '@/components/v2-ui';

export const metadata = { title: 'Capacity Intelligence' };

export default async function CapacityPage() {
  const ctx = await requireCtx('consultant.read');
  const { rows, summary } = await consultantCapacity(ctx);
  return (
    <>
      <PageHeader crumb="Distribuição" title="Capacity Intelligence" subtitle="Carga de leads e oportunidades de cada consultor frente à capacidade configurada, disponibilidade, horário e fila de conversas." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Capacidade normal" value={summary.NORMAL} tone="green" />
        <Kpi label="Capacidade alta" value={summary.ALTA} tone={summary.ALTA ? 'amber' : 'default'} />
        <Kpi label="Capacidade crítica" value={summary.CRITICA} tone={summary.CRITICA ? 'red' : 'default'} />
        <Kpi label="Indisponíveis" value={summary.INDISPONIVEL} />
      </div>
      <Notice tone="blue">O roteamento não distribui para consultores com capacidade crítica ou indisponíveis. Ajuste limites e horários em Distribuição → Consultores.</Notice>
      <Card className="mt-4" pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Consultor</Th>
              <Th>Estado</Th>
              <Th className="text-right">Leads ativos</Th>
              <Th className="text-right">Oportunidades</Th>
              <Th className="text-right">Conversas humanas</Th>
              <Th>Carga</Th>
              <Th>Horário</Th>
              <Th>Especialidades</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <b className="font-medium">{r.name}</b> <span className="text-xs text-faint">{r.pj}</span>
                </Td>
                <Td>
                  <StatusBadge2 s={r.state} />
                </Td>
                <Td className="text-right tabular">
                  {r.activeLeads} / {r.capacity.leads}
                </Td>
                <Td className="text-right tabular">
                  {r.activeOpportunities} / {r.capacity.opportunities}
                </Td>
                <Td className="text-right tabular">{r.humanConversations}</Td>
                <Td className="min-w-[140px]">
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden" role="meter" aria-valuenow={r.load} aria-valuemin={0} aria-valuemax={100} aria-label={`Carga de ${r.name}`}>
                      <span className={cx('block h-full', r.load >= 100 ? 'bg-bad' : r.load >= 80 ? 'bg-warn' : 'bg-ok')} style={{ width: `${Math.min(100, r.load)}%` }} />
                    </span>
                    <span className="tabular text-xs w-10 text-right">{r.load}%</span>
                  </span>
                </Td>
                <Td className="text-xs">{r.withinWorkingHours ? 'No expediente' : <span className="text-muted">Fora do expediente</span>}</Td>
                <Td className="text-xs text-muted">{r.specialties.map((s) => productLabel(s)).join(', ') || 'Todas'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
