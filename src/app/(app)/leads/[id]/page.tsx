import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getLeadDetail } from '@/modules/leads/leads.service';
import { recommendNextActions } from '@/modules/lead-intelligence/intelligence.service';
import { listConsultants } from '@/modules/consultants/consultant.service';
import { productLabel, sourceLabel, statusLabel, temperatureLabel, intentLabel } from '@/modules/leads/catalog';
import { isAppError } from '@/lib/errors';
import { Badge, Card, KV, Section, Notice } from '@/components/ui';
import { IntentBadge, LandingHeatBadge, ModeBadge, ScoreBadge, SourceBadge, StatusBadge, TempBadge } from '@/components/badges';
import { brl, date, dateTime, timeAgo } from '@/lib/format';
import { formatCnpj, formatPhone, firstName } from '@/lib/normalize';
import { LeadActions, NoteForm, ConsentPanel } from './actions';
import { getLeadDNA } from '@/modules/lead-intelligence/intelligence-v2.service';
import { customerJourney } from '@/modules/coach/coach.service';
import { INTENT_LABELS, SIGNAL_LABELS } from '@/modules/lead-intelligence/signal-detector';
import { NBA_ACTIONS } from '@/modules/lead-intelligence/nba-engine';
import { NbaButtons, SendToPhoneButton } from '@/components/v2-client';
import { PriorityBadge, SubScoreBars } from '@/components/v2-ui';
import { ActionButton } from '@/components/client';
import { cx } from '@/components/ui';
import { originOfCode } from '@/modules/outreach/outreach.service';

export const metadata = { title: 'Lead' };

