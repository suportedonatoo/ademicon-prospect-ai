import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { privacyOverview } from '@/modules/privacy/privacy.service';
import { getOrgSettings } from '@/modules/organizations/settings';
import { Badge, Card, Notice, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { dateTime, num } from '@/lib/format';
import { DataRequestForm } from './request-form';

export const metadata = { title: 'LGPD' };

const TYPE = { ACCESS: 'Acesso', CORRECTION: 'Correção', DELETION: 'Exclusão', PORTABILITY: 'Portabilidade', OPPOSITION: 'Oposição' } as const;

export default async function PrivacyPage() {
  const ctx = await requireCtx('privacy.read');
  const [o, settings] = await Promise.all([privacyOverview(ctx), getOrgSettings(ctx.orgId)]);
  const canManage = can(ctx, 'privacy.manage');
  return (
    <>
      <PageHeader title="LGPD e governança" crumb="Admin" subtitle="Consentimentos (opt-in/opt-out), preferências de comunicação, eventos de privacidade e solicitações de titulares." actions={canManage && <DataRequestForm />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Consentimentos ativos" value={num(o.consents)} />
        <Stat label="Consentimentos revogados" value={num(o.revoked)} />
        <Stat label="Opt-outs" value={num(o.optOuts)} />
        <Stat label="Política vigente" value={settings.privacy.policyVersion} hint={`SLA de solicitações: ${settings.privacy.dataRequestSlaDays} dias`} />
      </div>
      <Notice tone="blue">
        Regras aplicadas pela plataforma: contato proativo só com opt-in registrado (com evidência, origem e versão da política); opt-out pausa a IA e bloqueia mensagens; frequência semanal e horário de silêncio; dados importados ou de fontes públicas não recebem mensagens automáticas; logs não registram dados pessoais desnecessários.
      </Notice>
      <Card title="Solicitações de titulares (DataRequest)" pad={false} className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Titular</Th>
              <Th>Tipo</Th>
              <Th>Status</Th>
              <Th>Prazo</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {o.requests.map((r) => (
              <tr key={r.id}>
                <Td>
                  <b className="font-medium">{r.requesterName}</b>
                  <div className="text-xs text-muted">
                    {r.requesterEmail}
                    {r.leadId && (
                      <>
                        {' '}
                        ·{' '}
                        <Link className="text-brand-600 hover:underline" href={`/leads/${r.leadId}`}>
                          lead
                        </Link>
                      </>
                    )}
                  </div>
                </Td>
                <Td>{TYPE[r.type as keyof typeof TYPE]}</Td>
                <Td>
                  <Badge tone={r.status === 'DONE' ? 'green' : r.status === 'REJECTED' ? 'gray' : r.status === 'IN_PROGRESS' ? 'blue' : 'amber'}>{r.status}</Badge>
                </Td>
                <Td className={`text-xs ${r.dueAt < new Date() && !['DONE', 'REJECTED'].includes(r.status) ? 'text-bad font-semibold' : 'text-muted'}`}>{dateTime(r.dueAt)}</Td>
                <Td className="text-right whitespace-nowrap">
                  {canManage && !['DONE', 'REJECTED'].includes(r.status) && (
                    <span className="inline-flex gap-1.5">
                      {r.status === 'OPEN' && (
                        <ActionButton size="sm" method="PATCH" path={`/privacy/requests/${r.id}`} body={{ status: 'IN_PROGRESS' }}>
                          Iniciar
                        </ActionButton>
                      )}
                      <ActionButton size="sm" variant="primary" method="PATCH" path={`/privacy/requests/${r.id}`} body={{ status: 'DONE' }} confirm={r.type === 'DELETION' ? 'Concluir exclusão? Os dados pessoais do lead serão anonimizados (irreversível).' : undefined} success="Solicitação concluída.">
                        Concluir
                      </ActionButton>
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card title="Eventos de privacidade (PrivacyEvent)" className="mt-4" pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Evento</Th>
              <Th>Origem</Th>
              <Th>Finalidade</Th>
              <Th>Política</Th>
              <Th>Lead</Th>
              <Th>Data</Th>
            </tr>
          </thead>
          <tbody>
            {o.events.map((e) => (
              <tr key={e.id}>
                <Td>
                  <Badge tone={e.type.includes('REVOKED') || e.type === 'OPT_OUT' ? 'red' : e.type === 'CONSENT_GRANTED' ? 'green' : 'gray'}>{e.type}</Badge>
                </Td>
                <Td>{e.source}</Td>
                <Td>{e.purpose ?? '—'}</Td>
                <Td>{e.policyVersion ?? '—'}</Td>
                <Td>{e.leadId ? <Link className="text-brand-600 hover:underline text-xs" href={`/leads/${e.leadId}`}>ver</Link> : '—'}</Td>
                <Td className="text-xs text-muted">{dateTime(e.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
