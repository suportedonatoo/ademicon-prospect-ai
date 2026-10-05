import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { resolveFilters } from '@/modules/analytics/filters';
import { aiObservability } from '@/modules/analytics/analytics.service';
import { listExecutions } from '@/modules/ai/ai-admin.service';
import { listGaps } from '@/modules/knowledge-base/knowledge.service';
import { getAIProvider } from '@/modules/ai/providers';
import { Badge, Card, Notice, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { ActionButton, FilterBar } from '@/components/client';
import { BarList } from '@/components/charts';
import { dateTime, num, pct } from '@/lib/format';

export const metadata = { title: 'Maestro' };

const FLOW = ['MESSAGE', 'MAESTRO', 'CONTEXT', 'MEMORY', 'KNOWLEDGE', 'BUSINESS RULES', 'AGENT', 'SUPERVISOR', 'RESPONSE'];
const AGENT = { PROSPECT: 'Prospect Agent', QUALIFICATION: 'Qualification Agent' } as Record<string, string>;

export default async function MaestroPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('ai.read');
  const sp = await searchParams;
  const f = resolveFilters(sp);
  const [o, execs, gaps] = await Promise.all([aiObservability(ctx, f), listExecutions(ctx, { status: sp.status, take: 40 }), listGaps(ctx)]);
  const ai = getAIProvider();
  return (
    <>
      <PageHeader title="Maestro" crumb="IA · Observabilidade" subtitle="Orquestra contexto, memória, Knowledge Base, regras, agente, supervisor e handoff em cada mensagem." />
      <Notice tone={ai.name === 'mock' ? 'amber' : 'green'} title={`Provider: ${ai.name === 'mock' ? 'MockAIProvider' : 'Anthropic'} (${ai.model}).`}>
        {ai.name === 'mock' ? 'Respostas por regras + Knowledge Base, sem LLM. Defina AI_PROVIDER=anthropic e AI_API_KEY para IA real — o domínio não muda.' : 'IA real ativa, com fallback automático para o mock em caso de falha.'}
      </Notice>
      <Card className="my-4">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs">
          {FLOW.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-faint">→</span>}
              <span className={`rounded-md px-2.5 py-1 font-semibold ${s === 'SUPERVISOR' ? 'bg-bad-50 text-bad' : s === 'MAESTRO' ? 'bg-brand-900 text-white' : 'bg-slate-100 text-ink-2'}`}>{s}</span>
            </li>
          ))}
        </ol>
      </Card>
      <FilterBar className="mb-4" fields={[{ name: 'period', label: 'Últimos 30 dias', options: [{ value: '7d', label: 'Últimos 7 dias' }, { value: '90d', label: 'Últimos 90 dias' }] }, { name: 'status', label: 'Status da execução', options: [{ value: 'COMPLETED', label: 'Concluída' }, { value: 'BLOCKED', label: 'Bloqueada pelo supervisor' }, { value: 'FAILED', label: 'Falha' }] }]} />
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-4">
        <Stat label="Conversas IA" value={num(o.conversations)} />
        <Stat label="Respostas" value={num(o.responses)} />
        <Stat label="Handoffs" value={num(o.handoffs)} />
        <Stat label="Taxa de handoff" value={pct(o.handoffRate)} />
        <Stat label="Falhas" value={num(o.failures)} />
        <Stat label="Bloqueios (supervisor)" value={num(o.blocked)} />
        <Stat label="Tempo médio" value={o.avgLatencyMs ? `${Math.round(o.avgLatencyMs)} ms` : '—'} />
        <Stat label="Agente mais usado" value={o.topAgent ? AGENT[o.topAgent.key] ?? o.topAgent.key : '—'} hint={o.topAgent ? `${num(o.topAgent.count)} execuções` : undefined} />
      </div>
      <div className="grid xl:grid-cols-3 gap-4 mb-4">
        <Card title="Execuções por agente">
          <BarList items={o.byAgent.map((a) => ({ label: AGENT[a.key] ?? a.key, value: a.value }))} />
        </Card>
        <Card title="AI Feedback" subtitle="Avaliações feitas no Inbox">
          <BarList items={[['GOOD', 'Resposta boa'], ['BAD', 'Resposta ruim'], ['INCORRECT', 'Informação incorreta'], ['NEEDS_REVIEW', 'Necessita revisão']].map(([k, l]) => ({ label: l, value: o.feedback[k] ?? 0 }))} empty="Sem avaliações ainda." />
        </Card>
        <Card title="Supervisor" subtitle="Intervenções antes do envio">
          <BarList items={[['approved', 'Aprovadas'], ['rewritten', 'Reescritas'], ['blocked', 'Bloqueadas']].map(([k, l]) => ({ label: l, value: o.supervisor[k] ?? 0 }))} />
        </Card>
      </div>
      <Card title={`Perguntas sem resposta · Knowledge Gap (${gaps.length})`} subtitle="Quando a IA não encontra informação autorizada, ela não inventa: registra aqui para a KB ser complementada." className="mb-4" pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Pergunta</Th>
              <Th>Agente</Th>
              <Th>Lead</Th>
              <Th>Data</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {gaps.slice(0, 20).map((g) => (
              <tr key={g.id}>
                <Td className="font-medium">{g.question}</Td>
                <Td>{AGENT[g.agentKey] ?? g.agentKey}</Td>
                <Td>{g.leadId ? <Link className="text-brand-600 hover:underline text-xs" href={`/leads/${g.leadId}`}>ver lead</Link> : '—'}</Td>
                <Td className="text-xs text-muted">{dateTime(g.createdAt)}</Td>
                <Td className="text-right whitespace-nowrap">
                  {can(ctx, 'knowledge.manage') && (
                    <span className="inline-flex gap-1">
                      <a className="text-xs text-brand-600 hover:underline mr-2" href={`/ia/knowledge/novo?q=${encodeURIComponent(g.question)}`}>
                        Criar conteúdo
                      </a>
                      <ActionButton size="sm" variant="ghost" path={`/ai/gaps/${g.id}`} method="PATCH" body={{ status: 'RESOLVED' }}>
                        Resolver
                      </ActionButton>
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card title="Execuções recentes" subtitle="executionId · leadId · conversationId · agentId · início · fim · status" pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Execução</Th>
              <Th>Agente / playbook</Th>
              <Th>Status</Th>
              <Th>Supervisor</Th>
              <Th className="text-right">Latência</Th>
              <Th>Início</Th>
            </tr>
          </thead>
          <tbody>
            {execs.map((e) => {
              const v = e.supervisorVerdict as { action?: string; violations?: { rule: string }[] };
              return (
                <tr key={e.id}>
                  <Td>
                    <Link href={`/ia/maestro/${e.id}`} className="text-brand-600 hover:underline" title="Abrir AI Trace"><code className="text-[11px]">{e.id.slice(-10)}</code> · trace</Link>
                    <div className="text-[11px] text-muted">
                      {e.leadId ? <Link className="hover:underline" href={`/leads/${e.leadId}`}>lead</Link> : '—'} · {e.conversationId ? <Link className="hover:underline" href={`/conversas?c=${e.conversationId}`}>conversa</Link> : '—'}
                    </div>
                  </Td>
                  <Td>
                    {AGENT[e.agentKey] ?? e.agentKey}
                    <div className="text-xs text-muted">{e.playbookKey}</div>
                  </Td>
                  <Td>
                    <Badge tone={e.status === 'COMPLETED' ? 'green' : e.status === 'BLOCKED' ? 'amber' : e.status === 'FAILED' ? 'red' : 'gray'}>{e.status}</Badge>
                  </Td>
                  <Td className="text-xs">
                    {v?.action ?? '—'}
                    {v?.violations?.length ? <div className="text-muted">{v.violations.map((x) => x.rule).join('; ')}</div> : null}
                  </Td>
                  <Td className="text-right tabular text-xs">{e.latencyMs ? `${e.latencyMs} ms` : '—'}</Td>
                  <Td className="text-xs text-muted">{dateTime(e.startedAt)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