type Breakdown = { key: string; label: string; points: number; hit: boolean }[];
type Step = { step: string; detail: string; ok: boolean };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('lead.read');
  const { id } = await params;
  let lead;
  try {
    lead = await getLeadDetail(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  }
  const consultants = can(ctx, 'lead.assign') ? await listConsultants(ctx) : [];
  const conv = lead.conversations[0];
  const summary = conv?.summaries[0];
  const breakdown = (lead.scoreSnapshot?.breakdown ?? []) as unknown as Breakdown;
  const recs = recommendNextActions(lead, {
    openTasks: lead.tasks.length,
    hasOpenOpportunity: lead.opportunities.some((o) => o.status === 'OPEN'),
    conversationMode: conv?.mode,
    objections: lead.memory?.objections ?? [],
  });
  const [dna, journey] = await Promise.all([getLeadDNA(ctx, id), customerJourney(ctx, id)]);
  const outreach = await originOfCode(ctx.orgId, lead.utmCampaign);
  const nba = dna.nextBestAction;
  const LIFECYCLE: Record<string, string> = { ACTIVE: 'Ativo', NURTURE: 'Em nutrição', REACTIVATION: 'Reativação', DORMANT: 'Inativo' };
  const STAGE_LABEL: Record<string, string> = { FIRST_TOUCH: 'Origem', LANDING: 'Landing', SIMULATOR: 'Simulação', LEAD: 'Lead', WHATSAPP: 'Resposta', BOT: 'Assistente', QUALIFICATION: 'Qualificação', CONSULTANT: 'Consultor', OPPORTUNITY: 'Oportunidade', PROPOSAL: 'Proposta', CONVERSION: 'Conversão' };
  const lastDecision = lead.decisions[0];
  const openOpp = lead.opportunities.find((o) => o.status === 'OPEN') ?? lead.opportunities[0];

  return (
    <>
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <Link href="/leads" className="text-xs font-medium uppercase tracking-[0.08em] text-brand-500 hover:underline">
            ← Leads
          </Link>
          <h1 className="text-[30px] leading-[1.15] font-bold tracking-tight mt-1 flex items-center gap-3 flex-wrap">
            {lead.name}
            <span className="text-sm font-normal text-muted">#{lead.code}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge status={lead.status} />
            <TempBadge temperature={lead.temperature} />
            <IntentBadge intent={lead.intent} />
            <LandingHeatBadge heat={lead.landingHeat} />
            <SourceBadge source={lead.source} />
            {lead.optOut && <Badge tone="red">Opt-out</Badge>}
            {lead.merges.length > 0 && <Badge tone="amber">Unificado {lead.merges.length}×</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <SendToPhoneButton targetType="LEAD" targetId={lead.id} />
          <div className="rounded-2xl bg-ink text-white px-4 py-3 flex items-center gap-3">
            <span className="text-[11px] leading-tight text-white/70 w-9">Lead Score</span>
            <span className="text-right">
              <span className="block text-3xl font-bold tabular leading-none">{lead.score}</span>
              <span className="text-xs text-lime">{temperatureLabel(lead.temperature)}</span>
            </span>
          </div>
        </div>
      </div>

      <LeadActions
        lead={{ id: lead.id, status: lead.status, consultantId: lead.consultantId, hasOpenOpportunity: lead.opportunities.some((o) => o.status === 'OPEN'), desiredValue: lead.desiredValue }}
        consultants={consultants.map((c) => ({ id: c.id, label: `${c.name} · ${c.pj.code} (${c.openLeads}/${c.maxOpenLeads})` }))}
        perms={{ assign: can(ctx, 'lead.assign'), update: can(ctx, 'lead.update'), opp: can(ctx, 'opportunity.create'), task: can(ctx, 'task.create') }}
      />

      <div className="grid xl:grid-cols-[1.55fr_1fr] gap-4 mt-4">
        <div className="space-y-4 min-w-0">
          <Card title="Contato e interesse">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KV label="Telefone">{formatPhone(lead.phone)}</KV>
              <KV label="E-mail">{lead.email ?? '—'}</KV>
              <KV label="Empresa">{lead.company ?? '—'}</KV>
              <KV label="CNPJ">{lead.cnpj ? formatCnpj(lead.cnpj) : '—'}</KV>
              <KV label="Cidade / UF">{lead.city ? `${lead.city}${lead.uf ? `/${lead.uf}` : ''}` : '—'}</KV>
              <KV label="Região">{lead.region ?? '—'}</KV>
              <KV label="Produto">{productLabel(lead.product)}</KV>
              <KV label="Valor desejado">{lead.desiredValue ? brl(lead.desiredValue) : '—'}</KV>
              <KV label="Objetivo">{lead.objective ?? '—'}</KV>
              <KV label="Prazo">{lead.term ?? '—'}</KV>
              <KV label="Capturado em">{dateTime(lead.capturedAt)}</KV>
              <KV label="Última interação">{lead.lastInteractionAt ? timeAgo(lead.lastInteractionAt) : '—'}</KV>
            </dl>
          </Card>

          <Card title="Origem" subtitle="Attribution: source · medium · campaign · content · term · landing">
            {outreach && (
              <div className="mb-3">
                <Notice tone="green" title={outreach.kind === 'INDICACAO' ? 'Indicação:' : 'Divulgação do consultor:'}>
                  {outreach.kind === 'INDICACAO' ? `indicado por ${outreach.name}.` : `veio pelo canal “${outreach.name}” (${outreach.network}).`}
                </Notice>
              </div>
            )}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KV label="Source">{sourceLabel(lead.source)}</KV>
              <KV label="Medium">{lead.medium ?? lead.attribution?.medium ?? '—'}</KV>
              <KV label="Campanha">{lead.campaign ? <Link className="text-brand-600 hover:underline" href={`/campanhas/${lead.campaign.id}`}>{lead.campaign.name}</Link> : lead.utmCampaign ?? '—'}</KV>
              <KV label="Landing">{lead.landingPage ? <Link className="text-brand-600 hover:underline" href={`/landing-pages/${lead.landingPage.id}`}>{lead.landingPage.name}</Link> : '—'}</KV>
              <KV label="Content">{lead.utmContent ?? lead.attribution?.content ?? '—'}</KV>
              <KV label="Term">{lead.utmTerm ?? lead.attribution?.term ?? '—'}</KV>
              <KV label="UTM source">{lead.attribution?.source ?? '—'}</KV>
              <KV label="Origem dos dados">{lead.dataOrigin ?? '—'}</KV>
            </dl>
            {(lead.sources.length > 1 || lead.merges.length > 0) && (
              <div className="mt-5 grid md:grid-cols-2 gap-4">
                <Section title={`Fontes (${lead.sources.length})`}>
                  <ul className="space-y-1.5 text-sm">
                    {lead.sources.map((s) => (
                      <li key={s.id} className="flex justify-between gap-3">
                        <span>{sourceLabel(s.source)}</span>
                        <span className="text-xs text-muted">{dateTime(s.receivedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section title="Deduplicação">
                  <ul className="space-y-2 text-sm">
                    {lead.merges.map((m) => (
                      <li key={m.id} className="rounded-lg bg-warn-50 border border-amber-200 px-3 py-2">
                        <b>{m.mergeReason}</b>
                        <div className="text-xs text-muted">
                          mergedAt {dateTime(m.mergedAt)} · mergedBy {m.mergedBy === 'SYSTEM' ? 'Sistema' : m.mergedBy} · campos atualizados: {Object.keys((m.changes as object) ?? {}).join(', ') || 'nenhum'}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              </div>
            )}
          </Card>

          <Card title="Customer Journey" subtitle={`Parou em: ${STAGE_LABEL[journey.stoppedAt] ?? journey.stoppedAt}${journey.daysSinceLastStep != null ? ` · último passo há ${journey.daysSinceLastStep} dia(s)` : ''}`}>
            <ol className="flex flex-wrap gap-1.5 mb-4" aria-label="Etapas da jornada">
              {journey.stages.map((s) => (
                <li key={s.key} className={cx('text-[11.5px] rounded-full px-2.5 py-0.5 border', s.current ? 'bg-ink text-white border-ink' : s.reached ? 'bg-brand-50 text-brand-700 border-brand-100' : 'bg-white text-faint border-line')}>
                  {STAGE_LABEL[s.key] ?? s.key}
                </li>
              ))}
            </ol>
            <ol className="space-y-1.5 max-h-72 overflow-y-auto scroll-thin text-sm">
              {journey.steps.map((s, i) => (
                <li key={i} className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-xs text-muted tabular">{dateTime(s.at)}</span>
                  <span>
                    {s.label}
                    <span className="text-xs text-faint">{[s.channel, s.campaign, s.actor].filter(Boolean).length ? ` · ${[s.channel, s.campaign, s.actor].filter(Boolean).join(' · ')}` : ''}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                Conversa {conv && <ModeBadge mode={conv.mode} />}
              </span>
            }
            subtitle={conv ? `${conv.channel === 'WEB' ? 'Chat da landing' : 'WhatsApp'} · ${conv.messages.length} mensagens` : undefined}
            actions={conv && <Link href={`/conversas?c=${conv.id}`} className="text-xs text-brand-600 hover:underline">Abrir no inbox →</Link>}
          >
            {summary && (
              <div className="mb-4 rounded-xl bg-brand-50 border border-brand-100 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 mb-1.5">AI generated summary · handoff</div>
                <pre className="text-sm text-ink-2 whitespace-pre-wrap font-sans">{summary.content}</pre>
              </div>
            )}
            {conv ? (
              <div className="space-y-2 max-h-96 overflow-y-auto scroll-thin pr-1">
                {conv.messages.slice(-14).map((m) =>
                  m.senderType === 'SYSTEM' ? (
                    <div key={m.id} className="text-center text-[11.5px] text-muted">
                      {m.content}
                    </div>
                  ) : (
                    <div key={m.id} className={m.direction === 'INBOUND' ? 'flex' : 'flex justify-end'}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.direction === 'INBOUND' ? 'bg-slate-100 text-ink rounded-bl-md' : m.senderType === 'HUMAN' ? 'bg-ok-50 border border-emerald-200 rounded-br-md' : 'bg-ink text-white rounded-br-md'}`}>
                        <div className="text-[10.5px] opacity-70 mb-0.5">{m.senderType === 'LEAD' ? firstName(lead.name) : m.senderType === 'HUMAN' ? m.senderName ?? 'Consultor' : `IA · ${m.agentKey === 'QUALIFICATION' ? 'Qualification Agent' : m.agentKey === 'CAMPAIGN' ? 'Campanha' : 'Prospect Agent'}`}</div>
                        {m.content}
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Nenhuma conversa ainda. {lead.consentStatus !== 'GRANTED' ? 'Sem opt-in de WhatsApp: a IA não inicia contato proativo.' : ''}</p>
            )}
          </Card>

          <Card title="Oportunidade" subtitle="Lead e oportunidade são entidades separadas" actions={openOpp && <Link href={`/oportunidades/${openOpp.id}`} className="text-xs text-brand-600 hover:underline">Detalhes →</Link>}>
            {lead.opportunities.length ? (
              <ul className="space-y-3">
                {lead.opportunities.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3.5">
                    <div>
                      <Link href={`/oportunidades/${o.id}`} className="font-medium hover:text-brand-600">
                        Oportunidade #{o.code} · {productLabel(o.product)}
                      </Link>
                      <div className="text-xs text-muted">
                        {o.consultant?.name ?? 'Sem consultor'} · criada {date(o.createdAt)}
                        {o.lostReason && ` · perda: ${o.lostReason}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular font-semibold">{brl(o.value)}</span>
                      <Badge tone={o.status === 'WON' ? 'green' : o.status === 'LOST' ? 'red' : 'blue'}>{o.stage.name}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nenhuma oportunidade criada.</p>
            )}
          </Card>

          <Card title="Atividades e histórico">
            {can(ctx, 'activity.create') && <NoteForm leadId={lead.id} />}
            <ol className="relative mt-4 space-y-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-line">
              {lead.activities.map((a) => (
                <li key={a.id} className="relative pl-7">
                  <span className={`absolute left-0 top-1 size-[15px] rounded-full border-2 border-white ring-1 ${a.actorType === 'AI' ? 'bg-violet-500 ring-violet-200' : a.actorType === 'USER' ? 'bg-ok ring-emerald-200' : 'bg-brand-500 ring-brand-100'}`} />
                  <div className="text-sm text-ink">{a.description}</div>
                  <div className="text-xs text-muted">
                    {dateTime(a.createdAt)} · {a.actorType === 'AI' ? 'IA' : a.actorType === 'USER' ? ((a.metadata as { author?: string })?.author ?? 'Usuário') : 'Sistema'} · {a.type}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card
            title="Next Best Action"
            subtitle="O que fazer agora — sinal por regra, com os motivos reais"
            actions={can(ctx, 'lead.update') && <ActionButton path={`/leads/${lead.id}/intelligence/refresh`} size="sm" variant="ghost" success="Inteligência recalculada.">Recalcular</ActionButton>}
          >
            {nba ? (
              <div className={cx('rounded-xl border p-3', nba.priority === 'CRITICAL' ? 'border-red-200 bg-bad-50' : nba.priority === 'HIGH' ? 'border-amber-200 bg-warn-50' : 'border-line')}>
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge p={nba.priority} />
                  <b className="text-ink">{NBA_ACTIONS[nba.action as keyof typeof NBA_ACTIONS] ?? nba.action}</b>
                </div>
                <p className="text-sm text-ink-2 mt-1">{nba.reason}</p>
                <ul className="mt-2 flex flex-wrap gap-1">
                  {(nba.signals as { key: string; label: string }[]).map((s) => (
                    <li key={s.key}>
                      <Badge tone="gray">{s.label}</Badge>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-faint mt-2">
                  Confiança {Math.round(nba.confidence * 100)}% (regra) · válida até {dateTime(nba.validUntil)}
                  {nba.recommendedAt ? ` · melhor horário ${dateTime(nba.recommendedAt)}` : ''}
                </p>
                {can(ctx, 'lead.update') && (
                  <div className="mt-2">
                    <NbaButtons id={nba.id} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Nenhuma ação pendente agora.</p>
            )}
          </Card>

          <Card title="Lead DNA" subtitle={`Ciclo de vida: ${LIFECYCLE[dna.scores.lifecycle] ?? dna.scores.lifecycle}`}>
            <SubScoreBars
              scores={[
                { label: 'Fit', value: dna.scores.fit },
                { label: 'Intenção', value: dna.scores.intent },
                { label: 'Engajamento', value: dna.scores.engagement },
                { label: 'Comportamento', value: dna.scores.behavior },
                { label: 'Recência', value: dna.scores.recency },
              ]}
            />
            <Section title="Sinais de compra" className="mt-4">
              {dna.buyingSignals.length ? (
                <ul className="space-y-1 text-xs">
                  {dna.buyingSignals.slice(0, 6).map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>
                        {SIGNAL_LABELS[s.type as keyof typeof SIGNAL_LABELS] ?? s.type}
                        {s.evidence && <span className="text-faint"> · {s.evidence.slice(0, 60)}</span>}
                      </span>
                      <span className="text-faint whitespace-nowrap">{timeAgo(s.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">Nenhum sinal registrado.</p>
              )}
            </Section>
            <Section title="Intenções detectadas" className="mt-4">
              {dna.intent.events.length ? (
                <ul className="space-y-1 text-xs">
                  {dna.intent.events.slice(0, 6).map((i) => (
                    <li key={i.id}>
                      <b>{INTENT_LABELS[i.type as keyof typeof INTENT_LABELS] ?? i.type}</b> <span className="text-faint">({Math.round(i.confidence * 100)}% · {i.origin === 'RULE' ? 'regra' : 'IA'})</span>
                      <span className="block text-muted">&ldquo;{i.evidence.slice(0, 90)}&rdquo;</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">Nenhuma intenção registrada.</p>
              )}
            </Section>
          </Card>

          <Card title="Inteligência" subtitle="Por que o score existe · indicador operacional, não é garantia de compra">
            <div className="flex items-center gap-3 mb-4">
              <ScoreBadge score={lead.score} temperature={lead.temperature} />
              <div className="flex-1">
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-series-1" style={{ width: `${lead.score}%` }} />
                </div>
                <div className="flex justify-between text-[10.5px] text-muted mt-1">
                  <span>Frio</span>
                  <span>Nutrição</span>
                  <span>Qualificado</span>
                  <span>Alta intenção</span>
                </div>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm">
              {breakdown.map((b) => (
                <li key={b.key} className={`flex justify-between gap-3 ${b.hit ? 'text-ink' : 'text-faint'}`}>
                  <span>
                    {b.hit ? '✓' : '○'} {b.label}
                  </span>
                  <b className={`tabular ${b.hit ? 'text-ok' : ''}`}>+{b.points}</b>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-2 gap-3 mt-5">
              <KV label="Temperatura">{temperatureLabel(lead.temperature)}</KV>
              <KV label="Intenção">{intentLabel(lead.intent)}</KV>
              <KV label="Estágio">{statusLabel(lead.status)}</KV>
              <KV label="Objeções">{lead.memory?.objections?.length ? lead.memory.objections.join(', ') : 'Nenhuma registrada'}</KV>
            </dl>
            {recs.length > 0 && (
              <Section title="Próximas ações recomendadas" className="mt-5">
                <ul className="space-y-2">
                  {recs.map((r) => (
                    <li key={r.action} className="rounded-lg border border-line px-3 py-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge tone={r.priority === 'alta' ? 'red' : r.priority === 'media' ? 'amber' : 'gray'}>{r.priority}</Badge>
                        {r.action}
                      </div>
                      <div className="text-xs text-muted mt-0.5">{r.why}</div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </Card>

          <Card title="Distribuição">
            <dl className="grid grid-cols-2 gap-3">
              <KV label="PJ">{lead.pj ? `${lead.pj.code} · ${lead.pj.name}` : '—'}</KV>
              <KV label="Consultor">{lead.consultant?.name ?? 'Não distribuído'}</KV>
              <KV label="Distribuído em">{lead.assignedAt ? dateTime(lead.assignedAt) : '—'}</KV>
              <KV label="Método">{lastDecision ? `${lastDecision.method ?? '—'}${lastDecision.ruleName ? ` · ${lastDecision.ruleName}` : ''}` : '—'}</KV>
            </dl>
            {lastDecision && (
              <Section title="Decisão registrada do Lead Router" className="mt-4">
                <ol className="space-y-1.5 text-[12.5px]">
                  {(lastDecision.steps as unknown as Step[]).map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className={s.ok ? 'text-ok' : 'text-faint'}>{s.ok ? '●' : '○'}</span>
                      <span>
                        <b className="text-ink">{s.step}</b> <span className="text-muted">{s.detail}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </Card>

          <Card title="IA · memória do lead" subtitle="Somente informações úteis e permitidas">
            <dl className="grid grid-cols-2 gap-3">
              <KV label="Último agente">{lead.lastAgent === 'QUALIFICATION' ? 'Qualification Agent' : lead.lastAgent === 'PROSPECT' ? 'Prospect Agent' : '—'}</KV>
              <KV label="Canal preferido">{lead.preferredChannel ?? ((lead.memory?.preferences as { preferredChannel?: string })?.preferredChannel ?? '—')}</KV>
              <KV label="Produto (memória)">{productLabel(lead.memory?.product)}</KV>
              <KV label="Valor (memória)">{lead.memory?.value ? brl(lead.memory.value) : '—'}</KV>
              <KV label="Cidade (memória)">{lead.memory?.city ?? '—'}</KV>
              <KV label="Prazo (memória)">{lead.memory?.term ?? '—'}</KV>
            </dl>
            {lead.aiSummary && !summary && <p className="text-sm text-ink-2 mt-3 whitespace-pre-wrap">{lead.aiSummary}</p>}
          </Card>

          <Card title="Governança · LGPD">
            <ConsentPanel
              leadId={lead.id}
              canManage={can(ctx, 'privacy.manage')}
              optOut={lead.optOut}
              consents={lead.consents.map((c) => ({ id: c.id, channel: c.channel, purpose: c.purpose, status: c.status, source: c.source, policyVersion: c.policyVersion, createdAt: c.createdAt.toISOString(), revokedAt: c.revokedAt?.toISOString() ?? null }))}
            />
            {lead.preference && (
              <p className="text-xs text-muted mt-3">
                Preferências: WhatsApp {lead.preference.allowWhatsapp ? 'sim' : 'não'} · e-mail {lead.preference.allowEmail ? 'sim' : 'não'} · ligação {lead.preference.allowPhone ? 'sim' : 'não'} · até {lead.preference.frequencyCapPerWeek} contatos/semana
              </p>
            )}
          </Card>

          {lead.tasks.length > 0 && (
            <Card title="Tarefas abertas">
              <ul className="space-y-2 text-sm">
                {lead.tasks.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3">
                    <span>{t.title}</span>
                    <span className={`text-xs ${t.dueAt < new Date() ? 'text-bad font-medium' : 'text-muted'}`}>{dateTime(t.dueAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {lead.status === 'BLOCKED' && <Notice tone="red">Lead bloqueado: não pode receber contatos.</Notice>}
        </div>
      </div>
    </>
  );
}
