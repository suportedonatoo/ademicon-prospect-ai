import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listCampaigns, CAMPAIGN_STATUS_LABEL, CAMPAIGN_SOURCES } from '@/modules/campaigns/campaign.service';
import { db } from '@/lib/db';
import { Badge, Card, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { brl, brlShort, num } from '@/lib/format';
import { productLabel } from '@/modules/leads/catalog';
import { CampaignFormButton } from './campaign-form';
import { STATUS_TONE } from './constants';

export const metadata = { title: 'Campanhas' };


export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('campaign.read');
  const sp = await searchParams;
  const [rows, regions, pjs, landings] = await Promise.all([
    listCampaigns(ctx, { status: sp.status, source: sp.source }),
    db.region.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true } }),
    db.pJ.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, code: true, city: true }, orderBy: { code: 'asc' } }),
    db.landingPage.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true } }),
  ]);
  const totals = rows.reduce((t, r) => ({ spend: t.spend + r.spend, leads: t.leads + r.leads, qualified: t.qualified + r.qualified, conversions: t.conversions + r.conversions }), { spend: 0, leads: 0, qualified: 0, conversions: 0 });
  const options = { regions, pjs: pjs.map((p) => ({ id: p.id, name: `${p.code} · ${p.city}` })), landings };

  return (
    <>
      <PageHeader title="Campanhas" crumb="Aquisição" subtitle="Campaign Engine: DRAFT → SCHEDULED → ACTIVE ⇄ PAUSED → COMPLETED. Métricas dos providers (mock/real) com a mesma interface." actions={can(ctx, 'campaign.create') && <CampaignFormButton options={options} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Investimento" value={brlShort(totals.spend)} hint="gasto sincronizado" />
        <Stat label="Leads" value={num(totals.leads)} hint={`CPL ${totals.leads ? brl(totals.spend / totals.leads, 2) : '—'}`} />
        <Stat label="Qualificados" value={num(totals.qualified)} hint={`CPQL ${totals.qualified ? brl(totals.spend / totals.qualified, 2) : '—'}`} />
        <Stat label="Conversões" value={num(totals.conversions)} hint={`CAC ${totals.conversions ? brl(totals.spend / totals.conversions) : '—'}`} />
      </div>
      <FilterBar
        className="mb-3"
        fields={[
          { name: 'status', label: 'Status', options: Object.entries(CAMPAIGN_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
          { name: 'source', label: 'Canal', options: Object.entries(CAMPAIGN_SOURCES).map(([value, label]) => ({ value, label })) },
        ]}
      />
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Campanha</Th>
              <Th>Status</Th>
              <Th className="text-right">Orçamento</Th>
              <Th className="text-right">Gasto</Th>
              <Th className="text-right">Cliques</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">CPL</Th>
              <Th className="text-right">Qualificados</Th>
              <Th className="text-right">CPQL</Th>
              <Th className="text-right">Conversões</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/70">
                <Td>
                  <Link href={`/campanhas/${c.id}`} className="font-medium hover:text-brand-600">
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {CAMPAIGN_SOURCES[c.source as keyof typeof CAMPAIGN_SOURCES]} · {productLabel(c.product)}
                  </div>
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[c.status]} dot>
                    {CAMPAIGN_STATUS_LABEL[c.status]}
                  </Badge>
                </Td>
                <Td className="text-right tabular">{brl(c.budget)}</Td>
                <Td className="text-right tabular">{brl(c.spend)}</Td>
                <Td className="text-right tabular">{num(c.clicks)}</Td>
                <Td className="text-right tabular">{num(c.leads)}</Td>
                <Td className="text-right tabular">{c.cpl != null ? brl(c.cpl, 2) : '—'}</Td>
                <Td className="text-right tabular">{num(c.qualified)}</Td>
                <Td className="text-right tabular">{c.cpql != null ? brl(c.cpql, 2) : '—'}</Td>
                <Td className="text-right tabular">{num(c.conversions)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
