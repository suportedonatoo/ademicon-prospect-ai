import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getCampaign, listCampaigns, CAMPAIGN_STATUS_LABEL, CAMPAIGN_SOURCES, adsProviderFor } from '@/modules/campaigns/campaign.service';
import { db } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { productLabel } from '@/modules/leads/catalog';
import { Badge, Card, KV, Notice, PageHeader, Stat } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { LineChart } from '@/components/charts';
import { brl, date, dateTime, num, pct } from '@/lib/format';
import { CampaignFormButton } from '../campaign-form';
import { STATUS_TONE } from '../constants';

const NEXT: Record<string, { to: string; label: string }[]> = {
  DRAFT: [{ to: 'SCHEDULED', label: 'Agendar' }, { to: 'ACTIVE', label: 'Ativar' }],
  SCHEDULED: [{ to: 'ACTIVE', label: 'Ativar' }, { to: 'PAUSED', label: 'Pausar' }, { to: 'DRAFT', label: 'Voltar a rascunho' }],
  ACTIVE: [{ to: 'PAUSED', label: 'Pausar' }, { to: 'COMPLETED', label: 'Concluir' }],
  PAUSED: [{ to: 'ACTIVE', label: 'Retomar' }, { to: 'COMPLETED', label: 'Concluir' }],
  COMPLETED: [],
};

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('campaign.read');
  const { id } = await params;
  let c;
  try {
    c = await getCampaign(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  }
  const stats = (await listCampaigns(ctx)).find((x) => x.id === id)!;
  const [regions, pjs, landings] = await Promise.all([
    db.region.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true } }),
    db.pJ.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, code: true, city: true } }),
    db.landingPage.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true } }),
  ]);
  const provider = adsProviderFor(c.source);
  const series = c.metrics.slice(-45).map((m) => ({ label: new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }), values: [m.clicks, m.providerLeads] }));
  const d = (x: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : '');

  return (
    <>
      <PageHeader
        crumb="Campanhas"
        title={c.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[c.status]} dot>
              {CAMPAIGN_STATUS_LABEL[c.status]}
            </Badge>
            {CAMPAIGN_SOURCES[c.source as keyof typeof CAMPAIGN_SOURCES]} · {productLabel(c.product)}
            {provider && <Badge tone={provider.mode === 'mock' ? 'amber' : 'green'}>{provider.name}</Badge>}
          </span>
        }
        actions={
          can(ctx, 'campaign.update') && (
            <>
              {NEXT[c.status].map((n) => (
                <ActionButton key={n.to} path={`/campaigns/${c.id}/status`} body={{ status: n.to }} variant={n.to === 'ACTIVE' ? 'primary' : 'secondary'} success={`Campanha: ${CAMPAIGN_STATUS_LABEL[n.to as keyof typeof CAMPAIGN_STATUS_LABEL]}`}>
                  {n.label}
                </ActionButton>
              ))}
              {provider && (
                <ActionButton path={`/campaigns/${c.id}/sync`} success="Métricas sincronizadas.">
                  Sincronizar métricas
                </ActionButton>
              )}
              <CampaignFormButton
                id={c.id}
                variant="secondary"
                label="Editar"
                options={{ regions, pjs: pjs.map((p) => ({ id: p.id, name: `${p.code} · ${p.city}` })), landings }}
                initial={{ name: c.name, product: c.product ?? '', regionId: c.regionId ?? '', pjId: c.pjId ?? '', landingPageId: c.landingPageId ?? '', source: c.source, startAt: d(c.startAt), endAt: d(c.endAt), budget: String(c.budget), utmCampaign: c.utmCampaign ?? '' }}
              />
            </>
          )
        }
      />
      {provider?.mode === 'mock' && <Notice tone="amber">Métricas geradas pelo MockProvider (determinísticas, fictícias). Com credenciais, o provider real substitui o mock sem mudar esta tela.</Notice>}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 my-4">
        <Stat label="Investimento" value={brl(stats.spend)} hint={`de ${brl(c.budget)}`} />
        <Stat label="Impressões" value={num(stats.impressions)} />
        <Stat label="Cliques" value={num(stats.clicks)} hint={`CTR ${pct(stats.impressions ? (stats.clicks / stats.impressions) * 100 : 0, 2)}`} />
        <Stat label="Leads" value={num(stats.leads)} hint={`CPL ${stats.cpl != null ? brl(stats.cpl, 2) : '—'}`} />
        <Stat label="Qualificados" value={num(stats.qualified)} hint={`CPQL ${stats.cpql != null ? brl(stats.cpql, 2) : '—'}`} />
        <Stat label="Conversões" value={num(stats.conversions)} hint={`Volume ${brl(stats.revenue)}`} />
      </div>
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4">
        <Card title="Desempenho diário" subtitle="Cliques e leads reportados pelo provider">
          <LineChart data={series} series={[{ name: 'Cliques' }, { name: 'Leads (provider)' }]} />
        </Card>
        <Card title="Configuração">
          <dl className="grid grid-cols-2 gap-4">
            <KV label="Início">{date(c.startAt)}</KV>
            <KV label="Fim">{date(c.endAt)}</KV>
            <KV label="Orçamento">{brl(c.budget)}</KV>
            <KV label="utm_campaign">{c.utmCampaign ? <code className="text-xs">{c.utmCampaign}</code> : '—'}</KV>
            <KV label="Landing">{landings.find((l) => l.id === c.landingPageId) ? <Link className="text-brand-600 hover:underline" href={`/landing-pages/${c.landingPageId}`}>{landings.find((l) => l.id === c.landingPageId)!.name}</Link> : '—'}</KV>
            <KV label="Região">{regions.find((r) => r.id === c.regionId)?.name ?? 'Todas'}</KV>
          </dl>
          <Link className="text-sm text-brand-600 hover:underline mt-4 inline-block" href={`/leads?campaignId=${c.id}`}>
            Ver leads desta campanha →
          </Link>
        </Card>
      </div>
      <div className="grid xl:grid-cols-2 gap-4 mt-4">
        <Card title="Eventos (CampaignEvent)">
          <ul className="space-y-2 text-sm">
            {c.events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span>{e.type}</span>
                <span className="text-xs text-muted">{dateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Mensagens da campanha (CampaignMessage)" actions={can(ctx, 'whatsapp.send_campaign') && <Link className="text-xs text-brand-600 hover:underline" href={`/whatsapp/campanhas?campaign=${c.id}`}>Disparo via WhatsApp →</Link>}>
          {c.messages.length ? (
            <ul className="space-y-2 text-sm">
              {c.messages.map((m) => (
                <li key={m.id} className="rounded-lg border border-line p-3">
                  <div className="flex justify-between">
                    <Badge>{m.status}</Badge>
                    <span className="text-xs text-muted">
                      {m.sentCount} enviadas · {m.skippedCount} bloqueadas por regras
                    </span>
                  </div>
                  <p className="text-xs text-ink-2 mt-2">{m.content}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhuma mensagem. Disparos exigem template aprovado e opt-in de marketing.</p>
          )}
        </Card>
      </div>
    </>
  );
}
