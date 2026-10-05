import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getOpportunity } from '@/modules/opportunities/opportunity.service';
import { isAppError } from '@/lib/errors';
import { productLabel, sourceLabel } from '@/modules/leads/catalog';
import { Badge, Card, KV, PageHeader, cx } from '@/components/ui';
import { ScoreBadge } from '@/components/badges';
import { brl, dateTime } from '@/lib/format';
import { OpportunityActions } from './actions';
import { getOpportunityIntelligence } from '@/modules/opportunities/opportunity-intelligence.service';
import { LOSS_CATEGORIES } from '@/modules/opportunities/health-engine';
import { CopilotPanel, SendToPhoneButton } from '@/components/v2-client';
import { StatusBadge2 } from '@/components/v2-ui';

export const metadata = { title: 'Oportunidade' };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('opportunity.read');
  const { id } = await params;
  let o;
  try {
    o = await getOpportunity(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  }
  const intel = await getOpportunityIntelligence(ctx, o.id);
  const stages = o.pipeline.stages;
  const idx = stages.findIndex((s) => s.id === o.stageId);
  return (
    <>
      <PageHeader
        crumb="Oportunidades"
        title={`Oportunidade #${o.code}`}
        subtitle={
          <span>
            <Link href={`/leads/${o.lead.id}`} className="text-brand-600 hover:underline">
              {o.lead.name}
            </Link>{' '}
            · {productLabel(o.product)} · {brl(o.value)}
          </span>
        }
        actions={
          <>
            <SendToPhoneButton targetType="OPPORTUNITY" targetId={o.id} />
            <Badge tone={o.status === 'WON' ? 'green' : o.status === 'LOST' ? 'red' : 'blue'}>{o.stage.name}</Badge>
          </>
        }
      />
      <Card className="mb-4">
        <ol className="flex flex-wrap gap-1.5">
          {stages
            .filter((s) => !s.isLost || o.status === 'LOST')
            .map((s, i) => (
              <li key={s.id} className={cx('text-xs rounded-full px-3 py-1 border', s.id === o.stageId ? (s.isLost ? 'bg-bad text-white border-bad' : 'bg-ink text-white border-ink') : i < idx ? 'bg-brand-50 text-brand-700 border-brand-100' : 'bg-white text-muted border-line')}>
                {s.name}
              </li>
            ))}
        </ol>
        {can(ctx, 'opportunity.update') && (
          <div className="mt-4">
            <OpportunityActions id={o.id} value={o.value} stages={stages.map((s) => ({ key: s.key, name: s.name, isLost: s.isLost }))} current={o.stage.key} />
          </div>
        )}
      </Card>
      {intel && (
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 mb-4">
          <Card title="Opportunity Intelligence" subtitle="Saúde por regra (não é probabilidade de fechamento)" actions={<StatusBadge2 s={intel.health} />}>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
              <KV label="Índice de saúde">{intel.score}/100</KV>
              <KV label="Na etapa há">{String(intel.stageAgeDays).replace('.', ',')} dia(s)</KV>
              <KV label="Sem atividade há">{String(intel.idleDays).replace('.', ',')} dia(s)</KV>
              <KV label="Velocidade">{String(intel.velocity).replace('.', ',')} etapa(s)/semana</KV>
            </dl>
            <div className="text-xs text-muted mb-1">Follow-up: {intel.followUpStatus === 'OK' ? 'em dia' : intel.followUpStatus === 'OVERDUE' ? 'atrasado' : 'sem próximo passo'}</div>
            <ul className="list-disc pl-5 text-sm text-ink-2 space-y-0.5">
              {intel.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Card>
          <Card title="AI Copilot" subtitle="Resumo, sugestão de resposta, objeções, próxima ação — nada é enviado sem você">
            <CopilotPanel leadId={o.lead.id} />
          </Card>
        </div>
      )}
      <div className="grid xl:grid-cols-[1fr_1.2fr] gap-4">
        <Card title="Dados">
          <dl className="grid grid-cols-2 gap-4">
            <KV label="Lead">
              <span className="inline-flex items-center gap-2">
                <ScoreBadge score={o.lead.score} temperature={o.lead.temperature} size="sm" /> {o.lead.name}
              </span>
            </KV>
            <KV label="Valor">{brl(o.value)}</KV>
            <KV label="Produto">{productLabel(o.product)}</KV>
            <KV label="Origem">{sourceLabel(o.source)}</KV>
            <KV label="PJ">{o.pj ? `${o.pj.code} · ${o.pj.name}` : '—'}</KV>
            <KV label="Consultor">{o.consultant?.name ?? '—'}</KV>
            <KV label="Criada">{dateTime(o.createdAt)}</KV>
            <KV label="Encerrada">{o.closedAt ? dateTime(o.closedAt) : '—'}</KV>
            {o.lostReason && <KV label="Motivo da perda">{o.lostReason}</KV>}
            {o.lostCategory && <KV label="Categoria da perda">{LOSS_CATEGORIES[o.lostCategory as keyof typeof LOSS_CATEGORIES] ?? o.lostCategory}</KV>}
            {o.competitor && <KV label="Concorrente">{o.competitor}</KV>}
          </dl>
        </Card>
        <Card title="Histórico de alterações (OpportunityActivity)">
          <ol className="relative space-y-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-line">
            {o.activities.map((a) => (
              <li key={a.id} className="relative pl-7">
                <span className={cx('absolute left-0 top-1 size-[15px] rounded-full border-2 border-white ring-1', a.type === 'CLOSED_WON' ? 'bg-ok ring-emerald-200' : a.type === 'CLOSED_LOST' ? 'bg-bad ring-red-200' : 'bg-brand-500 ring-brand-100')} />
                <div className="text-sm">{a.description}</div>
                <div className="text-xs text-muted">
                  {dateTime(a.createdAt)} · {a.type}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
