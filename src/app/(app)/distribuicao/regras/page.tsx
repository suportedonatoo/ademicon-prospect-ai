import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listRules, ROUTING_METHODS } from '@/modules/lead-routing/rules.service';
import { listDecisions } from '@/modules/lead-routing/routing.service';
import { db } from '@/lib/db';
import { productLabel, sourceLabel } from '@/modules/leads/catalog';
import { Badge, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { dateTime } from '@/lib/format';
import { RuleForm } from './rule-form';

export const metadata = { title: 'Regras de distribuição' };

type Cond = { products?: string[]; regionIds?: string[]; cities?: string[]; ufs?: string[]; sources?: string[]; minScore?: number };

export default async function RulesPage() {
  const ctx = await requireCtx('routing.read');
  const [rules, decisions, regions, pjs, consultants] = await Promise.all([
    listRules(ctx),
    listDecisions(ctx, { take: 25 }),
    db.region.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true } }),
    db.pJ.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, code: true, city: true }, orderBy: { code: 'asc' } }),
    db.consultant.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const leads = await db.lead.findMany({ where: { id: { in: decisions.map((d) => d.leadId) } }, select: { id: true, name: true } });
  const canConfig = can(ctx, 'routing.configure');
  const opts = { regions, pjs: pjs.map((p) => ({ id: p.id, name: `${p.code} · ${p.city}` })), consultants };
  const pjName = (id: string) => pjs.find((p) => p.id === id)?.code ?? id;

  return (
    <>
      <PageHeader title="Regras de distribuição" crumb="Configurações → Distribuição" subtitle="Lead → produto → região → PJs elegíveis → consultores elegíveis → capacidade → método → consultor. Regras avaliadas por prioridade (menor primeiro); sem regra aplicável, vale o fallback por cidade atendida." actions={canConfig && <RuleForm options={opts} />} />
      <div className="grid lg:grid-cols-2 gap-4">
        {rules.map((r) => {
          const c = r.conditions as Cond;
          return (
            <Card key={r.id} title={r.name} subtitle={`Prioridade ${r.priority}`} actions={<Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Ativa' : 'Inativa'}</Badge>}>
              <div className="font-mono text-[12.5px] leading-relaxed bg-slate-50 border border-line rounded-lg p-3">
                <div>
                  <b className="text-brand-700">SE</b>{' '}
                  {[
                    c.products?.length && `produto ∈ [${c.products.map(productLabel).join(', ')}]`,
                    c.regionIds?.length && `região ∈ [${c.regionIds.map((id) => regions.find((x) => x.id === id)?.name ?? id).join(', ')}]`,
                    c.cities?.length && `cidade ∈ [${c.cities.join(', ')}]`,
                    c.ufs?.length && `UF ∈ [${c.ufs.join(', ')}]`,
                    c.sources?.length && `origem ∈ [${c.sources.map(sourceLabel).join(', ')}]`,
                    c.minScore != null && `score ≥ ${c.minScore}`,
                  ]
                    .filter(Boolean)
                    .join(' E ') || 'qualquer lead'}
                </div>
                <div>
                  <b className="text-brand-700">ENTÃO</b> PJs = [{r.pjIds.length ? r.pjIds.map(pjName).join(', ') : 'todas'}]
                </div>
                <div>
                  Método = {ROUTING_METHODS[r.method as keyof typeof ROUTING_METHODS]}
                  {r.method === 'SPECIFIC_CONSULTANT' && ` (${consultants.find((x) => x.id === r.consultantId)?.name ?? '—'})`}
                  {r.capacity ? ` · Capacidade = ${r.capacity}` : ''}
                </div>
              </div>
              {canConfig && (
                <div className="flex gap-2 mt-3">
                  <RuleForm id={r.id} options={opts} initial={{ name: r.name, priority: String(r.priority), active: r.active, conditions: { products: c.products ?? [], regionIds: c.regionIds ?? [], cities: (c.cities ?? []).join(', '), ufs: (c.ufs ?? []).join(', '), sources: c.sources ?? [], minScore: c.minScore != null ? String(c.minScore) : '' }, pjIds: r.pjIds, method: r.method, consultantId: r.consultantId ?? '', capacity: r.capacity ? String(r.capacity) : '' }} />
                  <ActionButton size="sm" variant="ghost" method="DELETE" path={`/routing/rules/${r.id}`} confirm="Excluir esta regra?" success="Regra excluída.">
                    Excluir
                  </ActionButton>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <Card title="Decisões recentes do Lead Router" subtitle="Toda decisão é registrada com os passos avaliados" pad={false} className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Lead</Th>
              <Th>Regra</Th>
              <Th>Método</Th>
              <Th>Resultado</Th>
              <Th>Passos</Th>
              <Th>Quando</Th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.id}>
                <Td>
                  <Link href={`/leads/${d.leadId}`} className="font-medium hover:text-brand-600">
                    {leads.find((l) => l.id === d.leadId)?.name ?? d.leadId}
                  </Link>
                </Td>
                <Td>{d.ruleName ?? '—'}</Td>
                <Td>{d.method ?? '—'}</Td>
                <Td>
                  <Badge tone={d.outcome === 'NO_ELIGIBLE' ? 'red' : d.outcome === 'MANUAL' ? 'amber' : 'green'}>{d.outcome}</Badge>
                </Td>
                <Td className="text-xs text-muted max-w-md">{(d.steps as { step: string }[]).map((s) => s.step).join(' → ')}</Td>
                <Td className="text-xs text-muted">{dateTime(d.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
