import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listSponsoredAds } from '@/modules/management/sponsored-ads.service';
import { db } from '@/lib/db';
import { Badge, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { brl, date, num, pct } from '@/lib/format';
import { AdForm, CopyLink } from './client';

export const metadata = { title: 'Anúncios' };

const SOURCE = { GOOGLE_ADS: 'Google Ads', META: 'Meta (Facebook)', INSTAGRAM: 'Instagram', OUTRO: 'Outro' } as Record<string, string>;

export default async function SponsoredAdsPage() {
  const ctx = await requireCtx('campaign.read');
  const canEdit = can(ctx, 'campaign.update') && ctx.scope === 'ORG';
  const [ads, consultants] = await Promise.all([
    listSponsoredAds(ctx),
    db.consultant.findMany({ where: { organizationId: ctx.orgId, active: true }, select: { id: true, name: true, pj: { select: { code: true } } }, orderBy: { name: 'asc' } }),
  ]);
  const options = consultants.map((c) => ({ id: c.id, name: `${c.name} · ${c.pj.code}` }));
  return (
    <>
      <PageHeader
        title="Anúncios patrocinados"
        crumb="Gestão"
        subtitle="Anúncio pago por 1 consultor (individual) ou por vários (grupo): os leads vão só para quem pagou, divididos igualmente. Leads orgânicos continuam divididos entre todos."
        actions={canEdit && <AdForm consultants={options} />}
      />
      {!ads.length && (
        <Card>
          <p className="text-sm text-muted">Nenhum anúncio cadastrado. Use &quot;Novo anúncio&quot;, marque quem pagou e use o link gerado no Google/Meta.</p>
        </Card>
      )}
      <div className="grid gap-4">
        {ads.map((a) => (
          <Card
            key={a.id}
            title={a.name}
            subtitle={`${SOURCE[a.source] ?? a.source}${a.externalId ? ` · ID da campanha ${a.externalId}` : ''}${a.startAt ? ` · desde ${date(a.startAt)}` : ''}`}
            actions={
              <div className="flex items-center gap-2">
                <Badge tone={a.kind === 'GRUPO' ? 'blue' : 'green'}>{a.kind === 'GRUPO' ? `Grupo · ${a.sponsors.length}` : 'Individual'}</Badge>
                <Badge tone={a.status === 'ACTIVE' ? 'green' : 'gray'} dot>
                  {a.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}
                </Badge>
              </div>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted">Leads</div>
                <b className="tabular text-lg">{num(a.leads)}</b>
              </div>
              <div>
                <div className="text-xs text-muted">Vendas</div>
                <b className="tabular text-lg">{num(a.sales)}</b>
              </div>
              <div>
                <div className="text-xs text-muted">CVR</div>
                <b className="tabular text-lg">{pct(a.cvr * 100)}</b>
              </div>
              <div>
                <div className="text-xs text-muted">Investido</div>
                <b className="tabular text-lg">{a.invested ? brl(a.invested) : a.budget ? `${brl(a.budget)} (verba)` : '—'}</b>
              </div>
              <div>
                <div className="text-xs text-muted">Custo por lead</div>
                <b className="tabular text-lg">{a.cpl ? brl(a.cpl, 2) : '—'}</b>
              </div>
            </div>
            {a.link && (
              <div className="mt-4">
                <div className="text-xs text-muted mb-1">Link do anúncio (use como URL final no Google/Meta)</div>
                <CopyLink value={a.link} />
              </div>
            )}
            <Table className="mt-4">
              <thead>
                <tr>
                  <Th>Quem pagou</Th>
                  <Th className="text-right">Leads recebidos</Th>
                  <Th className="text-right">Vendas</Th>
                  <Th className="text-right">Valor vendido</Th>
                  <Th className="text-right">Investimento (parte)</Th>
                </tr>
              </thead>
              <tbody>
                {a.sponsors.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.name}</Td>
                    <Td className="text-right tabular">{num(s.leads)}</Td>
                    <Td className="text-right tabular">{num(s.sales)}</Td>
                    <Td className="text-right tabular">{brl(s.soldValue)}</Td>
                    <Td className="text-right tabular">
                      {a.sharePerSponsor ? brl(a.sharePerSponsor) : '—'}
                      {a.shareFromBudget ? '*' : ''}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {a.shareFromBudget && <p className="text-xs text-muted mt-2">* Estimado pela verba cadastrada, dividida igualmente. Com o ID da campanha e as métricas sincronizadas, passa a usar o custo real do Google/Meta.</p>}
            {canEdit && (
              <div className="flex flex-wrap gap-2 mt-4">
                <AdForm
                  consultants={options}
                  ad={{ id: a.id, name: a.name, source: a.source, externalId: a.externalId ?? '', budget: String(a.budget || ''), consultantIds: a.sponsors.map((s) => s.id) }}
                />
                <ActionButton size="sm" variant="ghost" path={`/gestao/anuncios/${a.id}`} body={{ active: a.status !== 'ACTIVE' }} success={a.status === 'ACTIVE' ? 'Anúncio pausado.' : 'Anúncio retomado.'}>
                  {a.status === 'ACTIVE' ? 'Pausar' : 'Retomar'}
                </ActionButton>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
