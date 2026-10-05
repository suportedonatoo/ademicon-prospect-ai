import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listLandings } from '@/modules/landing-pages/landing.service';
import { productLabel } from '@/modules/leads/catalog';
import { Badge, Card, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { num, pct, timeAgo } from '@/lib/format';

export const metadata = { title: 'Landing Pages' };

export default async function LandingsPage() {
  const ctx = await requireCtx('landing.read');
  const pages = await listLandings(ctx);
  return (
    <>
      <PageHeader title="Landing Pages" crumb="Aquisição" subtitle="Construtor com simulador, formulário, tracking de UTMs, SEO e preview desktop/mobile." actions={can(ctx, 'landing.manage') && <LinkButton href="/landing-pages/novo" variant="primary">+ Nova landing</LinkButton>} />
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Página</Th>
              <Th>URL</Th>
              <Th>Status</Th>
              <Th className="text-right">Visitas</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Conversão</Th>
              <Th>Atualizada</Th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/70">
                <Td>
                  <Link href={`/landing-pages/${p.id}`} className="font-medium hover:text-brand-600">
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {productLabel(p.product)} · {p.simulator?.name ?? 'sem simulador'}
                  </div>
                </Td>
                <Td>
                  <a className="text-xs font-mono text-brand-600 hover:underline" href={`/landing/${p.slug}${p.status === 'PUBLISHED' ? '' : '?preview=1'}`} target="_blank">
                    /landing/{p.slug}
                  </a>
                </Td>
                <Td>
                  <Badge tone={p.status === 'PUBLISHED' ? 'green' : p.status === 'ARCHIVED' ? 'gray' : 'amber'} dot>
                    {p.status === 'PUBLISHED' ? 'Publicada' : p.status === 'ARCHIVED' ? 'Arquivada' : 'Rascunho'}
                  </Badge>
                </Td>
                <Td className="text-right tabular">{num(p.views)}</Td>
                <Td className="text-right tabular">{num(p.leads)}</Td>
                <Td className="text-right tabular">{pct(p.conversionRate)}</Td>
                <Td className="text-xs text-muted">{timeAgo(p.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
