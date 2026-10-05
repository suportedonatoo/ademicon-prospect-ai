import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { listNotifications, notificationMetrics } from '@/modules/notifications/notification.service';
import { resolveFilters } from '@/modules/analytics/filters';
import { Badge, Card, Empty, LinkButton, PageHeader, cx } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { AutoRefresh, DesktopPermissionButton } from '@/components/v2-client';
import { Kpi } from '@/components/v2-ui';
import { dateTime, minutesToHuman, num, pct } from '@/lib/format';

export const metadata = { title: 'Notificações' };

const CATEGORIES = [
  ['', 'Todas'],
  ['LEAD', 'Leads'],
  ['CONVERSATION', 'Conversas'],
  ['OPPORTUNITY', 'Oportunidades'],
  ['TASK', 'Tarefas'],
  ['SLA', 'SLA'],
  ['SYSTEM', 'Sistema'],
] as const;
const PRIORITY_TONE = { CRITICAL: 'red', HIGH: 'amber', NORMAL: 'gray', LOW: 'gray' } as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('notification.read');
  const sp = await searchParams;
  const status = ['all', 'unread', 'read'].includes(sp.status) ? sp.status : 'all';
  const category = CATEGORIES.some(([k]) => k === sp.category) ? sp.category : '';
  const f = resolveFilters({ period: '30d' });
  const [list, metrics] = await Promise.all([listNotifications(ctx, { status, category: category || undefined, take: 50, cursor: sp.cursor }), notificationMetrics(ctx, f.from, f.to)]);
  const href = (p: Record<string, string>) => `/notificacoes?${new URLSearchParams({ status, category, ...p }).toString()}`;
  return (
    <>
      <AutoRefresh seconds={120} on={['rt:notification']} />
      <PageHeader
        crumb="Operação"
        title="Central de notificações"
        subtitle="Tudo o que foi avisado a você — no sino, no computador, no celular e na extensão. Clique para abrir o recurso."
        actions={
          <>
            <DesktopPermissionButton />
            <LinkButton href="/configuracoes/notificacoes">Preferências e dispositivos</LinkButton>
            {list.unread > 0 && (
              <ActionButton path="/notifications" success="Todas marcadas como lidas.">
                Marcar todas como lidas
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Kpi label="Não lidas" value={num(list.unread)} tone={list.unread ? 'amber' : 'green'} />
        <Kpi label="Entregues (30d)" value={pct(metrics.deliveryRate)} hint={`${num(metrics.delivered)} de ${num(metrics.total)}`} />
        <Kpi label="Abertura" value={pct(metrics.openRate)} />
        <Kpi label="Clique" value={pct(metrics.clickRate)} />
        <Kpi label="Ação após clique" value={pct(metrics.actionRate)} hint={metrics.avgMinutesToAction == null ? 'atividade em até 2h' : `em média ${minutesToHuman(metrics.avgMinutesToAction)}`} />
      </div>
      <div className="flex flex-wrap gap-4 mb-3">
        <nav className="flex gap-1" aria-label="Status">
          {[
            ['all', 'Todas'],
            ['unread', 'Não lidas'],
            ['read', 'Lidas'],
          ].map(([k, l]) => (
            <Link key={k} href={href({ status: k })} className={cx('rounded-full border px-3 py-1 text-xs', status === k ? 'bg-ink text-white border-ink' : 'border-line')}>
              {l}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-1" aria-label="Categoria">
          {CATEGORIES.map(([k, l]) => (
            <Link key={k || 'all'} href={href({ category: k })} className={cx('rounded-full border px-3 py-1 text-xs', category === k ? 'bg-ink text-white border-ink' : 'border-line')}>
              {l}
            </Link>
          ))}
        </nav>
      </div>
      <Card pad={false}>
        {list.items.length === 0 ? (
          <Empty title="Nenhuma notificação aqui" />
        ) : (
          <ul className="divide-y divide-line">
            {list.items.map((n) => (
              <li key={n.id}>
                <a href={`/api/v1/notifications/${n.id}/open?via=center`} className={cx('flex items-start gap-3 px-5 py-3 hover:bg-slate-50', !n.readAt && 'bg-brand-50/50')}>
                  <span className={cx('mt-1.5 size-2 rounded-full shrink-0', n.readAt ? 'bg-transparent' : 'bg-brand-500')} aria-label={n.readAt ? 'lida' : 'não lida'} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm text-ink">{n.title}</b>
                    {n.body && <span className="block text-xs text-muted line-clamp-2">{n.body}</span>}
                    <span className="block text-[11px] text-faint mt-0.5">
                      {dateTime(n.createdAt)} · {n.category} {n.heldUntil ? `· retida pelo horário de silêncio até ${dateTime(n.heldUntil)}` : ''} {n.channels.length ? `· ${n.channels.join(', ')}` : ''}
                    </span>
                  </span>
                  <Badge tone={PRIORITY_TONE[n.priority as keyof typeof PRIORITY_TONE] ?? 'gray'}>{n.priority}</Badge>
                </a>
              </li>
            ))}
          </ul>
        )}
        {list.nextCursor && (
          <div className="p-3 text-center border-t border-line">
            <Link href={href({ cursor: list.nextCursor })} className="text-sm text-brand-600 hover:underline">
              Mais antigas →
            </Link>
          </div>
        )}
      </Card>
      {metrics.byType.length > 0 && (
        <Card className="mt-4" title="Notification Intelligence" subtitle="Evento → notificação → entrega → abertura → ação (30 dias)">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            {metrics.byType.slice(0, 8).map((t) => (
              <div key={t.key} className="flex justify-between border-b border-line py-1">
                <span className="text-muted">{t.key}</span>
                <b className="tabular">{num(t.value)}</b>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-3">
            Push: {num(metrics.push.sent)} enviados · {num(metrics.push.failed)} falhas.
          </p>
        </Card>
      )}
    </>
  );
}
