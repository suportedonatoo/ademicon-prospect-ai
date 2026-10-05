import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { resolveFilters } from '@/modules/analytics/filters';
import { aiControlCenter } from '@/modules/ai/lab.service';
import { env } from '@/lib/env';
import { Card, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { BarList } from '@/components/charts';
import { Kpi, DataNote } from '@/components/v2-ui';
import { dateTime, num, pct } from '@/lib/format';

export const metadata = { title: 'AI Control Center' };

const usd = (v: number | null) => (v == null ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }));

export default async function AiControlPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('ai.read');
  const f = resolveFilters(await searchParams);
  const c = await aiControlCenter(ctx, f.from, f.to);
  return (
    <>
      <PageHeader crumb="IA" title="AI Control Center" subtitle="Chamadas, custo, latência, erros, handoffs, confiança, lacunas de conhecimento, agentes, prompts e modelos." />
      {env.AI_PROVIDER === 'mock' && (
        <Notice tone="amber" title="Provider de IA em modo MOCK.">
          As respostas vêm do motor determinístico de demonstração: não há tokens nem custo. Com um provedor real (Claude ou Gemini), tokens e custo estimado passam a ser registrados por execução.
        </Notice>
      )}
      <FilterBar className="my-4" fields={[{ name: 'period', label: 'Período', options: [{ value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '90d', label: '90 dias' }] }]} />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
        <Kpi label="Chamadas" value={num(c.calls)} />
        <Kpi label="Custo estimado" value={usd(c.costUsd)} hint={`${num(c.tokensInput)} in · ${num(c.tokensOutput)} out tokens`} />
        <Kpi label="Latência média" value={c.avgLatencyMs == null ? '—' : `${num(c.avgLatencyMs)} ms`} />
        <Kpi label="Erros" value={pct(c.errorRate)} hint={`${num(c.failures)} falha(s) · ${num(c.fallbacks)} fallback(s)`} tone={c.errorRate > 5 ? 'red' : 'default'} />
        <Kpi label="Exigiram humano" value={num(c.requiresHuman)} hint="handoff, lacuna ou risco alto" />
        <Kpi label="Confiança média" value={c.avgConfidence == null ? '—' : c.avgConfidence.toLocaleString('pt-BR')} hint={`${num(c.openGaps)} lacuna(s) abertas`} href="/ia/maestro" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Por modelo">
          <Table>
            <thead>
              <tr>
                <Th>Modelo</Th>
                <Th className="text-right">Chamadas</Th>
                <Th className="text-right">Custo</Th>
              </tr>
            </thead>
            <tbody>
              {c.byModel.map((m) => (
                <tr key={m.model}>
                  <Td className="font-mono text-xs">{m.model}</Td>
                  <Td className="text-right tabular">{num(m.calls)}</Td>
                  <Td className="text-right tabular">{usd(m.costUsd)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Por agente">
          <BarList items={c.byAgent.map((a) => ({ label: a.agent, value: a.calls, sub: a.avgConfidence == null ? undefined : `conf. ${a.avgConfidence.toFixed(2)}` }))} />
        </Card>
        <Card title="Risco e feedback humano">
          <BarList items={Object.entries(c.byRisk).map(([k, v]) => ({ label: `Risco ${k}`, value: v }))} />
          <div className="mt-4">
            <BarList items={Object.entries(c.feedback).map(([k, v]) => ({ label: k, value: v }))} empty="Sem avaliações no período." />
          </div>
        </Card>
      </div>
      <Card className="mt-4" title="Últimas avaliações (AI Evaluation Lab)" actions={<Link href="/ia/lab" className="text-xs text-brand-600 hover:underline">Abrir AI Lab</Link>} pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Dataset</Th>
              <Th>Agente / prompt</Th>
              <Th className="text-right">Acurácia</Th>
              <Th className="text-right">Alucinação</Th>
              <Th className="text-right">Handoff</Th>
            </tr>
          </thead>
          <tbody>
            {c.lastEvalRuns.map((r) => {
              const m = r.metrics as { accuracy?: number; hallucinationRate?: number; handoffRate?: number };
              return (
                <tr key={r.id}>
                  <Td className="text-xs text-muted">{dateTime(r.createdAt)}</Td>
                  <Td>{r.dataset}</Td>
                  <Td className="text-xs">
                    {r.agentKey} · v{r.promptVersion ?? '—'}
                  </Td>
                  <Td className="text-right tabular">{pct(m.accuracy)}</Td>
                  <Td className="text-right tabular">{pct(m.hallucinationRate)}</Td>
                  <Td className="text-right tabular">{pct(m.handoffRate)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <div className="px-5 pb-4">
          <DataNote>Custo estimado = tokens informados pelo provider × preço público do modelo (sobrescrevível por AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK). Sem tokens (mock) o custo não é estimado.</DataNote>
        </div>
      </Card>
    </>
  );
}
