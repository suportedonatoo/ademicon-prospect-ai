import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listTemplates, networkLabel, teamOutreachReport } from '@/modules/outreach/outreach.service';
import { periodStart } from '@/modules/management/dashboards.service';
import { Badge, Card, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { num } from '@/lib/format';
import { PeriodTabs, parsePeriod } from '../period-tabs';
import { TemplateForm } from './client';

export const metadata = { title: 'Divulgação' };

export default async function TeamOutreachPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('analytics.read');
  const period = parsePeriod((await searchParams).p);
  const canEdit = can(ctx, 'campaign.update') && ctx.scope === 'ORG';
  const [r, templates] = await Promise.all([teamOutreachReport(ctx, periodStart(period)), listTemplates(ctx)]);
  const pending = templates.filter((t) => t.active && !t.approved);
  const live = templates.filter((t) => t.active && t.approved);

  return (
    <>
      <PageHeader
        title="Divulgação"
        crumb="Gestão"
        subtitle="O kit que os consultores publicam todo dia, e quanto cada canal e cada indicação trouxe de lead e venda."
        aside={<PeriodTabs current={period} base="/gestao/divulgacao" />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Leads por canais" value={num(r.totals.channelLeads)} hint="kit e links rastreados" />
        <Stat label="Leads por indicação" value={num(r.totals.referralLeads)} />
        <Stat label="Vendas vindas da divulgação" value={num(r.totals.sales)} tone="hero" />
        <Stat label="Consultores que geraram lead" value={`${num(r.totals.activeConsultants)}/${num(r.rows.length)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Card title="Por consultor" pad={false}>
          <Table>
            <thead>
              <tr>
                <Th>Consultor</Th>
                <Th className="text-right">Canais</Th>
                <Th className="text-right">Leads (canais)</Th>
                <Th className="text-right">Leads (indicação)</Th>
                <Th className="text-right">Vendas</Th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <Td>
                    <b>{c.name}</b> <span className="text-xs text-muted">· {c.pj}</span>
                  </Td>
                  <Td className="text-right tabular">{num(c.channels)}</Td>
                  <Td className="text-right tabular">{num(c.channelLeads)}</Td>
                  <Td className="text-right tabular">{num(c.referralLeads)}</Td>
                  <Td className="text-right tabular font-semibold">{num(c.sales)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Canais que mais trazem cliente" subtitle="Onde vale repetir: grupos, redes e indicações com lead no período." pad={false}>
          {r.topChannels.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Canal</Th>
                  <Th>Consultor</Th>
                  <Th className="text-right">Leads</Th>
                  <Th className="text-right">Vendas</Th>
                </tr>
              </thead>
              <tbody>
                {r.topChannels.map((c, i) => (
                  <tr key={i} className="border-t border-line">
                    <Td>
                      <b>{c.kind === 'INDICACAO' ? `Indicação: ${c.name}` : c.name}</b>
                      <div className="text-xs text-muted">{c.network}</div>
                    </Td>
                    <Td className="text-xs">{c.consultant}</Td>
                    <Td className="text-right tabular">{num(c.leads)}</Td>
                    <Td className="text-right tabular font-semibold">{num(c.sales)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="p-4 text-sm text-muted">Nenhum lead por canal ou indicação no período ainda.</p>
          )}
        </Card>
      </div>

      <Card
        title={`Modelos do kit (${live.length} no ar${pending.length ? ` · ${pending.length} aguardando aprovação` : ''})`}
        subtitle="Só modelos APROVADOS vão para o kit dos consultores. Cada um recebe 3 por dia, em ordem diferente, já com o link dele. Revise para seguir a comunicação da Ademicon."
        actions={canEdit && <TemplateForm />}
      >
        <ul className="divide-y divide-line">
          {templates.map((t) => (
            <li key={t.id} className="py-3 flex flex-wrap gap-3 justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm">{t.title}</b>
                  <Badge tone="blue">{t.network === 'QUALQUER' ? 'Qualquer rede' : networkLabel(t.network)}</Badge>
                  {t.audience && <Badge>{t.audience}</Badge>}
                  {!t.active ? <Badge>Arquivado</Badge> : t.approved ? <Badge tone="green" dot>No kit</Badge> : <Badge tone="amber" dot>Aguardando aprovação</Badge>}
                </div>
                <p className="text-sm text-ink-2 whitespace-pre-line mt-1">{t.body}</p>
              </div>
              {canEdit && (
                <div className="flex items-start gap-2">
                  <TemplateForm template={{ id: t.id, title: t.title, network: t.network, audience: t.audience ?? '', body: t.body }} />
                  {t.active && !t.approved && (
                    <ActionButton path={`/gestao/divulgacao/modelos/${t.id}`} method="PATCH" body={{ approved: true }} size="sm" variant="primary" success="Aprovado: entra no kit a partir de agora.">
                      Aprovar
                    </ActionButton>
                  )}
                  {t.active && t.approved && (
                    <ActionButton path={`/gestao/divulgacao/modelos/${t.id}`} method="PATCH" body={{ approved: false }} size="sm" success="Retirado do kit.">
                      Tirar do kit
                    </ActionButton>
                  )}
                  <ActionButton path={`/gestao/divulgacao/modelos/${t.id}`} method="PATCH" body={{ active: !t.active }} size="sm" variant="ghost" success={t.active ? 'Modelo arquivado.' : 'Modelo reativado.'}>
                    {t.active ? 'Arquivar' : 'Reativar'}
                  </ActionButton>
                </div>
              )}
            </li>
          ))}
          {!templates.length && <li className="py-4 text-sm text-muted">Nenhum modelo ainda. Crie o primeiro em “+ Novo modelo”.</li>}
        </ul>
      </Card>
    </>
  );
}
