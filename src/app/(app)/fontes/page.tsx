import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { db } from '@/lib/db';
import { LEAD_SOURCES } from '@/modules/leads/acquisition-engine';
import { sourceLabel } from '@/modules/leads/catalog';
import { providers } from '@/modules/integrations/registry';
import { leadScope } from '@/modules/leads/scope';
import { Badge, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { num, timeAgo } from '@/lib/format';
import { TestIngestion } from './test-ingestion';

export const metadata = { title: 'Fontes' };

const MODE: Record<string, { mode: string; provider: string }> = {
  GOOGLE_ADS: { mode: providers.googleAds.mode, provider: providers.googleAds.name },
  META: { mode: providers.meta.mode, provider: providers.meta.name },
  INSTAGRAM: { mode: providers.instagram.mode, provider: providers.instagram.name },
  WHATSAPP: { mode: providers.whatsapp.mode, provider: providers.whatsapp.name },
  MAPS: { mode: providers.googleMaps.mode, provider: `${providers.googleMaps.name} / ${providers.bingMaps.name}` },
};

export default async function FontesPage() {
  const ctx = await requireCtx('lead.read');
  const since = new Date(Date.now() - 30 * 86400_000);
  const [total, recent, last] = await Promise.all([
    db.lead.groupBy({ by: ['source'], where: leadScope(ctx), _count: { _all: true } }),
    db.lead.groupBy({ by: ['source'], where: { ...leadScope(ctx), createdAt: { gte: since } }, _count: { _all: true } }),
    db.leadSource.groupBy({ by: ['source'], where: { organizationId: ctx.orgId }, _max: { receivedAt: true } }),
  ]);

  return (
    <>
      <PageHeader title="Fontes de leads" crumb="Prospecção" subtitle="AcquisitionEngine: cada fonte implementa um LeadSourceProvider que traduz o payload nativo para o Lead Engine (validação → normalização → deduplicação → score → roteamento)." />
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Fonte</Th>
              <Th>LeadSourceProvider</Th>
              <Th>Integração</Th>
              <Th className="text-right">Leads (30 dias)</Th>
              <Th className="text-right">Total</Th>
              <Th>Último recebido</Th>
            </tr>
          </thead>
          <tbody>
            {Object.values(LEAD_SOURCES).map((p) => {
              const m = MODE[p.key];
              return (
                <tr key={p.key}>
                  <Td>
                    <b className="font-medium">{sourceLabel(p.key)}</b>
                  </Td>
                  <Td className="font-mono text-xs">{p.name}</Td>
                  <Td>{m ? <Badge tone={m.mode === 'mock' ? 'amber' : m.mode === 'real' ? 'green' : 'gray'}>{m.mode === 'mock' ? `Mock · ${m.provider}` : m.provider}</Badge> : <Badge tone="green">Nativa</Badge>}</Td>
                  <Td className="text-right tabular">{num(recent.find((r) => r.source === p.key)?._count._all ?? 0)}</Td>
                  <Td className="text-right tabular">{num(total.find((r) => r.source === p.key)?._count._all ?? 0)}</Td>
                  <Td className="text-xs text-muted">{timeAgo(last.find((l) => l.source === p.key)?._max.receivedAt ?? null)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {can(ctx, 'lead.create') && (
        <Card title="Testar ingestão" subtitle="Envia um payload no formato nativo da fonte pelo AcquisitionEngine (mesma rota usada por integrações: POST /api/v1/acquisition/:source)." className="mt-4">
          <TestIngestion />
        </Card>
      )}
    </>
  );
}
