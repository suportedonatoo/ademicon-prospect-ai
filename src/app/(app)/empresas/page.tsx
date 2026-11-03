import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listProspects, prospectQuality, qualityLevel, trialSearchesLeft } from '@/modules/business-prospecting/prospecting.service';
import { Badge, Card, Empty, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton, FilterBar, Pagination } from '@/components/client';
import { formatCnpj, formatPhone } from '@/lib/normalize';
import { date } from '@/lib/format';
import { SearchCompanies } from './search';
import { CnpjLookup } from './cnpj-lookup';
import Link from 'next/link';
import { env } from '@/lib/env';
import { googleRequestsLeft } from '@/modules/integrations/maps/maps.provider';

/** Selo de qualidade do contato (celular, avaliações, nota e site). */
function Quality({ p }: { p: { phone: string | null; website: string | null; rating: number | null; reviews: number | null } }) {
  const q = prospectQuality(p);
  const level = qualityLevel(q);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`Qualidade ${q}/100: celular, avaliações e nota no Google, site`}>
      <Badge tone={level === 'Alta' ? 'green' : level === 'Média' ? 'amber' : 'gray'}>{level}</Badge>
      {p.rating != null && (
        <span className="text-xs text-muted tabular">
          ★ {p.rating.toFixed(1)}
          {p.reviews != null ? ` (${p.reviews})` : ''}
        </span>
      )}
    </span>
  );
}

/** O Google Maps não informa CNPJ: pesquisa pronta para o consultor achar o número. */
const cnpjSearch = (p: { name: string; city: string; uf: string }) => `https://www.google.com/search?q=${encodeURIComponent(`"${p.name}" ${p.city} ${p.uf} CNPJ`)}`;

export const metadata = { title: 'Empresas' };

export default async function EmpresasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('prospecting.read');
  const sp = await searchParams;
  const { items, total, page } = await listProspects(ctx, { status: sp.status, city: sp.city, q: sp.q, page: Number(sp.page ?? 1) });
  // Para a gestão: uso do teto diário de buscas no Google.
  const googleLeft = ctx.scope === 'ORG' ? await googleRequestsLeft() : null;

  return (
    <>
      <PageHeader title="Business Prospecting" crumb="Prospecção → Empresas" subtitle="Busca de empresas em fontes autorizadas (APIs oficiais/licenciadas). Sem scraping." />
      <Notice tone="amber" title="Governança:">
        empresas coletadas são dados públicos empresariais. Ao converter em lead, <b>não há mensagens automáticas</b> sem consentimento — o contato inicial é humano e registrado.
      </Notice>
      {googleLeft !== null && (
        <p className="text-xs text-muted mt-3">
          Buscas no Google hoje: <b className="tabular">{env.GOOGLE_MAPS_DAILY_REQUESTS - googleLeft}</b> de {env.GOOGLE_MAPS_DAILY_REQUESTS} (teto diário para ficar na faixa gratuita).
        </p>
      )}
      {can(ctx, 'prospecting.search') && (
        <Card title="Nova busca" className="mt-4">
          <SearchCompanies left={await trialSearchesLeft(ctx)} />
        </Card>
      )}
      <Card title="Consultar CNPJ" subtitle="Cadastro Nacional de Empresas — dados públicos da Receita Federal" className="mt-4">
        <CnpjLookup />
      </Card>
      <Card pad={false} className="mt-4" title={`Empresas coletadas (${total})`}>
        <div className="px-5 pt-3">
          <FilterBar
            fields={[
              { name: 'q', label: 'Nome da empresa', type: 'search' },
              { name: 'status', label: 'Status', options: [{ value: 'NEW', label: 'Nova' }, { value: 'CONVERTED', label: 'Convertida em lead' }, { value: 'DISCARDED', label: 'Descartada' }] },
            ]}
          />
        </div>
        {items.length ? (
          <>
            <Table className="mt-3">
              <thead>
                <tr>
                  <Th>Empresa</Th>
                  <Th>Qualidade</Th>
                  <Th>Categoria</Th>
                  <Th>Local</Th>
                  <Th>Contato</Th>
                  <Th>CNPJ</Th>
                  <Th>Fonte</Th>
                  <Th>Status</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <b className="font-medium">{p.name}</b>
                      {p.website && <div className="text-xs text-muted truncate max-w-56">{p.website}</div>}
                    </Td>
                    <Td>
                      <Quality p={p} />
                    </Td>
                    <Td>
                      {p.category}
                      {p.size && <div className="text-xs text-muted">Porte {p.size}</div>}
                    </Td>
                    <Td>
                      {p.neighborhood ? `${p.neighborhood} · ` : ''}
                      {p.city}/{p.uf}
                    </Td>
                    <Td className="tabular">{formatPhone(p.phone)}</Td>
                    <Td className="tabular text-xs">
                      {p.cnpj ? (
                        formatCnpj(p.cnpj)
                      ) : (
                        <a href={cnpjSearch(p)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline whitespace-nowrap">
                          Achar CNPJ
                        </a>
                      )}
                    </Td>
                    <Td className="text-xs text-muted">
                      {p.source}
                      <div>{date(p.collectedAt)}</div>
                    </Td>
                    <Td>
                      {p.status === 'CONVERTED' ? (
                        <Link href={`/leads/${p.leadId}`}>
                          <Badge tone="green">Lead criado</Badge>
                        </Link>
                      ) : p.status === 'DISCARDED' ? (
                        <Badge>Descartada</Badge>
                      ) : (
                        <Badge tone="blue">Nova</Badge>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {p.status === 'NEW' && can(ctx, 'prospecting.convert') && (
                        <span className="inline-flex gap-1.5">
                          <ActionButton size="sm" variant="primary" path={`/prospecting/${p.id}`} body={{ action: 'convert' }} success="Empresa convertida em lead (sem mensagens automáticas).">
                            Converter
                          </ActionButton>
                          <ActionButton size="sm" variant="ghost" path={`/prospecting/${p.id}`} body={{ action: 'discard' }}>
                            Descartar
                          </ActionButton>
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={50} total={total} />
          </>
        ) : (
          <Empty title="Nenhuma empresa">Faça uma busca para coletar empresas.</Empty>
        )}
      </Card>
    </>
  );
}
