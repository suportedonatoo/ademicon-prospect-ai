import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listLeads } from '@/modules/leads/leads.service';
import { filterOptions } from '@/modules/analytics/options';
import { LANDING_HEATS, LEAD_STATUS, TEMPERATURES, productLabel } from '@/modules/leads/catalog';
import { Avatar, Card, Empty, PageHeader, Table, Td, Th, buttonClass } from '@/components/ui';
import { FilterBar, Pagination } from '@/components/client';
import { LandingHeatBadge, ScoreBadge, SourceBadge, StatusBadge, TempBadge } from '@/components/badges';
import { brl, timeAgo } from '@/lib/format';
import { formatPhone } from '@/lib/normalize';
import { NewLeadButton } from './new-lead';

export const metadata = { title: 'Leads' };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('lead.read');
  const sp = await searchParams;
  const [{ items, total, page, pageSize }, o] = await Promise.all([listLeads(ctx, sp), filterOptions(ctx)]);
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== 'page')).toString();

  return (
    <>
      <PageHeader
        title="Leads"
        crumb="Prospecção"
        subtitle={ctx.scope === 'ORG' ? 'Todos os leads da organização.' : ctx.scope === 'PJ' ? 'Leads da sua PJ.' : 'Somente os seus leads.'}
        actions={
          <>
            {can(ctx, 'lead.export') && (
              <>
                <a className={buttonClass('secondary')} href={`/api/v1/leads/export?format=csv&${exportQs}`}>
                  Exportar CSV
                </a>
                <a className={buttonClass('secondary')} href={`/api/v1/leads/export?format=xlsx&${exportQs}`}>
                  XLSX
                </a>
              </>
            )}
            {can(ctx, 'lead.create') && <NewLeadButton />}
          </>
        }
      />
      <FilterBar
        className="mb-4"
        fields={[
          { name: 'q', label: 'Buscar nome, telefone, e-mail…', type: 'search' },
          { name: 'status', label: 'Status', options: Object.entries(LEAD_STATUS).map(([value, label]) => ({ value, label })) },
          { name: 'temperature', label: 'Temperatura', options: Object.entries(TEMPERATURES).map(([value, label]) => ({ value, label })) },
          { name: 'landingHeat', label: 'Landing PJ', options: [{ value: 'ANY', label: 'Todos da landing' }, { value: 'QUENTE', label: LANDING_HEATS.QUENTE }, { value: 'MORNO', label: LANDING_HEATS.MORNO }] },
          { name: 'source', label: 'Origem', options: [{ value: 'GOOGLE_ALL', label: 'Google (orgânico + pago)' }, ...o.source] },
          { name: 'product', label: 'Produto', options: o.product },
          ...(ctx.scope === 'ORG' ? [{ name: 'pjId', label: 'PJ', options: o.pjId }] : []),
          ...(ctx.scope !== 'OWN' ? [{ name: 'consultantId', label: 'Consultor', options: o.consultantId }] : []),
          { name: 'campaignId', label: 'Campanha', options: o.campaignId },
          { name: 'sort', label: 'Mais recentes', options: [{ value: 'score', label: 'Maior score' }, { value: 'value', label: 'Maior valor' }, { value: 'name', label: 'Nome' }] },
        ]}
      />
      <Card pad={false}>
        {items.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Lead</Th>
                  <Th>Interesse</Th>
                  <Th>Origem</Th>
                  <Th>Score</Th>
                  <Th>Status</Th>
                  <Th>Responsável</Th>
                  <Th className="text-right">Criado</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <Td>
                      <Link href={`/leads/${l.id}`} className="flex items-center gap-3 group">
                        <Avatar name={l.name} size={32} />
                        <span className="min-w-0">
                          <b className="block font-medium text-ink group-hover:text-brand-600 truncate">{l.name}</b>
                          <span className="text-xs text-muted">
                            #{l.code} · {formatPhone(l.phone)}
                            {l.optOut && <span className="ml-1 text-bad">· opt-out</span>}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <div className="text-ink">{productLabel(l.product)}</div>
                      <div className="text-xs text-muted tabular">
                        {l.desiredValue ? brl(l.desiredValue) : 'valor não informado'}
                        {l.city ? ` · ${l.city}` : ''}
                      </div>
                    </Td>
                    <Td>
                      <SourceBadge source={l.source} />
                      {l.campaign && <div className="text-xs text-muted mt-1 truncate max-w-48">{l.campaign.name}</div>}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ScoreBadge score={l.score} temperature={l.temperature} size="sm" />
                        <TempBadge temperature={l.temperature} />
                      </div>
                      {l.landingHeat && (
                        <div className="mt-1">
                          <LandingHeatBadge heat={l.landingHeat} />
                        </div>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={l.status} />
                    </Td>
                    <Td>
                      {l.consultant ? (
                        <span className="text-sm">
                          {l.consultant.name}
                          <span className="block text-xs text-muted">{l.pj?.code}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Não distribuído</span>
                      )}
                    </Td>
                    <Td className="text-right text-xs text-muted whitespace-nowrap">{timeAgo(l.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        ) : (
          <Empty title="Nenhum lead encontrado">Ajuste os filtros ou crie um novo lead.</Empty>
        )}
      </Card>
    </>
  );
}
