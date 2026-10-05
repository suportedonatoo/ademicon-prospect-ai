import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listNumbers } from '@/modules/whatsapp/whatsapp.service';
import { listConsultants } from '@/modules/consultants/consultant.service';
import { BACKUP_RECOMMENDED, MAX_NUMBERS_PER_CONSULTANT, MIN_NUMBERS_PER_CONSULTANT, unusableReason } from '@/modules/whatsapp/number-pool';
import { providers } from '@/modules/integrations/registry';
import { env } from '@/lib/env';
import { Badge, Card, Notice, PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { formatPhone } from '@/lib/normalize';
import { NumberForm } from './number-form';

export const metadata = { title: 'Números de WhatsApp' };

const PURPOSE = { PROSPECT_BOT: 'Prospect Agent', QUALIFICATION_BOT: 'Qualification Agent', TEAM: 'Equipe' } as const;

type Num = Awaited<ReturnType<typeof listNumbers>>[number];

export default async function NumbersPage() {
  const ctx = await requireCtx('whatsapp.read');
  const canConfig = can(ctx, 'whatsapp.configure');
  const [numbers, consultants] = await Promise.all([listNumbers(ctx), can(ctx, 'consultant.read') ? listConsultants(ctx) : Promise.resolve([])]);
  const owners = consultants.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }));

  const operation = numbers.filter((n) => !n.consultantId);
  const byConsultant = new Map<string, Num[]>();
  for (const n of numbers) if (n.consultantId) byConsultant.set(n.consultantId, [...(byConsultant.get(n.consultantId) ?? []), n]);
  const short = consultants.filter((c) => c.active && (byConsultant.get(c.id)?.length ?? 0) < BACKUP_RECOMMENDED);

  return (
    <>
      <PageHeader
        title="Números"
        crumb="WhatsApp Hub"
        subtitle={`Cada consultor tem de ${MIN_NUMBERS_PER_CONSULTANT} a ${MAX_NUMBERS_PER_CONSULTANT} números: o principal e os de backup. Se um número cair, as conversas seguem pelo próximo, e tudo aparece no mesmo Inbox.`}
        actions={canConfig && <NumberForm consultants={owners} />}
      />
      {providers.whatsapp.mode === 'mock' && (
        <Notice tone="amber" title="MockProvider ativo:">
          nenhuma mensagem sai da plataforma. Webhook de entrada: <code className="text-xs">POST {env.APP_URL}/api/v1/webhooks/inbound/whatsapp?org=demo</code> com {'{ from, to, text }'}. Sem mecanismos de burla de limites, mascaramento de origem ou envio indiscriminado.
        </Notice>
      )}
      {canConfig && short.length > 0 && (
        <Notice tone="amber" title={`${short.length} consultor(es) com menos de ${BACKUP_RECOMMENDED} números:`}>
          sem número de backup, as conversas param se o número cair. {short.slice(0, 8).map((c) => `${c.name} (${byConsultant.get(c.id)?.length ?? 0})`).join(', ')}
          {short.length > 8 ? '…' : ''}
        </Notice>
      )}

      {[...byConsultant.entries()].map(([consultantId, list]) => (
        <section key={consultantId} className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">
              {list[0].consultant?.name ?? 'Consultor'}{' '}
              <span className="text-sm text-muted font-normal">
                · {list.length}/{MAX_NUMBERS_PER_CONSULTANT} números · {list.filter((n) => !unusableReason(n)).length} no ar
              </span>
            </h2>
            {canConfig && list.length < MAX_NUMBERS_PER_CONSULTANT && (
              <NumberForm consultants={owners} label="+ Número" initial={{ name: '', phone: '', purpose: 'TEAM', dailyLimit: '250', webhookUrl: '', consultantId, priority: String(list.length) }} />
            )}
          </div>
          <NumberGrid list={list} canConfig={canConfig} owners={owners} />
        </section>
      ))}

      <section className="mt-6">
        <h2 className="font-semibold">Números da operação <span className="text-sm text-muted font-normal">· bots e equipe</span></h2>
        <NumberGrid list={operation} canConfig={canConfig} owners={owners} />
      </section>
    </>
  );
}

function NumberGrid({ list, canConfig, owners }: { list: Num[]; canConfig: boolean; owners: { id: string; name: string }[] }) {
  if (!list.length) return <p className="mt-2 text-sm text-muted">Nenhum número.</p>;
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mt-3">
      {list.map((n, i) => {
        const reason = unusableReason(n);
        return (
          <Card
            key={n.id}
            title={n.name}
            subtitle={formatPhone(n.phone)}
            actions={
              <Badge tone={!reason ? 'green' : n.status === 'CONNECTED' ? 'amber' : n.status === 'ERROR' ? 'red' : 'gray'} dot>
                {!reason ? 'No ar' : reason[0].toUpperCase() + reason.slice(1)}
              </Badge>
            }
          >
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-muted">{n.consultantId ? 'Uso' : 'Finalidade'}</dt>
                <dd>{n.consultantId ? (i === 0 ? 'Principal' : `Backup ${i}`) : PURPOSE[n.purpose as keyof typeof PURPOSE]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Provider</dt>
                <dd>{n.provider}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Enviadas hoje</dt>
                <dd className="tabular">
                  {n.sentToday} / {n.dailyLimit}
                </dd>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-series-1" style={{ width: `${Math.min(100, (n.sentToday / n.dailyLimit) * 100)}%` }} />
              </div>
              {n.lastError && n.status === 'ERROR' && <div className="text-xs text-bad truncate" title={n.lastError}>Erro: {n.lastError}</div>}
            </dl>
            {canConfig && (
              <div className="flex flex-wrap gap-2 mt-4">
                {n.status !== 'CONNECTED' ? (
                  <ActionButton size="sm" variant="primary" path={`/whatsapp/numbers/${n.id}`} body={{ action: 'connect' }} success="Número conectado.">
                    Conectar
                  </ActionButton>
                ) : (
                  <>
                    <ActionButton size="sm" path={`/whatsapp/numbers/${n.id}`} body={{ action: n.paused ? 'resume' : 'pause' }} success={n.paused ? 'Envio retomado.' : 'Pausado — conversas seguem pelo backup.'}>
                      {n.paused ? 'Retomar' : 'Pausar'}
                    </ActionButton>
                    <ActionButton size="sm" variant="ghost" path={`/whatsapp/numbers/${n.id}`} body={{ action: 'disconnect' }} confirm="Desconectar este número? As conversas abertas seguem pelo backup.">
                      Desconectar
                    </ActionButton>
                  </>
                )}
                <NumberForm
                  id={n.id}
                  consultants={owners}
                  initial={{ name: n.name, phone: n.phone, purpose: n.purpose, dailyLimit: String(n.dailyLimit), webhookUrl: n.webhookUrl ?? '', consultantId: n.consultantId ?? '', priority: String(n.priority), providerNumberId: n.providerNumberId ?? '' }}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
