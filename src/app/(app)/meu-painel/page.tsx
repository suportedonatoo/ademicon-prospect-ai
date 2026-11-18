import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { consultantDashboard, myLinkStats } from '@/modules/management/dashboards.service';
import { listSponsoredAds } from '@/modules/management/sponsored-ads.service';
import { productLabel, sourceLabel } from '@/modules/leads/catalog';
import { Card, Notice, PageHeader, Stat, cx } from '@/components/ui';
import { AutoRefresh } from '@/components/v2-client';
import { brl, dateTime, minutes, num, pct, timeAgo } from '@/lib/format';
import { formatPhone } from '@/lib/normalize';
import { PeriodTabs, parsePeriod } from '../gestao/period-tabs';
import { PublishLinks } from '@/components/publish-links';
import { db } from '@/lib/db';

export const metadata = { title: 'Meu painel' };

type L = Awaited<ReturnType<typeof consultantDashboard>>['hot'][number];

function Column({ title, tone, leads, empty }: { title: string; tone: string; leads: L[]; empty: string }) {
  return (
    <Card title={`${title} (${leads.length})`} pad={false}>
      <ul className="divide-y divide-line max-h-[420px] overflow-y-auto scroll-thin">
        {leads.slice(0, 50).map((l) => (
          <li key={l.id} className="px-4 py-3 flex items-start gap-3">
            <span className={cx('mt-1.5 size-2.5 rounded-full shrink-0', tone)} aria-hidden />
            <span className="min-w-0 flex-1">
              <Link href={`/leads/${l.id}`} className="font-medium hover:text-brand-600 truncate block">
                {l.name}
              </Link>
              <span className="block text-xs text-muted truncate">
                {productLabel(l.product)}
                {l.desiredValue ? ` · ${brl(l.desiredValue)}` : ''} · {sourceLabel(l.source)} · {l.lastInteractionAt ? `falou ${timeAgo(l.lastInteractionAt)}` : 'sem contato ainda'}
              </span>
            </span>
            {l.conversationId && (
              <Link href={`/conversas?c=${l.conversationId}`} className="text-xs text-brand-600 hover:underline shrink-0">
                Conversa →
              </Link>
            )}
          </li>
        ))}
        {!leads.length && <li className="px-4 py-6 text-sm text-muted text-center">{empty}</li>}
      </ul>
    </Card>
  );
}

