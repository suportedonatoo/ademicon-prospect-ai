import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listPjs, listRegions } from '@/modules/pjs/pj.service';
import { Badge, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { FilterBar, Pagination } from '@/components/client';
import { num } from '@/lib/format';
import { env } from '@/lib/env';
import { formatPhone } from '@/lib/normalize';
import { PjForm } from './pj-form';

export const metadata = { title: 'PJs' };

const formatPhoneOrEmpty = (p: string | null) => (p ? formatPhone(p) : '');

export default async function PjsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('pj.read');
  const sp = await searchParams;
  const [{ items, total, page, pageSize }, regions] = await Promise.all([listPjs(ctx, { q: sp.q, regionId: sp.regionId, page: Number(sp.page ?? 1) }), listRegions(ctx)]);
  const canManage = can(ctx, 'pj.manage');
  return (
    <>
      <PageHeader title="PJs / Unidades" crumb="Distribuição" subtitle="Organização → Regiões → PJs → Consultores. Paginado e agregado no banco — preparado para 70, 100, 300 ou 1000+ PJs." actions={canManage && <PjForm landingDomain={env.LANDING_URL_TEMPLATE} regions={regions.map((r) => ({ id: r.id, name: r.name }))} />} />
      <div className="flex flex-wrap gap-2 mb-4">
        {regions.map((r) => (
          <Link key={r.id} href={`/distribuicao/pjs?regionId=${r.id}`}>
            <Badge tone={sp.regionId === r.id ? 'blue' : 'gray'}>
              {r.name} · {r._count.pjs} PJs
            </Badge>
          </Link>
        ))}
      </div>
      <FilterBar className="mb-3" fields={[{ name: 'q', label: 'Código, nome ou cidade', type: 'search' }]} />
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>PJ</Th>
              <Th>Região</Th>
              <Th>Cidades atendidas</Th>
              <Th className="text-right">Consultores</Th>
              <Th className="text-right">Leads abertos</Th>
              <Th className="text-right">Leads (30d)</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <Td>
                  <b className="font-medium">
                    {p.code} · {p.name}
                  </b>
                  <div className="text-xs text-muted">
                    {p.city}/{p.uf}
                  </div>
                </Td>
                <Td>{p.region?.name ?? '—'}</Td>
                <Td className="text-xs text-ink-2 max-w-64">{p.citiesServed.join(', ') || '—'}</Td>
                <Td className="text-right tabular">
                  <Link className="text-brand-600 hover:underline" href={`/distribuicao/consultores?pjId=${p.id}`}>
                    {p._count.consultants}
                  </Link>
                </Td>
                <Td className="text-right tabular">{num(p.openLeads)}</Td>
                <Td className="text-right tabular">{num(p.leads30d)}</Td>
                <Td>
                  <Badge tone={p.active ? 'green' : 'gray'}>{p.active ? 'Ativa' : 'Inativa'}</Badge>
                </Td>
                <Td className="text-right">{canManage && <PjForm
                      id={p.id}
                      landingDomain={env.LANDING_URL_TEMPLATE}
                      regions={regions.map((r) => ({ id: r.id, name: r.name }))}
                      initial={{
                        code: p.code,
                        name: p.name,
                        city: p.city,
                        uf: p.uf,
                        regionId: p.regionId ?? '',
                        citiesServed: p.citiesServed.join(', '),
                        active: p.active,
                        subdomain: p.subdomain ?? '',
                        landingActive: p.landingActive,
                        landingTitle: p.landingTitle ?? '',
                        landingSubtitle: p.landingSubtitle ?? '',
                        phone: formatPhoneOrEmpty(p.phone),
                        whatsapp: formatPhoneOrEmpty(p.whatsapp),
                        address: p.address ?? '',
                      }}
                    />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Card>
    </>
  );
}
