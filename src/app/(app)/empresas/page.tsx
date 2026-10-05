import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listProspects } from '@/modules/business-prospecting/prospecting.service';
import { Badge, Card, Empty, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton, FilterBar, Pagination } from '@/components/client';
import { formatCnpj, formatPhone } from '@/lib/normalize';
import { date } from '@/lib/format';
import { SearchCompanies } from './search';
import { CnpjLookup } from './cnpj-lookup';
import Link from 'next/link';

export const metadata = { title: 'Empresas' };

export default async function EmpresasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('prospecting.read');
  const sp = await searchParams;
  const { items, total, page } = await listProspects(ctx, { status: sp.status, city: sp.city, q: sp.q, page: Number(sp.page ?? 1) });

  return (
    <>
      <PageHeader title="Business Prospecting" crumb="Prospecção → Empresas" subtitle="Busca de empresas em fontes autorizadas (APIs oficiais/licenciadas). Sem scraping." />
      <Notice tone="amber" title="Governança:">
        empresas coletadas são dados públicos empresariais. Ao converter em lead, <b>não há mensagens automáticas</b> sem consentimento — o contato inicial é humano e registrado.
      </Notice>
      {can(ctx, 'prospecting.search') && (
        <Card title="Nova busca" className="mt-4">
          <SearchCompanies />
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
                      {p.category}
                      {p.size && <div className="text-xs text-muted">Porte {p.size}</div>}
                    </Td>
                    <Td>
                      {p.neighborhood ? `${p.neighborhood} · ` : ''}
                      {p.city}/{p.uf}
                    </Td>
                    <Td className="tabular">{formatPhone(p.phone)}</Td>
                    <Td className="tabular text-xs">{p.cnpj ? formatCnpj(p.cnpj) : '—'}</Td>
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