export default async function MyDashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const period = parsePeriod((await searchParams).p);
  if (!ctx.consultantId) {
    return (
      <>
        <PageHeader title="Meu painel" />
        <Notice tone="amber" title="Painel do consultor:">seu usuário não está ligado a um cadastro de consultor.</Notice>
      </>
    );
  }
  const [d, link, ads, me] = await Promise.all([
    consultantDashboard(ctx, period),
    myLinkStats(ctx, period),
    listSponsoredAds(ctx),
    db.consultant.findUnique({ where: { id: ctx.consultantId }, select: { landingSlug: true } }),
  ]);
  const noContact = [...d.hot, ...d.warm, ...d.cold].filter((l) => !l.lastInteractionAt).length;
  return (
    <>
      <AutoRefresh seconds={60} on={['lead.assigned']} />
      <PageHeader title="Meu painel" subtitle="Atenda primeiro os quentes. A IA conversa com os leads e te avisa quando esquentam." aside={<PeriodTabs current={period} base="/meu-painel" />} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Leads recebidos" value={num(d.received)} hint={d.viaLink ? `${num(d.viaLink)} pelo meu link` : 'divisão igual + anúncios'} />
        <Stat label="Em aberto" value={num(d.open)} hint={noContact ? `${noContact} sem contato ainda` : 'todos com contato'} />
        <Stat label="Vendas" value={num(d.sales)} hint={brl(d.soldValue)} href="/pipeline" />
        <Stat label="Minha conversão (CVR)" value={pct(d.cvr * 100)} hint="vendas ÷ leads recebidos" tone="hero" />
        <Stat label="CVR no mês" value={pct(d.cvrMonth * 100)} hint={`Tempo de resposta: ${minutes(d.responseMin)}`} />
      </div>

      <PublishLinks slug={me?.landingSlug ?? null} own showMaster={ctx.roleKey !== 'CONSULTANT'} className="mt-4" />

      {me?.landingSlug && (
        <Card title="Meu link" subtitle="Quem abriu o seu link, quantos simularam e quem deixou nome e WhatsApp, no período escolhido acima." className="mt-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Acessos" value={num(link.visits)} hint="pessoas que abriram o link" />
            <Stat label="Simulações" value={num(link.simulations)} hint={link.visits && link.simulations <= link.visits ? `${pct((link.simulations / link.visits) * 100, 0)} de quem abriu` : 'cliques em Simular'} />
            <Stat label="Cadastros" value={num(link.signups.length)} hint={link.simulations && link.signups.length <= link.simulations ? `${pct((link.signups.length / link.simulations) * 100, 0)} de quem simulou` : 'deixaram nome e WhatsApp'} />
          </div>
          {link.signups.length ? (
            <ul className="mt-4 divide-y divide-line border-t border-line max-h-[360px] overflow-y-auto scroll-thin">
              {link.signups.map((s) => (
                <li key={s.lead.id + s.createdAt.toISOString()} className="py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="min-w-0">
                    <Link href={`/leads/${s.lead.id}`} className="font-medium hover:text-brand-600">
                      {s.lead.name}
                    </Link>
                    <span className="text-muted"> · {s.lead.phone ? formatPhone(s.lead.phone) : 'sem telefone'}</span>
                  </span>
                  <span className="text-xs text-muted tabular">
                    {productLabel(s.product)}
                    {s.value ? ` · ${brl(s.value)}` : ''} · {dateTime(s.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">Ninguém deixou o contato pelo seu link neste período.</p>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3 mt-4">
        <Column title="Quentes" tone="bg-bad" leads={d.hot} empty="Nenhum lead quente agora." />
        <Column title="Mornos" tone="bg-warn" leads={d.warm} empty="Nenhum lead morno." />
        <Column title="Frios" tone="bg-slate-400" leads={d.cold} empty="Nenhum lead frio." />
      </div>

      <Card title="Meus anúncios" subtitle="Anúncios que você pagou (sozinho ou em grupo) e o que eles trouxeram para você." className="mt-4">
        {ads.length ? (
          <ul className="divide-y divide-line">
            {ads.map((a) => {
              const me = a.sponsors.find((s) => s.id === ctx.consultantId);
              return (
                <li key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>
                    <b>{a.name}</b> <span className="text-muted">· {a.kind === 'GRUPO' ? `grupo de ${a.sponsors.length}` : 'individual'}{a.status !== 'ACTIVE' ? ' · pausado' : ''}</span>
                  </span>
                  <span className="flex flex-wrap gap-4 tabular">
                    <span title={a.shareFromBudget ? 'Pela verba cadastrada (ainda sem custo real do Google/Meta)' : 'Custo real do Google/Meta dividido entre quem pagou'}>
                      Meu investimento <b>{a.sharePerSponsor ? brl(a.sharePerSponsor) : '—'}</b>
                      {a.shareFromBudget ? '*' : ''}
                    </span>
                    <span>
                      Meus leads <b>{num(me?.leads ?? 0)}</b>
                    </span>
                    <span>
                      Minhas vendas <b>{num(me?.sales ?? 0)}</b>
                    </span>
                    {a.cpl && (
                      <span>
                        Custo/lead <b>{brl(a.cpl, 2)}</b>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Você ainda não participa de nenhum anúncio. Fale com a gestão para entrar num anúncio em grupo ou ter o seu individual.</p>
        )}
      </Card>
    </>
  );
}
