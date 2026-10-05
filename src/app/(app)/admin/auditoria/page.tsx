import { requireCtx } from '@/modules/auth/session';
import { listAudit } from '@/modules/audit/audit.service';
import { Badge, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { FilterBar, Pagination } from '@/components/client';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Auditoria' };

const ACTIONS = [
  'auth.login', 'auth.login_failed', 'auth.logout', 'lead.created', 'lead.updated', 'lead.merged', 'lead.assigned', 'lead.transferred', 'lead.status_changed', 'opportunity.created', 'opportunity.stage_changed', 'opportunity.closed',
  'ai.configured', 'knowledge.changed', 'campaign.changed', 'landing.changed', 'simulator.changed', 'permission.changed', 'user.changed', 'routing.changed', 'whatsapp.changed', 'import.executed', 'export.executed', 'privacy.changed', 'settings.changed', 'apikey.changed', 'webhook.changed',
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('audit.read');
  const sp = await searchParams;
  const { items, total, page, pageSize } = await listAudit(ctx, { action: sp.action, entityType: sp.entityType, page: Number(sp.page ?? 1) });
  return (
    <>
      <PageHeader title="Auditoria" crumb="Admin" subtitle="Registro imutável das ações importantes: login, leads, distribuição, oportunidades, IA, Knowledge Base, campanhas, permissões, importações e exportações." />
      <FilterBar className="mb-3" fields={[{ name: 'action', label: 'Ação', options: ACTIONS.map((a) => ({ value: a, label: a })) }]} />
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Usuário</Th>
              <Th>Ação</Th>
              <Th>Entidade</Th>
              <Th>Detalhes</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <Td className="text-xs text-muted whitespace-nowrap">{dateTime(a.createdAt)}</Td>
                <Td className="text-sm">{a.userName ?? 'Sistema'}</Td>
                <Td>
                  <Badge tone={a.action.includes('failed') ? 'red' : a.action.startsWith('auth') ? 'gray' : a.action.includes('permission') || a.action.includes('export') ? 'amber' : 'blue'}>{a.action}</Badge>
                </Td>
                <Td className="text-xs">
                  {a.entityType ?? '—'}
                  {a.entityId && <div className="text-muted font-mono">{a.entityId.slice(-10)}</div>}
                </Td>
                <Td className="text-[11px] text-ink-2 max-w-md truncate" >
                  <span title={JSON.stringify(a.metadata)}>{JSON.stringify(a.metadata)}</span>
                </Td>
                <Td className="text-xs text-muted">{a.ip ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
