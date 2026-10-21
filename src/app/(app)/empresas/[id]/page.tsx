import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { db } from '@/lib/db';
import { ownProspects } from '@/modules/business-prospecting/prospecting.service';
import { CADENCE, qualificationProgress, RESULTS, STAGES, type Qualification, type Stage } from '@/modules/business-prospecting/sdr';
import type { Research } from '@/modules/business-prospecting/research';
import type { CompanyRegistryExtra, Partner } from '@/modules/integrations/types';
import { ActionButton } from '@/components/client';
import { WhatsAppContactButton } from '@/components/whatsapp-contact';
import { Badge, Card, KV, Notice, PageHeader, buttonClass } from '@/components/ui';
import { brl, date, dateTime } from '@/lib/format';
import { formatCnpj, formatPhone, isLandlineBR } from '@/lib/normalize';
import { ResearchDetails, scoreTone } from '../research-card';
import { PartnerCompanies, QualificationForm, TouchButtons } from './client';

export const metadata = { title: 'Ficha da empresa' };

const waLink = (phone: string, text?: string | null) => {
  const d = phone.replace(/\D/g, '');
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
const yearsSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600_000));
const RESULT_LABEL: Record<string, string> = { ...RESULTS.CALL, ...RESULTS.WHATSAPP, ANOTACAO: 'Anotação' };
const CHANNEL_LABEL: Record<string, string> = { CALL: 'Ligação', WHATSAPP: 'WhatsApp', NOTE: 'Anotação' };

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('prospecting.read');
  const { id } = await params;
  const p = await db.businessProspect.findFirst({ where: { id, organizationId: ctx.orgId, ...ownProspects(ctx) }, include: { activities: { orderBy: { createdAt: 'desc' }, take: 50 } } });
  if (!p) notFound();

  const r = p.research as Research | null;
  const reg = (p.registry as CompanyRegistryExtra | null) ?? {};
  const partners = (p.partners as Partner[] | null) ?? [];
  const q = p.qualification as Qualification | null;
  const progress = qualificationProgress(q);
  const stage = p.sdrStage as Stage | null;
  const active = stage === 'NOVO' || stage === 'EM_CADENCIA' || stage === 'CONVERSANDO';
  const step = CADENCE[p.sdrStep];
  const channel = stage === 'CONVERSANDO' ? null : step?.channel;
  const sample = r?.sample ?? p.sourceRef?.startsWith('sample:') ?? false;
  const canWork = can(ctx, 'prospecting.convert') && !!ctx.consultantId && p.assignedConsultantId === ctx.consultantId;
  const consultant = p.assignedConsultantId ? await db.consultant.findUnique({ where: { id: p.assignedConsultantId }, select: { name: true } }) : null;

  return (
    <>
      <PageHeader
        title={p.name}
        crumb="Prospecção → Empresas → Ficha"
        actions={
          <Link href="/empresas" className={buttonClass('ghost', 'sm')}>
            Voltar
          </Link>
        }
        subtitle={`${p.category} · ${p.city}/${p.uf}${consultant ? ` · com ${consultant.name}` : ''}`}
      />
      <div className="flex flex-wrap gap-1.5 -mt-2">
        {p.researchScore != null && <Badge tone={scoreTone(p.researchScore)}>Nota {p.researchScore}</Badge>}
        {stage && <Badge tone={stage === 'QUALIFICADA' ? 'green' : stage === 'DESCARTADA' || stage === 'ENCERRADA' ? 'gray' : 'blue'}>SDR: {STAGES[stage]}</Badge>}
        {p.status === 'CONVERTED' && p.leadId && (
          <Link href={`/leads/${p.leadId}`}>
            <Badge tone="green">Virou lead</Badge>
          </Link>
        )}
        {sample && <Badge tone="amber">Exemplo fictício</Badge>}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4 items-start">
        <div className="lg:col-span-2 grid gap-4">
          <Card title="Dados da empresa" subtitle="Cadastro público da Receita Federal">
            <dl className="grid sm:grid-cols-3 gap-4">
              <KV label="CNPJ">{p.cnpj ? formatCnpj(p.cnpj) : null}</KV>
              <KV label="Razão social">{reg.legalName ?? p.name}</KV>
              <KV label="Situação">{p.situation}</KV>
              <KV label="Abertura">{p.openedAt ? `${date(p.openedAt)} (${yearsSince(p.openedAt)} anos)` : null}</KV>
              <KV label="Capital social">{p.shareCapital != null ? brl(p.shareCapital) : null}</KV>
              <KV label="Porte">{p.size}</KV>
              <KV label="Natureza jurídica">{reg.legalNature}</KV>
              <KV label="Regime">{reg.mei ? 'MEI' : reg.simples ? 'Simples Nacional' : reg.simples === false ? 'Fora do Simples' : null}</KV>
              <KV label="Atividade principal">{p.cnae}</KV>
              <KV label="Endereço">{[p.address, p.neighborhood, `${p.city}/${p.uf}`, reg.cep].filter(Boolean).join(' · ')}</KV>
              <KV label="Telefones">{[p.phone, reg.phone2].filter(Boolean).map((t) => formatPhone(t)).join(' · ') || null}</KV>
              <KV label="E-mail">{p.email}</KV>
            </dl>
            {!!reg.secondaryCnaes?.length && (
              <div className="mt-4 text-sm">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Atividades secundárias</div>
                <ul className="mt-1 text-muted list-disc pl-4">
                  {reg.secondaryCnaes.map((c) => (
                    <li key={c.code}>
                      {c.code}
                      {c.description ? ` · ${c.description}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title={`Sócios (${partners.length})`} subtitle="Quadro societário. Veja em que outras empresas cada sócio está: o mesmo decisor pode render mais de uma carta.">
            {partners.length ? (
              <ul className="divide-y divide-line -my-2">
                {partners.map((s) => (
                  <li key={s.name} className="py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <b className="font-medium">{s.name}</b>
                      {s.role && <Badge tone={/administrador|diretor|presidente/i.test(s.role) ? 'blue' : 'gray'}>{s.role}</Badge>}
                      <span className="text-xs text-muted">
                        {[s.since ? `sócio desde ${date(s.since)}` : null, s.ageRange, s.document ? `doc. ${s.document}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div className="mt-2">
                      <PartnerCompanies prospectId={p.id} name={s.name} canAdd={!!ctx.consultantId && can(ctx, 'prospecting.convert')} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sem sócios no cadastro (comum em empresário individual e MEI). Pergunte na ligação quem cuida das compras.</p>
            )}
          </Card>

          {r && (
            <Card title="Análise do Agente Pesquisador">
              <ResearchDetails p={p} />
            </Card>
          )}
        </div>

        <div className="grid gap-4">
          <Card title="SDR" subtitle="Cadência de primeiro contato: o sistema diz o que fazer e quando; você executa e registra.">
            {!stage || (!active && stage !== 'QUALIFICADA') ? (
              <div className="grid gap-2">
                <p className="text-sm text-muted">{stage ? `Cadência ${STAGES[stage].toLowerCase()}.` : 'Esta empresa ainda não está na cadência.'}</p>
                {canWork && p.status !== 'CONVERTED' && (
                  <ActionButton variant="primary" path={`/prospecting/${p.id}/sdr`} body={{ action: 'start' }} success="Empresa na cadência: a 1ª etapa é para hoje.">
                    {stage ? 'Recomeçar cadência' : 'Iniciar cadência'}
                  </ActionButton>
                )}
              </div>
            ) : stage === 'QUALIFICADA' ? (
              <Notice tone="green" title="Qualificada:">
                virou lead com o que foi levantado.{' '}
                {p.leadId && (
                  <Link className="underline" href={`/leads/${p.leadId}`}>
                    Abrir o lead
                  </Link>
                )}
              </Notice>
            ) : (
              <div className="grid gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted">{stage === 'CONVERSANDO' ? 'Em conversa com a empresa' : `Etapa ${p.sdrStep + 1} de ${CADENCE.length}`}</div>
                  <b className="font-medium">{stage === 'CONVERSANDO' ? 'Qualificar e passar para lead' : step.label}</b>
                  <div className="text-xs text-muted mt-0.5">{stage === 'CONVERSANDO' ? 'Preencha as perguntas abaixo. Ligue ou mande mensagem e registre o resultado.' : step.goal}</div>
                  <div className="text-xs mt-1">Quando: {p.sdrNextAt ? dateTime(p.sdrNextAt) : '—'}</div>
                </div>
                {channel !== 'CALL' && p.sdrMessage && <p className="rounded-lg bg-brand-50 px-3 py-2 whitespace-pre-line">{p.sdrMessage}</p>}
                {channel === 'CALL' && r?.approach && <p className="rounded-lg border border-line px-3 py-2 whitespace-pre-line text-xs">{r.approach}</p>}
                {canWork && !sample && p.phone && (
                  <div className="flex flex-wrap gap-1.5">
                    <a href={`tel:${p.phone.replace(/\D/g, '')}`} className={buttonClass(channel === 'CALL' ? 'primary' : 'secondary', 'sm')}>
                      Ligar
                    </a>
                    {!isLandlineBR(p.phone) && (
                      <WhatsAppContactButton url={waLink(p.phone, p.sdrMessage)} prospectId={p.id} className={buttonClass(channel === 'WHATSAPP' ? 'primary' : 'secondary', 'sm')}>
                        WhatsApp com a mensagem
                      </WhatsAppContactButton>
                    )}
                  </div>
                )}
                {canWork && sample && <p className="text-xs text-muted">Exemplo fictício: sem ligar nem WhatsApp. Registre um resultado para ver a cadência andar.</p>}
                {canWork && (
                  <TouchButtons
                    prospectId={p.id}
                    results={stage === 'CONVERSANDO' ? [['ANOTACAO', 'Anotação'], ['DECISOR', 'Falei com o decisor'], ['RESPONDEU', 'Respondeu'], ['SEM_INTERESSE', 'Sem interesse']] : Object.entries(RESULTS[channel ?? 'CALL'])}
                  />
                )}
              </div>
            )}
          </Card>

          {(stage === 'CONVERSANDO' || q) && (
            <Card title={`Qualificação (${progress.done} de ${progress.total})`} subtitle="Qualificada = o quê, quanto, quando e falou com quem decide.">
              {canWork && stage === 'CONVERSANDO' ? (
                <>
                  <QualificationForm prospectId={p.id} initial={q} product={r?.product ?? ''} />
                  {progress.qualified && (
                    <div className="mt-3">
                      <ActionButton variant="primary" path={`/prospecting/${p.id}/sdr`} body={{ action: 'handoff' }} success="Virou lead seu, com a qualificação.">
                        Passar para lead
                      </ActionButton>
                    </div>
                  )}
                </>
              ) : (
                <dl className="grid gap-2 text-sm">
                  <KV label="O que pretende comprar">{q?.want}</KV>
                  <KV label="Valor">{q?.value ? brl(q.value) : null}</KV>
                  <KV label="Para quando">{q?.term}</KV>
                  <KV label="Lance">{q?.hasBid == null ? null : q.hasBid ? 'Sim' : 'Não'}</KV>
                </dl>
              )}
            </Card>
          )}

          <Card title="Histórico de contatos" pad={false}>
            {p.activities.length ? (
              <ul className="divide-y divide-line">
                {p.activities.map((a) => (
                  <li key={a.id} className="px-5 py-2.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <b className="font-medium">
                        {CHANNEL_LABEL[a.channel] ?? a.channel}: {RESULT_LABEL[a.result] ?? a.result}
                      </b>
                      <span className="text-xs text-muted whitespace-nowrap">{dateTime(a.createdAt)}</span>
                    </div>
                    {a.step != null && <div className="text-xs text-muted">{CADENCE[a.step]?.label}</div>}
                    {a.note && <div className="text-xs mt-0.5">{a.note}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">Nenhum contato registrado.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
