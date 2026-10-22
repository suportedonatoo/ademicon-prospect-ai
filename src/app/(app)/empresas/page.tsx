import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listProspects, recentSearches, trialSearchesLeft } from '@/modules/business-prospecting/prospecting.service';
import { Badge, Card, Empty, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton, FilterBar, Pagination } from '@/components/client';
import { formatCnpj, formatPhone, isLandlineBR } from '@/lib/normalize';
import { date } from '@/lib/format';
import { SearchCompanies } from './search';
import { CnpjLookup } from './cnpj-lookup';
import Link from 'next/link';
import { WhatsAppContactButton } from '@/components/whatsapp-contact';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { buttonClass } from '@/components/ui';
import { DAILY_TARGET, localDay } from '@/modules/business-prospecting/daily-list.service';
import { googleRequestsLeft } from '@/modules/integrations/maps/maps.provider';
import { getOrgSettings } from '@/modules/organizations/settings';
import { providers } from '@/modules/integrations/registry';
import type { Research } from '@/modules/business-prospecting/research';
import { ResearchAgentConfig } from './research-agent';
import { ResearchDetails, scoreTone } from './research-card';

/** Número para abrir no WhatsApp do próprio consultor (o contato frio é humano, nunca pelo bot). */
const waLink = (phone: string, text?: string) => {
  const d = phone.replace(/\D/g, '');
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

/** O Google Maps não informa CNPJ: pesquisa pronta para o consultor achar o número. */
const cnpjSearch = (p: { name: string; city: string; uf: string }) => `https://www.google.com/search?q=${encodeURIComponent(`"${p.name}" ${p.city} ${p.uf} CNPJ`)}`;

export const metadata = { title: 'Empresas' };

/** "Construtoras · Jundiaí/SP · 5 km · 21/10 14:05" */
function searchLabel(x: { filters: unknown; createdAt: Date; resultCount: number }) {
  const f = x.filters as { category?: string; city?: string; uf?: string; neighborhood?: string; radiusKm?: number };
  const when = x.createdAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return [f.category, [f.neighborhood, f.city].filter(Boolean).join(', ') + (f.uf ? `/${f.uf}` : ''), f.radiusKm ? `${f.radiusKm} km` : null, `${x.resultCount} result.`, when].filter(Boolean).join(' · ');
}

export default async function EmpresasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('prospecting.read');
  const sp = await searchParams;
  const { items, total, page } = await listProspects(ctx, { status: sp.status, city: sp.city, q: sp.q, page: Number(sp.page ?? 1), searchId: sp.busca || undefined });
  const searches = await recentSearches(ctx);
  const current = searches.find((x) => x.id === sp.busca);
  // Lista diária do consultor (montada toda manhã) e, para a gestão, o uso do teto de buscas do Google.
  const org = await db.organization.findUnique({ where: { id: ctx.orgId }, select: { timezone: true } });
  const day = localDay(new Date(), org?.timezone ?? 'America/Sao_Paulo').day;
  // Pesquisadas pelo agente primeiro (maior nota no topo); depois as do Google Maps.
  const today = ctx.consultantId ? (await listProspects(ctx, { day })).items.sort((a, b) => (b.researchScore ?? -1) - (a.researchScore ?? -1)) : [];
  const pending = today.filter((p) => p.status === 'NEW');
  const googleLeft = ctx.scope === 'ORG' ? await googleRequestsLeft() : null;
  // Gestão: configuração do Agente Pesquisador e o que ele entregou hoje para a equipe.
  const manage = ctx.scope === 'ORG' && can(ctx, 'settings.manage');
  const agent = manage ? (await getOrgSettings(ctx.orgId)).researchAgent : null;
  const pjCities = manage ? (await db.pJ.findMany({ where: { organizationId: ctx.orgId, active: true }, select: { city: true, uf: true }, distinct: ['city', 'uf'] })).map((p) => `${p.city}/${p.uf}`).join(', ') : '';
  const researchedToday = manage
    ? await db.businessProspect.findMany({ where: { organizationId: ctx.orgId, assignedDay: day, researchScore: { not: null } }, orderBy: { researchScore: 'desc' }, take: 60 })
    : [];
  const consultantNames = manage ? new Map((await db.consultant.findMany({ where: { id: { in: [...new Set(researchedToday.map((p) => p.assignedConsultantId!))] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name])) : new Map<string, string>();

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
      {agent && (
        <Card
          className="mt-4"
          title="Agente Pesquisador"
          subtitle={`Busca empresas dos segmentos com perfil para consórcio, completa o quadro societário (decisor), dá nota de 0 a 100 com os motivos e escreve roteiro e mensagem. Fonte: ${providers.companySearch.name}.`}
        >
          {providers.companySearch.mode !== 'real' && (
            <Notice tone="amber" title="Modo teste:">
              as empresas são <b>fictícias</b>, no mesmo formato da fonte paga (Casa dos Dados). Servem para ver o agente funcionando; os botões de ligar e WhatsApp ficam desligados para elas.
            </Notice>
          )}
          <div className="mt-3">
            <ResearchAgentConfig initial={agent} defaultCities={pjCities} />
          </div>
          {researchedToday.length > 0 && (
            <Table className="mt-4">
              <thead>
                <tr>
                  <Th>Nota</Th>
                  <Th>Empresa</Th>
                  <Th>Decisor</Th>
                  <Th>Por quê</Th>
                  <Th>Consultor</Th>
                </tr>
              </thead>
              <tbody>
                {researchedToday.map((p) => {
                  const r = p.research as Research | null;
                  return (
                    <tr key={p.id}>
                      <Td>
                        <Badge tone={scoreTone(p.researchScore!)}>{p.researchScore}</Badge>
                      </Td>
                      <Td>
                        <Link href={`/empresas/${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        <div className="text-xs text-muted">
                          {p.category} · {p.city}/{p.uf}
                        </div>
                      </Td>
                      <Td className="text-xs">{r?.decisionMaker?.name ?? '—'}</Td>
                      <Td className="text-xs text-muted max-w-96">{r?.reasons.slice(0, 2).join(' · ')}</Td>
                      <Td className="text-xs">{consultantNames.get(p.assignedConsultantId!) ?? '—'}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
      {ctx.consultantId && (
        <Card pad={false} className="mt-4" title={`Sua lista de hoje (${pending.length} de ${today.length} por contatar)`} subtitle={`Toda manhã você recebe até ${DAILY_TARGET} contatos: seus leads novos e empresas para prospectar. Ligue ou chame pelo seu WhatsApp e registre o resultado.`}>
          {today.length ? (
            <ul className="divide-y divide-line">
              {today.map((p) => (
                <li key={p.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="min-w-0 flex-1">
                    <Link href={`/empresas/${p.id}`} className="font-medium block truncate hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-xs text-muted block truncate">
                      {p.category} · {p.neighborhood ? `${p.neighborhood} · ` : ''}
                      {p.city}/{p.uf} · <span className="tabular">{formatPhone(p.phone)}</span>
                    </span>
                    <span className="text-xs flex gap-3 mt-0.5">
                      {p.sourceRef?.startsWith('google_places:') && (
                        <a className="text-brand-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.sourceRef.slice('google_places:'.length))}`}>
                          Ver no Google Maps
                        </a>
                      )}
                      {p.website && (
                        <a className="text-brand-600 hover:underline" target="_blank" rel="noreferrer" href={p.website}>
                          Site da empresa
                        </a>
                      )}
                    </span>
                    <ResearchDetails p={p} />
                  </span>
                  {p.status === 'NEW' && (p.research as Research | null)?.sample ? (
                    <span className="inline-flex flex-wrap gap-1.5">
                      <span className="text-xs text-muted px-1">exemplo · sem contato real</span>
                      <Link href={`/empresas/${p.id}`} className={buttonClass('primary', 'sm')}>
                        Ficha e SDR
                      </Link>
                    </span>
                  ) : p.status === 'NEW' && p.phone ? (
                    <span className="inline-flex flex-wrap gap-1.5">
                      <a href={`tel:${p.phone.replace(/\D/g, '')}`} className={buttonClass('secondary', 'sm')}>
                        Ligar
                      </a>
                      {isLandlineBR(p.phone) ? (
                        <span className="text-xs text-muted px-1" title="Telefone fixo não tem WhatsApp">fixo · só ligação</span>
                      ) : (
                        <WhatsAppContactButton url={waLink(p.phone, (p.research as Research | null)?.message)} prospectId={p.id} className={buttonClass('secondary', 'sm')}>
                          {p.research ? 'WhatsApp com mensagem' : 'WhatsApp'}
                        </WhatsAppContactButton>
                      )}
                      {!p.cnpj && (
                        <a href={cnpjSearch(p)} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}>
                          Achar CNPJ
                        </a>
                      )}
                      <Link href={`/empresas/${p.id}`} className={buttonClass(p.research != null ? 'primary' : 'ghost', 'sm')}>
                        Ficha e SDR
                      </Link>
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
      <Card pad={false} className="mt-4" title={current ? `Resultado da busca: ${searchLabel(current)} (${total})` : `Empresas coletadas (${total})`}>
        <div className="px-5 pt-3">
          <FilterBar
            fields={[
              { name: 'busca', label: 'Todas as buscas', options: searches.map((x) => ({ value: x.id, label: searchLabel(x) })) },
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
                      <Link href={`/empresas/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
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
