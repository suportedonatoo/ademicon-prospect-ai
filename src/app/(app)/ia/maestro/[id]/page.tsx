import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { getExecutionTrace } from '@/modules/ai/ai-admin.service';
import { Badge, Card, PageHeader } from '@/components/ui';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'AI Trace' };

const TONE: Record<string, 'gray' | 'blue' | 'violet' | 'amber' | 'green' | 'red'> = {
  USER: 'gray',
  MAESTRO: 'violet',
  MEMORY: 'blue',
  RAG: 'blue',
  AGENT: 'violet',
  RULES: 'amber',
  SUPERVISOR: 'amber',
  RESPONSE: 'green',
};

/** AI TRACE: USER → MAESTRO → MEMORY → RAG → AGENT → RULES → SUPERVISOR → RESPONSE. */
export default async function TracePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('ai.read');
  const { id } = await params;
  const { execution: e, steps, lead } = await getExecutionTrace(ctx, id);
  return (
    <>
      <PageHeader
        crumb="IA → Maestro"
        title="AI Trace"
        subtitle={
          <>
            Execução <code className="text-xs">{e.id}</code> · {dateTime(e.startedAt)}
            {lead && (
              <>
                {' · '}
                <Link className="text-brand-600 hover:underline" href={`/leads/${lead.id}`}>
                  {lead.name}
                </Link>
              </>
            )}
            {e.conversationId && (
              <>
                {' · '}
                <Link className="text-brand-600 hover:underline" href={`/conversas?c=${e.conversationId}`}>
                  conversa
                </Link>
              </>
            )}
          </>
        }
        actions={
          <Link className="text-sm text-brand-600 hover:underline" href="/ia/maestro">
            ← Voltar ao Maestro
          </Link>
        }
      />
      <ol className="space-y-3" aria-label="Caminho da execução">
        {steps.map((s, i) => (
          <li key={s.key} className="relative pl-10">
            <span className="absolute left-0 top-3 grid place-items-center size-7 rounded-full bg-ink text-white text-xs font-bold" aria-hidden>
              {i + 1}
            </span>
            {i < steps.length - 1 && <span className="absolute left-3.5 top-10 bottom-[-12px] w-px bg-line" aria-hidden />}
            <Card
              title={
                <span className="flex items-center gap-2">
                  <Badge tone={TONE[s.key] ?? 'gray'}>{s.key}</Badge> {s.title}
                </span>
              }
            >
              <StepBody k={s.key} data={s.data as Record<string, unknown>} />
            </Card>
          </li>
        ))}
      </ol>
      {e.feedback.length > 0 && (
        <Card title="Feedback humano" className="mt-4">
          <ul className="text-sm space-y-1">
            {e.feedback.map((f) => (
              <li key={f.id}>
                <Badge tone={f.rating === 'GOOD' ? 'green' : f.rating === 'NEEDS_REVIEW' ? 'amber' : 'red'}>{f.rating}</Badge> {f.comment ?? ''} <span className="text-xs text-muted">{dateTime(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function StepBody({ k, data }: { k: string; data: Record<string, unknown> }) {
  if (k === 'RAG') {
    const fontes = (data.fontes as { documentId: string; chunkId: string; title: string; relevance: number; versao: number | null; status: string }[]) ?? [];
    return fontes.length ? (
      <ul className="text-sm space-y-1.5">
        {fontes.map((f) => (
          <li key={f.chunkId} className="flex flex-wrap items-center gap-2">
            <Link className="text-brand-600 hover:underline" href={`/ia/knowledge/${f.documentId}`}>
              {f.title}
            </Link>
            <span className="text-xs text-muted">
              relevância {f.relevance} · v{f.versao ?? '?'} · {f.status} · chunk <code>{f.chunkId.slice(-8)}</code>
            </span>
          </li>
        ))}
        {data.semResposta ? <li className="text-warn text-xs">Pergunta sem resposta confiável na base → Knowledge Gap</li> : null}
      </ul>
    ) : (
      <p className="text-sm text-muted">Nenhum trecho da base usado{data.semResposta ? ' (registrado como Knowledge Gap)' : ''}.</p>
    );
  }
  if (k === 'SUPERVISOR') {
    const v = (data.violacoes as { check: string; rule: string; excerpt?: string }[]) ?? [];
    return (
      <div className="text-sm">
        <Badge tone={data.veredito === 'APPROVED' ? 'green' : data.veredito === 'BLOCKED' ? 'red' : 'amber'}>{String(data.veredito ?? '—')}</Badge>
        {v.length ? (
          <ul className="mt-2 space-y-1 text-xs">
            {v.map((x, i) => (
              <li key={i}>
                <b>{x.check}</b>: {x.rule}
                {x.excerpt ? <span className="text-muted"> — “{x.excerpt}”</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted">Sem ajustes.</p>
        )}
      </div>
    );
  }
  if (k === 'USER' || k === 'AGENT' || k === 'RESPONSE') {
    const texto = (data.texto ?? data.rascunho) as string | null;
    const rest = Object.entries(data).filter(([key]) => key !== 'texto' && key !== 'rascunho');
    return (
      <div className="space-y-2">
        {texto && <p className="rounded-lg bg-canvas px-3 py-2 text-sm whitespace-pre-line">{texto}</p>}
        <KV entries={rest} />
      </div>
    );
  }
  return <KV entries={Object.entries(data)} />;
}

function KV({ entries }: { entries: [string, unknown][] }) {
  const shown = entries.filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && v && !Array.isArray(v) && !Object.keys(v).length));
  if (!shown.length) return <p className="text-xs text-muted">—</p>;
  return (
    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
      {shown.map(([key, v]) => (
        <div key={key} className="flex gap-2 min-w-0">
          <dt className="text-muted shrink-0">{key}</dt>
          <dd className="truncate" title={typeof v === 'object' ? JSON.stringify(v) : String(v)}>
            {typeof v === 'boolean' ? (v ? 'sim' : 'não') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
