import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { db } from '@/lib/db';
import { leadScope, opportunityScope } from '@/modules/leads/scope';
import { Badge, Card, PageHeader } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Atividades' };

const TYPES = ['CREATED', 'NOTE', 'STATUS_CHANGED', 'ASSIGNED', 'MERGED', 'SCORED', 'HANDOFF', 'MESSAGE', 'SIMULATION', 'OPPORTUNITY', 'ENRICHED', 'PROACTIVE_CONTACT', 'TASK_DONE'];

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('activity.read');
  const sp = await searchParams;
  const [leadActs, oppActs] = await Promise.all([
    db.leadActivity.findMany({
      where: { organizationId: ctx.orgId, lead: leadScope(ctx), ...(sp.type ? { type: sp.type } : {}), ...(sp.actor ? { actorType: sp.actor } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 120,
      include: { lead: { select: { id: true, name: true } } },
    }),
    sp.type || sp.actor
      ? Promise.resolve([])
      : db.opportunityActivity.findMany({ where: { organizationId: ctx.orgId, opportunity: opportunityScope(ctx) }, orderBy: { createdAt: 'desc' }, take: 60, include: { opportunity: { select: { id: true, code: true, lead: { select: { name: true } } } } } }),
  ]);
  const feed = [
    ...leadActs.map((a) => ({ id: a.id, at: a.createdAt, type: a.type, actor: a.actorType, text: a.description, href: `/leads/${a.lead.id}`, who: a.lead.name })),
    ...oppActs.map((a) => ({ id: a.id, at: a.createdAt, type: a.type, actor: 'USER', text: a.description, href: `/oportunidades/${a.opportunity.id}`, who: `#${a.opportunity.code} · ${a.opportunity.lead.name}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <PageHeader title="Atividades" crumb="CRM" subtitle="Linha do tempo de tudo que aconteceu com leads e oportunidades do seu escopo." />
      <FilterBar
        className="mb-4"
        fields={[
          { name: 'type', label: 'Tipo', options: TYPES.map((t) => ({ value: t, label: t })) },
          { name: 'actor', label: 'Autor', options: [{ value: 'USER', label: 'Usuário' }, { value: 'SYSTEM', label: 'Sistema' }, { value: 'AI', label: 'IA' }] },
        ]}
      />
      <Card>
        <ol className="divide-y divide-line">
          {feed.map((f) => (
            <li key={f.id} className="py-2.5 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xs text-muted w-28 shrink-0 tabular">{dateTime(f.at)}</span>
              <Badge tone={f.actor === 'AI' ? 'violet' : f.actor === 'USER' ? 'green' : 'gray'}>{f.actor === 'AI' ? 'IA' : f.actor === 'USER' ? 'Usuário' : 'Sistema'}</Badge>
              <Link href={f.href} className="font-medium hover:text-brand-600">
                {f.who}
              </Link>
              <span className="text-ink-2 min-w-0 flex-1">{f.text}</span>
              <span className="text-[11px] text-faint">{f.type}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
