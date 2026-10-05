import { requireCtx } from '@/modules/auth/session';
import { operationHealth } from '@/modules/operations/operations.service';
import { Card, PageHeader, Table, Td, Th, cx } from '@/components/ui';
import { AutoRefresh } from '@/components/v2-client';
import { StatusBadge2, DataNote } from '@/components/v2-ui';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Saúde da Operação' };

const DOT = { OK: 'bg-ok', WARN: 'bg-warn', DOWN: 'bg-bad', MOCK: 'bg-violet-500', NOT_CONFIGURED: 'bg-slate-300' } as const;

export default async function HealthPage() {
  const ctx = await requireCtx('integration.read');
  const h = await operationHealth(ctx);
  return (
    <>
      <AutoRefresh seconds={60} on={[]} />
      <PageHeader crumb="Integrações" title="Operation Health Center" subtitle={`Status derivados de medições feitas agora (banco, Redis, filas, IA, WhatsApp, SLA, capacidade, push). Verificado em ${dateTime(h.checkedAt)}.`} actions={<StatusBadge2 s={h.overall} />} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        {h.items.map((i) => (
          <div key={i.key} className="rounded-xl border border-line bg-surface p-4 flex items-start gap-3">
            <span className={cx('mt-1.5 size-3 rounded-full shrink-0', DOT[i.status as keyof typeof DOT] ?? 'bg-slate-300')} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <b className="text-sm text-ink">{i.label}</b>
                <StatusBadge2 s={i.status} />
              </span>
              <span className="block text-xs text-muted mt-1">{i.detail}</span>
            </span>
          </div>
        ))}
      </div>
      <Card title="Integration Health" subtitle="Provider · status · latência do health check · último erro" pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Integração</Th>
              <Th>Categoria</Th>
              <Th>Status</Th>
              <Th className="text-right">Latência</Th>
              <Th>Última verificação</Th>
              <Th>Detalhe / último erro</Th>
            </tr>
          </thead>
          <tbody>
            {h.integrations.map((i) => (
              <tr key={i.key}>
                <Td className="font-medium">{i.name}</Td>
                <Td className="text-xs text-muted">{i.category}</Td>
                <Td>
                  <StatusBadge2 s={i.status} />
                </Td>
                <Td className="text-right tabular text-xs">{i.latencyMs} ms</Td>
                <Td className="text-xs text-muted">{i.lastSync ? dateTime(i.lastSync) : '—'}</Td>
                <Td className="text-xs text-muted max-w-md">{i.lastError ?? i.detail}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="px-5 pb-4">
          <DataNote>MOCK = provider de demonstração claramente identificado; NOT_CONFIGURED = falta credencial/documentação oficial. Nenhum mock é apresentado como integração real.</DataNote>
        </div>
      </Card>
    </>
  );
}
