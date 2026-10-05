'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Badge, Card, buttonClass, cx } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

type Version = { id: string; agentKey: string; version: number; status: string };
type Run = { id: string; agentKey: string; promptVersion: number | null; metrics: Record<string, number>; results: { input: string; reply: string; passed: boolean; fails: string[]; confidence: number; latencyMs: number }[]; createdAt: string };
type Dataset = { id: string; name: string; kind: string; description: string | null; cases: { id: string; input: string; tags: string[] }[]; runs: Run[] };
type LabResult = { reply: string; draft: string; supervisor: { action: string; violations: { rule: string; excerpt: string }[] }; sources: { title: string; relevance: number }[]; intent: string; wantsHuman: boolean; knowledgeGap: boolean; confidence: number; riskLevel: string; requiresHuman: boolean; confidenceReason: string; latencyMs: number; model: string; promptVersion: number | null; tokens: { input: number; output: number } | null };

export function LabClient({ versions, datasets, canRun }: { versions: Version[]; datasets: Dataset[]; canRun: boolean }) {
  const router = useRouter();
  const [agent, setAgent] = useState<'PROSPECT' | 'QUALIFICATION'>('PROSPECT');
  const [versionId, setVersionId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [q, setQ] = useState('Como funciona a contemplação por lance?');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ label: string; r: LabResult }[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const agentVersions = versions.filter((v) => v.agentKey === agent);

  const test = async () => {
    setBusy(true);
    try {
      const targets = [versionId, ...(compareId && compareId !== versionId ? [compareId] : [])];
      const out = await Promise.all(
        targets.map(async (id) => {
          const r = await api<LabResult>('/ai/lab', { body: { agentKey: agent, promptVersionId: id || undefined, question: q } });
          const v = versions.find((x) => x.id === id);
          return { label: v ? `v${v.version} (${v.status})` : 'Versão ativa', r };
        })
      );
      setResults(out);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const runEval = async (datasetId: string) => {
    setRunning(datasetId);
    try {
      await api('/ai/evals', { body: { datasetId, agentKey: agent, promptVersionId: versionId || undefined } });
      toast('Avaliação concluída.');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <Card title="Testar pergunta" subtitle="Compare duas versões de prompt lado a lado">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Agente">
            <select className={inputClass} value={agent} onChange={(e) => { setAgent(e.target.value as never); setVersionId(''); setCompareId(''); }}>
              <option value="PROSPECT">Prospecção</option>
              <option value="QUALIFICATION">Qualificação</option>
            </select>
          </Field>
          <Field label="Versão do prompt">
            <select className={inputClass} value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              <option value="">Ativa em produção</option>
              {agentVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Comparar com (opcional)">
            <select className={inputClass} value={compareId} onChange={(e) => setCompareId(e.target.value)}>
              <option value="">—</option>
              {agentVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.status}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Pergunta do cliente" className="mt-3">
          <textarea className={inputClass + ' h-20 py-2'} value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <button className={buttonClass('primary') + ' mt-3'} disabled={busy || !q.trim()} onClick={test}>
          {busy ? 'Executando…' : 'Executar'}
        </button>
        {results.length > 0 && (
          <div className={cx('grid gap-3 mt-4', results.length > 1 && 'lg:grid-cols-2')}>
            {results.map(({ label, r }) => (
              <div key={label} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <b>{label}</b>
                  <Badge tone={r.supervisor.action === 'APPROVED' ? 'green' : r.supervisor.action === 'REWRITTEN' ? 'amber' : 'red'}>Supervisor: {r.supervisor.action}</Badge>
                  <Badge tone={r.riskLevel === 'LOW' ? 'green' : r.riskLevel === 'MEDIUM' ? 'amber' : 'red'}>Risco {r.riskLevel}</Badge>
                  <Badge tone="gray">confiança {r.confidence.toFixed(2)}</Badge>
                  {r.requiresHuman && <Badge tone="violet">exige humano</Badge>}
                </div>
                <p className="whitespace-pre-line text-ink">{r.reply}</p>
                {r.draft !== r.reply && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted">Rascunho antes do Supervisor</summary>
                    <p className="whitespace-pre-line mt-1">{r.draft}</p>
                    <ul className="mt-1 list-disc pl-4 text-bad">
                      {r.supervisor.violations.map((v, i) => (
                        <li key={i}>
                          {v.rule}: “{v.excerpt}”
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="text-xs text-muted mt-2">
                  Fontes: {r.sources.length ? r.sources.map((s) => `${s.title} (${s.relevance})`).join(' · ') : 'nenhuma'} · intenção {r.intent} · {r.latencyMs} ms · {r.model}
                  {r.tokens ? ` · ${r.tokens.input}/${r.tokens.output} tokens` : ''}
                </p>
                <p className="text-[11px] text-faint mt-1">Confiança: {r.confidenceReason}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <h2 className="text-[15px] font-semibold">Evaluation Lab</h2>
      <div className="grid lg:grid-cols-2 gap-4">
        {datasets.map((d) => {
          const last = d.runs[0];
          return (
            <Card
              key={d.id}
              title={d.name}
              subtitle={`${d.cases.length} caso(s) · ${d.description ?? d.kind}`}
              actions={
                canRun && (
                  <button className={buttonClass('primary', 'sm')} disabled={!!running} onClick={() => runEval(d.id)}>
                    {running === d.id ? 'Rodando…' : 'Rodar'}
                  </button>
                )
              }
            >
              {last ? (
                <>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
                    {[
                      ['Acurácia', last.metrics.accuracy],
                      ['Groundedness', last.metrics.groundedness],
                      ['Alucinação', last.metrics.hallucinationRate],
                      ['Handoff', last.metrics.handoffRate],
                    ].map(([l, v]) => (
                      <div key={l as string} className="rounded-lg bg-slate-50 border border-line p-2">
                        <b className="block text-base tabular">{v == null ? '—' : `${String(v).replace('.', ',')}%`}</b>
                        <span className="text-muted">{l}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-faint mb-2">
                    Última execução: {new Date(last.createdAt).toLocaleString('pt-BR')} · {last.agentKey} · prompt v{last.promptVersion ?? '—'} · {last.metrics.avgLatencyMs} ms/caso
                  </p>
                  <ul className="space-y-1.5 text-xs">
                    {last.results.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={r.passed ? 'text-ok' : 'text-bad'}>{r.passed ? '✓' : '✗'}</span>
                        <span className="min-w-0">
                          <b className="text-ink">{r.input}</b>
                          {!r.passed && <span className="block text-bad">{r.fails.join('; ')}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {d.runs.length > 1 && (
                    <p className="text-[11px] text-muted mt-3">
                      Histórico: {d.runs.map((r) => `${r.agentKey}/v${r.promptVersion ?? '—'} ${r.metrics.accuracy}%`).join(' · ')}
                    </p>
                  )}
                </>
              ) : (
                <ul className="text-xs text-muted list-disc pl-4">
                  {d.cases.map((c) => (
                    <li key={c.id}>{c.input}</li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
