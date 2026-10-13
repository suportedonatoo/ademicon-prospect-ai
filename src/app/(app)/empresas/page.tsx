import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listProspects, trialSearchesLeft } from '@/modules/business-prospecting/prospecting.service';
import { Badge, Card, Empty, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton, FilterBar, Pagination } from '@/components/client';
import { formatCnpj, formatPhone } from '@/lib/normalize';
import { date } from '@/lib/format';
import { SearchCompanies } from './search';
import { CnpjLookup } from './cnpj-lookup';
import Link from 'next/link';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { buttonClass } from '@/components/ui';
import { DAILY_TARGET, localDay } from '@/modules/business-prospecting/daily-list.service';
import { googleRequestsLeft } from '@/modules/integrations/maps/maps.provider';

/** Número para abrir no WhatsApp do próprio consultor (o contato frio é humano, nunca pelo bot). */
const waLink = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
};

export const metadata = { title: 'Empresas' };

export default async function EmpresasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('prospecting.read');
  const sp = await searchParams;
  const { items, total, page } = await listProspects(ctx, { status: sp.status, city: sp.city, q: sp.q, page: Number(sp.page ?? 1) });
  // Lista diária do consultor (montada toda manhã) e, para a gestão, o uso do teto de buscas do Google.
  const org = await db.organization.findUnique({ where: { id: ctx.orgId }, select: { timezone: true } });
  const today = ctx.consultantId ? (await listProspects(ctx, { day: localDay(new Date(), org?.timezone ?? 'America/Sao_Paulo').day })).items : [];
  const pending = today.filter((p) => p.status === 'NEW');
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
      {ctx.consultantId && (
        <Card pad={false} className="mt-4" title={`Sua lista de hoje (${pending.length} de ${today.length} por contatar)`} subtitle={`Toda manhã você recebe até ${DAILY_TARGET} contatos: seus leads novos e empresas para prospectar. Ligue ou chame pelo seu WhatsApp e registre o resultado.`}>
          {today.length ? (
            <ul className="divide-y divide-line">
              {today.map((p) => (
                <li key={p.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="min-w-0 flex-1">
                    <b className="font-medium block truncate">{p.name}</b>
                    <span className="text-xs text-muted block truncate">
                      {p.category} · {p.neighborhood ? `${p.neighborhood} · ` : ''}
                      {p.city}/{p.uf} · <span className="tabular">{formatPhone(p.phone)}</span>
                    </span>
                  </span>
                  {p.status === 'NEW' && p.phone ? (
                    <span className="inline-flex flex-wrap gap-1.5">
                      <a href={`tel:${p.phone.replace(/\D/g, '')}`} className={buttonClass('secondary', 'sm')}>
                        Ligar
                      </a>
                      <a href={waLink(p.phone)} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
                        WhatsApp
                      </a>
                      {/* O Google Maps não informa CNPJ: abre a pesquisa para o consultor achar e consultar os sócios abaixo. */}
                      <a href={`https://www.google.com/search?q=${encodeURIComponent(`"${p.name}" ${p.city} ${p.uf} CNPJ`)}`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}>
                        Achar CNPJ
                      </a>
                      <ActionButton size="sm" variant="primary" path={`/prospecting/${p.id}`} body={{ action: 'convert' }} success="Virou lead seu (sem mensagens automáticas).">
                        Tem interesse
                      </ActionButton>
                      <ActionButton size="sm" variant="ghost" path={`/prospecting/${p.id}`} body={{ action: 'discard' }}>
                        Sem interesse
                      </ActionButton>
                    </span>
                  ) : p.status === 'CONVERTED' ? (
                    <Link href={`/leads/${p.leadId}`}>
                      <Badge tone="green">Lead criado</Badge>
                    </Link>
                  ) : (
                    <Badge>Sem interesse</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="A lista de hoje ainda não chegou">Ela é montada todos os dias às 7h. Enquanto isso, você pode fazer uma busca abaixo.</Empty>
          )}
        </Card>
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
