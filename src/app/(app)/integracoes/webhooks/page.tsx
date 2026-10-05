import { requireCtx } from '@/modules/auth/session';
import { listSubscriptions } from '@/modules/webhooks/webhook.service';
import { EVENT_NAMES } from '@/lib/events';
import { Badge, Card, Empty, PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { dateTime } from '@/lib/format';
import { WebhookForm } from './webhook-form';

export const metadata = { title: 'Webhooks' };

export default async function WebhooksPage() {
  const ctx = await requireCtx('webhook.manage');
  const subs = await listSubscriptions(ctx);
  return (
    <>
      <PageHeader title="Webhooks" crumb="Integrações" subtitle="Eventos do Event Bus enviados por POST JSON assinado (HMAC-SHA256, cabeçalho x-prospect-signature), com retry e backoff exponencial (até 6 tentativas)." actions={<WebhookForm events={[...EVENT_NAMES]} />} />
      {subs.length === 0 ? (
        <Card>
          <Empty title="Nenhuma assinatura">Crie uma assinatura para receber eventos como lead.created, lead.assigned, opportunity.closed…</Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {subs.map((s) => (
            <Card
              key={s.id}
              title={s.name}
              subtitle={<code className="text-xs break-all">{s.url}</code>}
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone={s.active ? 'green' : 'gray'}>{s.active ? 'Ativa' : 'Pausada'}</Badge>
                  <ActionButton size="sm" method="PATCH" path={`/webhooks/${s.id}`} body={{ active: !s.active }}>
                    {s.active ? 'Pausar' : 'Ativar'}
                  </ActionButton>
                </div>
              }
            >
              <div className="flex flex-wrap gap-1 mb-3">
                {s.events.map((e) => (
                  <Badge key={e} tone="blue">
                    {e}
                  </Badge>
                ))}
              </div>
              <div className="text-xs text-muted mb-2">
                Segredo de assinatura: <code>{s.secret.slice(0, 10)}…</code> (verifique <code>sha256=HMAC(secret, timestamp + &quot;.&quot; + body)</code>)
              </div>
              <table className="w-full text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="text-left py-1">Evento</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">HTTP</th>
                    <th className="text-left">Tentativas</th>
                    <th className="text-left">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {s.deliveries.map((d) => (
                    <tr key={d.id} className="border-t border-line">
                      <td className="py-1.5">{d.event}</td>
                      <td>
                        <Badge tone={d.status === 'SUCCESS' ? 'green' : d.status === 'FAILED' ? 'red' : 'amber'}>{d.status}</Badge>
                      </td>
                      <td className="tabular">{d.responseStatus ?? '—'}</td>
                      <td className="tabular">{d.attempts}</td>
                      <td>{dateTime(d.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
