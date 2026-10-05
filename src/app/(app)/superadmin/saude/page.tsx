import Link from 'next/link';
import { platformDiagnostics, type Check, type Level } from '@/modules/platform/diagnostics.service';
import { Card, PageHeader, cx } from '@/components/ui';
import { AutoRefresh } from '@/components/v2-client';
import { dateTime } from '@/lib/format';
import { requireSuperAdmin } from '../guard';

export const metadata = { title: 'Saúde do sistema' };

const DOT: Record<Level, string> = { OK: 'bg-ok', WARN: 'bg-warn', DOWN: 'bg-bad', INFO: 'bg-slate-300' };
const LABEL: Record<Level, string> = { OK: 'OK', WARN: 'Atenção', DOWN: 'Falha', INFO: 'Info' };

function List({ items }: { items: Check[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((c) => {
        const body = (
          <span className="flex items-start gap-3 px-4 py-3">
            <span className={cx('mt-1.5 size-3 rounded-full shrink-0', DOT[c.level])} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex justify-between gap-2">
                <b className="text-sm">{c.label}</b>
                <span className="text-xs text-muted">{LABEL[c.level]}</span>
              </span>
              <span className="block text-xs text-muted mt-0.5">{c.detail}</span>
            </span>
          </span>
        );
        return (
          <li key={c.key}>
            {c.href ? (
              <Link href={c.href} className="block hover:bg-slate-50">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function DiagnosticsPage() {
  const ctx = await requireSuperAdmin();
  const d = await platformDiagnostics(ctx);
  return (
    <>
      <AutoRefresh seconds={60} on={[]} />
      <PageHeader crumb="Super Admin" title="Saúde do sistema" subtitle={`Medido agora (${dateTime(d.checkedAt)}). Atualiza sozinho a cada minuto.`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Negócio" subtitle="Leads, distribuição, equipe, WhatsApp e anúncios" pad={false}>
          <List items={d.business} />
        </Card>
        <Card title="Infraestrutura" subtitle="Banco, Redis, filas, IA, provedores" pad={false}>
          <List items={d.system} />
        </Card>
      </div>
    </>
  );
}
