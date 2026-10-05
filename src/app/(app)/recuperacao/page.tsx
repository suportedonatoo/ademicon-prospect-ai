import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { recoveryCenter } from '@/modules/recovery/recovery.service';
import { RECOVERY_REASON_LABEL } from '@/modules/recovery/recovery-engine';
import { NBA_ACTIONS } from '@/modules/lead-intelligence/nba-engine';
import { Card, Empty, PageHeader, Table, Td, Th, cx } from '@/components/ui';
import { ScoreBadge } from '@/components/badges';
import { ActionButton } from '@/components/client';
import { AutoRefresh } from '@/components/v2-client';
import { Kpi } from '@/components/v2-ui';
import { num } from '@/lib/format';

export const metadata = { title: 'Recovery Center' };

const QUEUE_TONE = { NOW: 'red', TODAY: 'amber', NURTURE: 'default' } as const;
const human = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`);

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('lead.read');
  const sp = await searchParams;
  const data = await recoveryCenter(ctx);
  const q = (['NOW', 'TODAY', 'NURTURE'] as const).includes(sp.fila as never) ? (sp.fila as 'NOW' | 'TODAY' | 'NURTURE') : 'NOW';
  const reason = sp.motivo && sp.motivo in RECOVERY_REASON_LABEL ? sp.motivo : null;
  const queue = data.queues.find((x) => x.key === q)!;
  const items = reason ? queue.items.filter((i) => i.reason === reason) : queue.items;
  const canAct = can(ctx, 'task.create');
  const href = (p: Record<string, string | null>) => `/recuperacao?${new URLSearchParams(Object.entries({ fila: q, motivo: reason, ...p }).filter(([, v]) => v) as [string, string][]).toString()}`;
  return (
    <>
      <AutoRefresh seconds={120} />
      <PageHeader crumb="Operação" title="Lead Recovery Center" subtitle="Leads esquecidos, conversas abandonadas, oportunidades paradas, propostas sem retorno, quentes não atendidos e leads reaquecidos — organizados por urgência." />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {data.queues.map((x) => (
          <Link key={x.key} href={href({ fila: x.key, motivo: null })} aria-current={x.key === q ? 'page' : undefined} className={cx('rounded-3xl ring-offset-2 ring-offset-canvas', x.key === q && 'ring-2 ring-ink')}>
            <Kpi label={x.key === 'NOW' ? '🔥 Recuperar agora' : x.key === 'TODAY' ? '🟠 Recuperar hoje' : '🟡 Nutrir'} value={num(x.items.length)} tone={QUEUE_TONE[x.key]} />
          </Link>
        ))}
      </div>
      <nav className="flex flex-wrap gap-1.5 mb-3" aria-label="Filtrar por motivo">
        <Link href={href({ motivo: null })} className={cx('rounded-full border px-3 py-1 text-xs', !reason ? 'bg-ink text-white border-ink' : 'border-line hover:bg-slate-50')}>
          Todos os motivos
        </Link>
        {Object.entries(RECOVERY_REASON_LABEL).map(([k, l]) => (
          <Link key={k} href={href({ motivo: k })} className={cx('rounded-full border px-3 py-1 text-xs', reason === k ? 'bg-ink text-white border-ink' : 'border-line hover:bg-slate-50')}>
            {l} · {data.byReason[k] ?? 0}
          </Link>
        ))}
      </nav>
      <Card pad={false}>
        {items.length === 0 ? (
          <Empty title="Nada para recuperar nesta fila">Ótimo sinal. As filas são recalculadas a cada acesso a partir dos dados atuais.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Lead</Th>
                <Th>Motivo</Th>
                <Th>Último contato / interação</Th>
                <Th>Próxima ação</Th>
                <Th>Responsável</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 150).map((i) => (
                <tr key={i.key}>
                  <Td>
                    <Link href={i.conversationId ? `/conversas?c=${i.conversationId}` : i.opportunityId ? `/oportunidades/${i.opportunityId}` : `/leads/${i.leadId}`} className="flex items-center gap-2 font-medium hover:underline">
                      <ScoreBadge score={i.score} temperature={i.temperature} size="sm" />
                      {i.leadName}
                    </Link>
                  </Td>
                  <Td>
                    <b className="block text-[13px]">{i.reasonLabel}</b>
                    <span className="text-xs text-muted">{i.detail}</span>
                  </Td>
                  <Td className="text-xs text-muted">há {human(i.hoursIdle)}</Td>
                  <Td className="text-xs">{i.nextAction ? NBA_ACTIONS[i.nextAction as keyof typeof NBA_ACTIONS] ?? i.nextAction : '—'}</Td>
                  <Td className="text-xs">{i.owner ?? <span className="text-bad">sem responsável</span>}</Td>
                  <Td className="text-right">{canAct && <ActionButton path="/recovery" body={{ leadId: i.leadId, reason: i.reason }} size="sm" success="Tarefa de recuperação criada.">Recuperar</ActionButton>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
