import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listConsultants } from '@/modules/consultants/consultant.service';
import { db } from '@/lib/db';
import { productLabel } from '@/modules/leads/catalog';
import { Badge, Card, PageHeader, Table, Td, Th, cx } from '@/components/ui';
import { ActionButton, FilterBar } from '@/components/client';
import { timeAgo } from '@/lib/format';
import { ConsultantForm } from './consultant-form';
import Link from 'next/link';
import { BACKUP_RECOMMENDED } from '@/modules/whatsapp/number-pool';

export const metadata = { title: 'Consultores' };

export default async function ConsultantsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('consultant.read');
  const sp = await searchParams;
  const [list, pjs] = await Promise.all([listConsultants(ctx, { pjId: sp.pjId, q: sp.q }), db.pJ.findMany({ where: { organizationId: ctx.orgId, ...(ctx.scope === 'PJ' ? { id: ctx.pjId ?? '' } : {}) }, select: { id: true, code: true, city: true }, orderBy: { code: 'asc' } })]);
  const canManage = can(ctx, 'consultant.manage');
  const pjOptions = pjs.map((p) => ({ id: p.id, name: `${p.code} · ${p.city}` }));
  return (
    <>
      <PageHeader title="Consultores" crumb="Distribuição" subtitle="Especialização, capacidade (leads abertos) e disponibilidade alimentam o Lead Router." actions={canManage && <ConsultantForm pjs={pjOptions} />} />
      <FilterBar className="mb-3" fields={[{ name: 'q', label: 'Nome', type: 'search' }, ...(ctx.scope === 'ORG' ? [{ name: 'pjId', label: 'PJ', options: pjs.map((p) => ({ value: p.id, label: `${p.code} · ${p.city}` })) }] : [])]} />
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Consultor</Th>
              <Th>PJ</Th>
              <Th>Especialidades</Th>
              <Th>Carga</Th>
              <Th className="text-right">Leads no mês</Th>
              <Th className="text-right">WhatsApp</Th>
              <Th className="text-right">Conversões</Th>
              <Th>Disponível</Th>
              <Th>Último acesso</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const load = c.openLeads / c.maxOpenLeads;
              return (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/perfil?c=${c.id}`} className="font-medium hover:text-brand-600">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted">{c.email}</div>
                  </Td>
                  <Td>{c.pj.code}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {c.products.length ? c.products.map((p) => <Badge key={p}>{productLabel(p)}</Badge>) : <span className="text-xs text-muted">Todos</span>}
                    </div>
                  </Td>
                  <Td className="min-w-40">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                        <div className={cx('h-full', load >= 1 ? 'bg-bad' : load > 0.8 ? 'bg-series-4' : 'bg-series-1')} style={{ width: `${Math.min(100, load * 100)}%` }} />
                      </div>
                      <span className="text-xs tabular text-muted">
                        {c.openLeads}/{c.maxOpenLeads}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-right tabular">{c.monthLeads}</Td>
                  <Td className="text-right tabular">
                    <span className={c.numbers < BACKUP_RECOMMENDED ? 'text-warn font-semibold' : undefined} title={c.numbers < BACKUP_RECOMMENDED ? 'Sem número de backup' : undefined}>
                      {c.numbers}
                    </span>
                  </Td>
                  <Td className="text-right tabular">{c.conversions}</Td>
                  <Td>
                    {canManage || ctx.consultantId === c.id ? (
                      <ActionButton size="sm" variant={c.available ? 'secondary' : 'ghost'} method="PATCH" path={`/consultants/${c.id}`} body={{ available: !c.available }} success={c.available ? 'Marcado como indisponível (não recebe leads).' : 'Disponível para receber leads.'}>
                        {c.available ? '● Disponível' : '○ Indisponível'}
                      </ActionButton>
                    ) : (
                      <Badge tone={c.available ? 'green' : 'gray'}>{c.available ? 'Sim' : 'Não'}</Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-muted">{c.user?.lastLoginAt ? timeAgo(c.user.lastLoginAt) : 'nunca'}</Td>
                  <Td className="text-right">
                    {canManage && (
                      <ConsultantForm
                        id={c.id}
                        pjs={pjOptions}
                        initial={{ pjId: c.pjId, name: c.name, email: c.email, phone: c.phone ?? '', products: c.products, maxOpenLeads: String(c.maxOpenLeads), priority: String(c.priority), available: c.available, active: c.active }}
                      />
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
