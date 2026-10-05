import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { db } from '@/lib/db';
import { Card, Empty, PageHeader, Table, Td, Th, cx } from '@/components/ui';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Histórico de configuração' };

const AREAS = [
  ['', 'Todas'],
  ['settings', 'Configurações'],
  ['prompt', 'Prompts de IA'],
  ['playbook', 'Playbooks'],
  ['flags', 'Feature flags'],
] as const;

export default async function ConfigHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('audit.read');
  const { area = '' } = await searchParams;
  const rows = await db.configHistory.findMany({ where: { organizationId: ctx.orgId, ...(area ? { area } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <>
      <PageHeader crumb="Admin" title="Histórico de configuração" subtitle="Quem mudou o quê, quando, e como estava antes. Complementa a Auditoria com o antes/depois das configurações críticas." />
      <nav className="flex flex-wrap gap-1.5 mb-4">
        {AREAS.map(([k, l]) => (
          <Link key={k || 'all'} href={k ? `/admin/historico?area=${k}` : '/admin/historico'} className={cx('rounded-full border px-3 py-1 text-xs', area === k ? 'bg-ink text-white border-ink' : 'border-line')}>
            {l}
          </Link>
        ))}
      </nav>
      <Card pad={false}>
        {rows.length === 0 ? (
          <Empty title="Nenhuma alteração registrada" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Área</Th>
                <Th>Autor</Th>
                <Th>Antes</Th>
                <Th>Depois</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="text-xs text-muted whitespace-nowrap">{dateTime(r.createdAt)}</Td>
                  <Td>{r.area}</Td>
                  <Td className="text-xs">{r.actorName ?? '—'}</Td>
                  <Td>
                    <code className="text-[11px] break-all">{JSON.stringify(r.before).slice(0, 240)}</code>
                  </Td>
                  <Td>
                    <code className="text-[11px] break-all">{JSON.stringify(r.after).slice(0, 240)}</code>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
