'use client';

import { useState } from 'react';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { inputClass } from '@/components/client';

type Hit = { chunkId: string; title: string; content: string; score: number; category?: string };

export function RagTester() {
  const [q, setQ] = useState('Quanto tempo demora para ser contemplado?');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setHits(await api<Hit[]>(`/knowledge/search?q=${encodeURIComponent(q)}&topK=4`));
          } catch (err) {
            toast((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={buttonClass('primary')} disabled={busy}>
          Buscar
        </button>
      </form>
      {hits && (
        <ol className="mt-3 space-y-2">
          {hits.map((h, i) => (
            <li key={h.chunkId} className="rounded-lg border border-line p-3">
              <div className="flex justify-between gap-2 text-xs">
                <b className="text-ink">
                  {i + 1}. {h.title}
                </b>
                <span className="tabular text-muted">relevância {h.score.toFixed(2)}</span>
              </div>
              <p className="text-xs text-ink-2 mt-1 line-clamp-4">{h.content}</p>
            </li>
          ))}
          {hits.length === 0 && <li className="text-sm text-muted">Nenhum trecho encontrado — a IA registraria um Knowledge Gap.</li>}
        </ol>
      )}
    </div>
  );
}
