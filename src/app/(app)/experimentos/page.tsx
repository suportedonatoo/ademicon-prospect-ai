import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { db } from '@/lib/db';
import { EXPERIMENT_TARGETS, PRIMARY_METRICS, listExperiments } from '@/modules/experiments/experiment.service';
import { Badge, Card, Empty, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { NewExperiment } from './new-experiment';
import { date, num } from '@/lib/format';

export const metadata = { title: 'Experimentos A/B' };

const STATUS = { DRAFT: ['Rascunho', 'amber'], RUNNING: ['Rodando', 'green'], PAUSED: ['Pausado', 'gray'], COMPLETED: ['Concluído', 'blue'] } as const;

export default async function ExperimentsPage() {
  const ctx = await requireCtx('campaign.read');
  const [items, landings, campaigns] = await Promise.all([
    listExperiments(ctx),
    db.landingPage.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.campaign.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return (
    <>
      <PageHeader crumb="Aquisição" title="Experimentos A/B" subtitle="Teste landing pages, headlines, CTAs, formulários, mensagens, campanhas e playbooks — medindo o resultado de negócio (qualificados, oportunidades, conversões), não só o CPL." actions={can(ctx, 'campaign.create') && <NewExperiment landings={landings} campaigns={campaigns} />} />
      <Notice tone="blue">Em landing pages, cada visitante recebe sempre a mesma variante (cookie anônimo, sem dado pessoal). Variantes podem trocar headline, subtítulo e texto do botão. O lead herda a variante e as oportunidades geradas contam para ela.</Notice>
      <Card className="mt-4" pad={false}>
        {items.length === 0 ? (
          <Empty title="Nenhum experimento" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Experimento</Th>
                <Th>Alvo</Th>
                <Th>Métrica principal</Th>
                <Th>Variantes</Th>
                <Th className="text-right">Exposições</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const [label, tone] = STATUS[e.status as keyof typeof STATUS] ?? [e.status, 'gray'];
                return (
                  <tr key={e.id}>
                    <Td>
                      <Link href={`/experimentos/${e.id}`} className="font-medium hover:underline">
                        {e.name}
                      </Link>
                      <span className="block text-xs text-faint">criado {date(e.createdAt)}</span>
                    </Td>
                    <Td className="text-xs">{EXPERIMENT_TARGETS[e.target as keyof typeof EXPERIMENT_TARGETS] ?? e.target}</Td>
                    <Td className="text-xs">{PRIMARY_METRICS[e.primaryMetric as keyof typeof PRIMARY_METRICS] ?? e.primaryMetric}</Td>
                    <Td className="text-xs">{e.variants.map((v) => `${v.key} (${v.weight}%)`).join(' · ')}</Td>
                    <Td className="text-right tabular">{num(e.variants.reduce((s, v) => s + v.exposures, 0))}</Td>
                    <Td>
                      <Badge tone={tone}>{label}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
