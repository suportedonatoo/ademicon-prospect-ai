import { notFound } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { isAppError } from '@/lib/errors';
import { EXPERIMENT_TARGETS, PRIMARY_METRICS, experimentResults } from '@/modules/experiments/experiment.service';
import { Badge, Card, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { brl, num } from '@/lib/format';

export const metadata = { title: 'Experimento' };

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('campaign.read');
  const { id } = await params;
  let r;
  try {
    r = await experimentResults(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  }
  const e = r.experiment;
  const canEdit = can(ctx, 'campaign.update');
  return (
    <>
      <PageHeader
        crumb="Experimentos A/B"
        title={e.name}
        subtitle={`${EXPERIMENT_TARGETS[e.target as keyof typeof EXPERIMENT_TARGETS] ?? e.target} · métrica principal: ${PRIMARY_METRICS[e.primaryMetric as keyof typeof PRIMARY_METRICS] ?? e.primaryMetric}${e.hypothesis ? ` · hipótese: ${e.hypothesis}` : ''}`}
        actions={
          canEdit && (
            <>
              {e.status !== 'RUNNING' && e.status !== 'COMPLETED' && (
                <ActionButton path={`/experiments/${id}`} body={{ status: 'RUNNING' }} variant="primary" success="Experimento iniciado.">
                  Iniciar
                </ActionButton>
              )}
              {e.status === 'RUNNING' && (
                <ActionButton path={`/experiments/${id}`} body={{ status: 'PAUSED' }} success="Experimento pausado.">
                  Pausar
                </ActionButton>
              )}
              {e.status !== 'COMPLETED' && (
                <ActionButton path={`/experiments/${id}`} body={{ status: 'COMPLETED' }} variant="ghost" confirm="Concluir o experimento? As variantes deixam de ser sorteadas.">
                  Concluir
                </ActionButton>
              )}
            </>
          )
        }
      />
      <Notice tone={r.winner ? 'green' : 'blue'}>{r.note}</Notice>
      <Card className="mt-4" pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Variante</Th>
              <Th className="text-right">Peso</Th>
              <Th className="text-right">Exposições</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Qualificados</Th>
              <Th className="text-right">Oportunidades</Th>
              <Th className="text-right">Conversões</Th>
              <Th className="text-right">Receita</Th>
              <Th className="text-right">Taxa principal (IC 95%)</Th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((v) => (
              <tr key={v.id}>
                <Td>
                  <b>{v.key}</b> · {v.name} {r.winner === v.key && <Badge tone="green">vencedora</Badge>}
                </Td>
                <Td className="text-right tabular">{v.weight}</Td>
                <Td className="text-right tabular">{num(v.exposures)}</Td>
                <Td className="text-right tabular">{num(v.leads)}</Td>
                <Td className="text-right tabular">{num(v.qualified)}</Td>
                <Td className="text-right tabular">{num(v.opportunities)}</Td>
                <Td className="text-right tabular">{num(v.conversions)}</Td>
                <Td className="text-right tabular">{v.revenue == null ? '—' : brl(v.revenue)}</Td>
                <Td className="text-right tabular">{v.primaryRate == null ? '—' : `${String(v.primaryRate).replace('.', ',')}% [${v.ci95![0]}–${v.ci95![1]}]`}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
