import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { supervisorCockpit } from '@/modules/operations/operations.service';
import { NBA_ACTIONS } from '@/modules/lead-intelligence/nba-engine';
import { Card, Empty, Notice, PageHeader, Table, Td, Th, cx } from '@/components/ui';
import { TempBadge } from '@/components/badges';
import { AutoRefresh, NbaButtons } from '@/components/v2-client';
import { Kpi, PriorityBadge, StatusBadge2 } from '@/components/v2-ui';
import { brlShort, minutesToHuman, num } from '@/lib/format';

export const metadata = { title: 'Cockpit do Supervisor' };

export default async function CockpitPage() {
  const ctx = await requireCtx('lead.read');
  const c = await supervisorCockpit(ctx);
  const k = c.kpis;
  return (
    <>
      <AutoRefresh seconds={45} />
      <PageHeader crumb="Operação" title="Cockpit do supervisor" subtitle="Leads quentes, SLA, conversas aguardando, capacidade da equipe e próximas ações críticas — atualizado em tempo real." />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
        <Kpi label="Leads quentes" value={num(k.hot)} hint={k.hotUnassigned ? `${k.hotUnassigned} qualificado(s) sem consultor` : 'todos com responsável'} tone="hero" href="/inteligencia?t=QUENTE" />
        <Kpi label="⚠️ SLA" value={num(k.slaBreaches)} hint={`${k.slaEscalated} escalado(s)`} tone={k.slaEscalated ? 'red' : k.slaBreaches ? 'amber' : 'green'} href="#sla" />
        <Kpi label="💬 Aguardando consultor" value={num(k.awaiting)} hint={`${k.awaitingOver15} há 15+ min`} tone={k.awaitingOver15 ? 'amber' : 'default'} href="/conversas?mode=HUMAN" />
        <Kpi label="👥 Consultores sobrecarregados" value={num(k.overloaded)} hint="capacidade alta ou crítica" tone={k.overloaded ? 'amber' : 'green'} href="#capacidade" />
        <Kpi label="📈 Oportunidades abertas" value={num(k.openOpportunities)} hint={`${brlShort(k.pipelineValue)} em pipeline · ${k.stalled} parada(s)`} href="/pipeline" />
        <Kpi label="Tarefas vencidas" value={num(k.overdueTasks)} hint={`${k.nbaCritical} ação(ões) crítica(s)`} tone={k.overdueTasks ? 'amber' : 'default'} href="/tarefas" />
      </div>

      {c.alerts.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-2 mb-4" role="list" aria-label="Alertas">
          {c.alerts.map((a) => (
            <Link key={a.title} href={a.href} role="listitem" className={cx('rounded-xl border px-4 py-3 text-sm hover:shadow-sm', a.tone === 'red' ? 'bg-bad-50 border-red-200' : a.tone === 'amber' ? 'bg-warn-50 border-amber-200' : 'bg-brand-50 border-brand-100')}>
              <b className="block text-ink">{a.title}</b>
              <span className="text-ink-2">{a.detail}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <Notice tone="green" title="Tudo sob controle.">
            Nenhum alerta ativo no seu escopo agora.
          </Notice>
        </div>
      )}

      <div className="grid xl:grid-cols-2 gap-4">
        <Card title="Próximas ações críticas" subtitle="Next Best Action (sinal por regra) · prioridade crítica e alta" pad={false}>
          {c.actions.length === 0 ? (
            <Empty title="Nenhuma ação crítica pendente" />
          ) : (
            <ul className="divide-y divide-line">
              {c.actions.slice(0, 15).map((a) => (
                <li key={a.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                  <PriorityBadge p={a.priority} />
                  <span className="min-w-0 flex-1 basis-[60%]">
                    <Link href={`/leads/${a.lead.id}`} className="font-medium text-ink hover:underline">
                      {NBA_ACTIONS[a.action as keyof typeof NBA_ACTIONS] ?? a.action} · {a.lead.name}
                    </Link>
                    <span className="block text-xs text-muted">
                      {a.reason} {a.lead.consultant ? `· ${a.lead.consultant.name}` : '· sem consultor'}
                    </span>
                  </span>
                  <NbaButtons id={a.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Conversas aguardando resposta" subtitle="Cliente escreveu por último · atendimento humano" pad={false}>
          {c.awaiting.length === 0 ? (
            <Empty title="Nenhum cliente aguardando" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Consultor</Th>
                  <Th className="text-right">Esperando</Th>
                </tr>
              </thead>
              <tbody>
                {c.awaiting.map((a) => (
                  <tr key={a.conversationId}>
                    <Td>
                      <Link href={`/conversas?c=${a.conversationId}`} className="font-medium hover:underline">
                        {a.leadName}
                      </Link>{' '}
                      <TempBadge temperature={a.temperature} />
                    </Td>
                    <Td className="text-muted">{a.consultant ?? '—'}</Td>
                    <Td className={cx('text-right tabular', a.minutes >= 15 && 'text-bad font-semibold')}>{minutesToHuman(a.minutes)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="SLA" subtitle="Lead sem 1º atendimento · cliente aguardando após handoff" pad={false}>
          <div id="sla" />
          {c.sla.length === 0 ? (
            <Empty title="Nenhum SLA estourado" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Lead</Th>
                  <Th>Tipo</Th>
                  <Th>Nível</Th>
                  <Th className="text-right">Tempo</Th>
                </tr>
              </thead>
              <tbody>
                {c.sla.map((b) => (
                  <tr key={`${b.kind}-${b.leadId}`}>
                    <Td>
                      <Link href={b.conversationId ? `/conversas?c=${b.conversationId}` : `/leads/${b.leadId}`} className="font-medium hover:underline">
                        {b.leadName}
                      </Link>
                    </Td>
                    <Td className="text-muted">{b.kind === 'HANDOFF' ? 'Handoff' : '1º atendimento'}</Td>
                    <Td>{b.level === 'ESCALATED' ? <StatusBadge2 s="DOWN" /> : <StatusBadge2 s="WARN" />}</Td>
                    <Td className="text-right tabular">{minutesToHuman(Math.round(b.minutes))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Capacidade da equipe" subtitle="Carga atual × capacidade configurada" pad={false} actions={<Link href="/distribuicao/capacidade" className="text-xs text-brand-600 hover:underline">Detalhes</Link>}>
          <div id="capacidade" />
          {c.capacity.length === 0 ? (
            <Empty title="Sem consultores no seu escopo" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Consultor</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Leads</Th>
                  <Th className="text-right">Oport.</Th>
                  <Th className="text-right">Carga</Th>
                </tr>
              </thead>
              <tbody>
                {c.capacity.slice(0, 12).map((r) => (
                  <tr key={r.id}>
                    <Td>
                      {r.name} <span className="text-xs text-faint">{r.pj}</span>
                    </Td>
                    <Td>
                      <StatusBadge2 s={r.state} />
                    </Td>
                    <Td className="text-right tabular">
                      {r.activeLeads}/{r.capacity.leads}
                    </Td>
                    <Td className="text-right tabular">
                      {r.activeOpportunities}/{r.capacity.opportunities}
                    </Td>
                    <Td className="text-right tabular">{r.load}%</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
