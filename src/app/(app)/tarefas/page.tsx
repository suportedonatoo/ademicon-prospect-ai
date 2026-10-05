import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listTasks, TASK_TYPES, PRIORITIES } from '@/modules/tasks/task.service';
import { Badge, Card, Empty, PageHeader, cx } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { dateTime, googleCalendarUrl } from '@/lib/format';
import { buttonClass } from '@/components/ui';
import { env } from '@/lib/env';

export const metadata = { title: 'Tarefas' };

const TABS = [
  { key: '', label: 'Abertas' },
  { key: 'mine', label: 'Minhas' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'done', label: 'Concluídas' },
];

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('task.read');
  const { tab = '' } = await searchParams;
  const tasks = await listTasks(ctx, { status: tab === 'done' ? 'DONE' : 'OPEN', mine: tab === 'mine', overdue: tab === 'overdue' });
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Tarefas"
        crumb="CRM"
        subtitle="Task Engine: contato, follow-up, retorno, proposta e reunião. O Follow-up Engine cria tarefas para leads sem atendimento."
        actions={
          can(ctx, 'automation.manage') && (
            <ActionButton path="/automations/run" success="Follow-up executado: tarefas criadas para leads sem atendimento.">
              Executar follow-up agora
            </ActionButton>
          )
        }
      />
      <div className="inline-flex flex-wrap gap-0.5 mb-5 rounded-2xl bg-slate-100 p-1 max-w-full">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key ? `/tarefas?tab=${t.key}` : '/tarefas'} className={cx('px-4 py-2 text-sm rounded-xl whitespace-nowrap', tab === t.key ? 'bg-white text-ink font-medium shadow-sm' : 'text-muted hover:text-ink')}>
            {t.label}
          </Link>
        ))}
      </div>
      <Card pad={false}>
        {tasks.length ? (
          <ul className="divide-y divide-line">
            {tasks.map((t) => {
              const late = t.status === 'OPEN' && t.dueAt < now;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Badge tone={t.priority === 'URGENT' ? 'red' : t.priority === 'HIGH' ? 'amber' : 'gray'}>{PRIORITIES[t.priority as keyof typeof PRIORITIES]}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-muted">
                      {TASK_TYPES[t.type as keyof typeof TASK_TYPES]} · {t.origin === 'FOLLOW_UP' ? 'Follow-up automático' : t.origin === 'AUTOMATION' ? 'Automação' : 'Manual'}
                      {t.lead && (
                        <>
                          {' '}
                          ·{' '}
                          <Link className="text-brand-600 hover:underline" href={`/leads/${t.lead.id}`}>
                            {t.lead.name}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={cx('text-xs tabular', late ? 'text-bad font-semibold' : 'text-muted')}>{late ? 'Atrasada · ' : ''}{dateTime(t.dueAt)}</span>
                  {t.status === 'OPEN' && (
                    <a
                      className={buttonClass('secondary', 'sm')}
                      target="_blank"
                      rel="noopener noreferrer"
                      href={googleCalendarUrl({
                        title: t.lead ? `${t.title} · ${t.lead.name}` : t.title,
                        start: t.dueAt,
                        details: `${TASK_TYPES[t.type as keyof typeof TASK_TYPES]}${t.lead ? `\nLead: ${env.APP_URL}/leads/${t.lead.id}` : ''}`,
                      })}
                    >
                      + Google Agenda
                    </a>
                  )}
                  {t.status === 'OPEN' && can(ctx, 'task.update') && (
                    <ActionButton size="sm" path={`/tasks/${t.id}`} method="PATCH" body={{ status: 'DONE' }} success="Tarefa concluída.">
                      Concluir
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="Nenhuma tarefa aqui" />
        )}
      </Card>
    </>
  );
}
