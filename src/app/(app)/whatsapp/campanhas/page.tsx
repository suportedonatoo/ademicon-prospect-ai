import { requireCtx } from '@/modules/auth/session';
import { db } from '@/lib/db';
import { Badge, Card, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { DispatchForm } from './dispatch-form';

export const metadata = { title: 'Campanhas de WhatsApp' };

export default async function WaCampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('whatsapp.send_campaign');
  const sp = await searchParams;
  const [campaigns, templates, messages] = await Promise.all([
    db.campaign.findMany({ where: { organizationId: ctx.orgId, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.messageTemplate.findMany({ where: { organizationId: ctx.orgId, status: 'APPROVED' }, select: { id: true, name: true, body: true, category: true } }),
    db.campaignMessage.findMany({ where: { organizationId: ctx.orgId, channel: 'WHATSAPP' }, orderBy: { createdAt: 'desc' }, take: 30, include: { campaign: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Campanhas de WhatsApp" crumb="WhatsApp Hub" subtitle="Disparo controlado: template aprovado + público com opt-in de marketing + limites de frequência, horário e volume diário." />
      <Notice tone="blue" title="Regras aplicadas a cada destinatário:">
        opt-in de marketing ativo, sem opt-out, preferência de canal, limite semanal de contatos, horário de silêncio e limite diário do número. Quem não passa nas regras é ignorado e contabilizado. A campanha pode ser pausada a qualquer momento.
      </Notice>
      <Card title="Novo disparo" className="mt-4">
        <DispatchForm campaigns={campaigns} templates={templates} defaultCampaign={sp.campaign} />
      </Card>
      <Card title="Histórico de disparos" pad={false} className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Campanha</Th>
              <Th>Status</Th>
              <Th className="text-right">Enviadas</Th>
              <Th className="text-right">Bloqueadas por regras</Th>
              <Th>Criado</Th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <Td>
                  <b className="font-medium">{m.campaign.name}</b>
                  <div className="text-xs text-muted truncate max-w-md">{m.content}</div>
                </Td>
                <Td>
                  <Badge tone={m.status === 'SENT' ? 'green' : m.status === 'PAUSED' ? 'amber' : 'blue'}>{m.status}</Badge>
                </Td>
                <Td className="text-right tabular">{m.sentCount}</Td>
                <Td className="text-right tabular">{m.skippedCount}</Td>
                <Td className="text-xs text-muted">{dateTime(m.createdAt)}</Td>
              </tr>
            ))}
            {messages.length === 0 && (
              <tr>
                <Td className="text-muted">Nenhum disparo ainda.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
