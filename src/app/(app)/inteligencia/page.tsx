import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { db } from '@/lib/db';
import { leadScope } from '@/modules/leads/scope';
import { priorityLeads, recommendNextActions } from '@/modules/lead-intelligence/intelligence.service';
import { getOrgSettings } from '@/modules/organizations/settings';
import { productLabel, temperatureLabel } from '@/modules/leads/catalog';
import { Badge, Card, Notice, PageHeader, cx } from '@/components/ui';
import { Composition, BarList } from '@/components/charts';
import { LandingHeatBadge, ModeBadge, ScoreBadge, TempBadge } from '@/components/badges';
import { brl, timeAgo } from '@/lib/format';
import { ConversationButton } from './conversation-drawer';

export const metadata = { title: 'Lead Intelligence' };

const ORDER = ['QUENTE', 'MORNO', 'FRIO'] as const;

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('lead.read');
  const { t: filter } = await searchParams;
  const [leads, temps, intents, objections, settings] = await Promise.all([
    priorityLeads(ctx, 30, { temperature: filter }),
    db.lead.groupBy({ by: ['temperature'], where: leadScope(ctx), _count: { _all: true } }),
    db.lead.groupBy({ by: ['intent'], where: leadScope(ctx), _count: { _all: true } }),
    db.leadMemory.findMany({ where: { organizationId: ctx.orgId, lead: leadScope(ctx) }, select: { objections: true } }),
    getOrgSettings(ctx.orgId),
  ]);
  const objCount = new Map<string, number>();
  objections.forEach((m) => m.objections.forEach((o) => objCount.set(o, (objCount.get(o) ?? 0) + 1)));
  const th = settings.scoring.thresholds;
  const canHandoff = can(ctx, 'conversation.handoff') && can(ctx, 'conversation.read');
  const canSeeConversation = can(ctx, 'conversation.read');
  const countOf = (k: string) => temps.find((x) => x.temperature === k)?._count._all ?? 0;

  return (
    <>
      <PageHeader title="Lead Intelligence" crumb="Inteligência" subtitle="Score, temperatura, objeções, próxima ação e as conversas — com a opção de o consultor assumir." />
      <Notice tone="blue">
        O Lead Score é um <b>indicador operacional de prioridade</b> (explicável, regra a regra) — não é garantia de compra. Faixas: <b>Frio</b> 0–{th.morno - 1} · <b>Morno</b> {th.morno}–{th.quente - 1} ·{' '}
        <b>Quente</b> {th.quente}–100 (configurável em Configurações). Morno e Quente vão para um consultor; Frio fica em nutrição.
      </Notice>
      <div className="grid md:grid-cols-3 gap-4 my-4">
        <Card title="Temperatura da base">
          <Composition items={ORDER.map((k) => ({ label: temperatureLabel(k), value: countOf(k) }))} />
        </Card>
        <Card title="Intenção detectada">
          <BarList items={[['HIGH', 'Alta'], ['MEDIUM', 'Média'], ['LOW', 'Baixa']].map(([k, l]) => ({ label: l, value: intents.find((i) => i.intent === k)?._count._all ?? 0 }))} />
        </Card>
        <Card title="Objeções mais frequentes" subtitle="Da memória estruturada das conversas">
          <BarList items={[...objCount.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} empty="Nenhuma objeção registrada." />
        </Card>
      </div>
      <Card
        title="Leads prioritários, próxima ação e conversa"
        subtitle="Ordenados por score · abertos, sem opt-out"
        actions={
          <nav className="flex flex-wrap gap-1.5" aria-label="Filtrar por temperatura">
            {[['', 'Todos'], ...ORDER.map((k) => [k, `${temperatureLabel(k)} · ${countOf(k)}`])].map(([k, l]) => (
              <Link
                key={k || 'all'}
                href={k ? `/inteligencia?t=${k}` : '/inteligencia'}
                className={cx('rounded-full border px-3 py-1 text-xs font-medium', (filter ?? '') === k ? 'bg-ink border-ink text-white' : 'border-line text-ink-2 hover:bg-slate-50')}
              >
                {l}
              </Link>
            ))}
          </nav>
        }
      >
        {leads.length === 0 && <p className="text-sm text-muted py-4">Nenhum lead aberto nesta temperatura.</p>}
        <ul className="divide-y divide-line">
          {leads.map((l) => {
            const recs = recommendNextActions(l, { openTasks: 1, hasOpenOpportunity: l.status === 'OPPORTUNITY', objections: l.memory?.objections ?? [] });
            const conv = l.conversations[0];
            return (
              <li key={l.id} className="py-3 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-center">
                <Link href={`/leads/${l.id}`} className="flex items-center gap-3 group min-w-0">
                  <ScoreBadge score={l.score} temperature={l.temperature} />
                  <span className="min-w-0">
                    <b className="block font-medium group-hover:text-brand-600 truncate">{l.name}</b>
                    <span className="text-xs text-muted">
                      {productLabel(l.product)} · {l.desiredValue ? brl(l.desiredValue) : 'valor —'} · {l.consultant?.name ?? 'sem consultor'} · {timeAgo(l.updatedAt)}
                    </span>
                  </span>
                  <span className="flex flex-col items-start gap-1 shrink-0">
                    <TempBadge temperature={l.temperature} />
                    <LandingHeatBadge heat={l.landingHeat} />
                  </span>
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  {recs.slice(0, 3).map((r) => (
                    <Badge key={r.action} tone={r.priority === 'alta' ? 'red' : r.priority === 'media' ? 'amber' : 'gray'} title={r.why}>
                      {r.action}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2 lg:justify-end">
                  {conv ? (
                    <>
                      <span className="hidden sm:inline-flex">
                        <ModeBadge mode={conv.mode} />
                      </span>
                      {canSeeConversation && <ConversationButton conversationId={conv.id} mode={conv.mode} canHandoff={canHandoff} />}
                    </>
                  ) : (
                    <span className="text-xs text-muted">Sem conversa</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
