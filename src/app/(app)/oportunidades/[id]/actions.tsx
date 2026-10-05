'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { inputClass } from '@/components/client';
import { LOSS_CATEGORIES } from '@/modules/opportunities/health-engine';

export function OpportunityActions({ id, value, stages, current }: { id: string; value: number; stages: { key: string; name: string; isLost: boolean }[]; current: string }) {
  const router = useRouter();
  const [stage, setStage] = useState(current);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [val, setVal] = useState(String(value));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const target = stages.find((s) => s.key === stage);

  const submit = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      await api(`/opportunities/${id}`, { method: 'PATCH', body });
      toast(msg);
      setNote('');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-3">
      <div className="flex gap-2">
        <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Etapa">
          {stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          className={buttonClass('primary')}
          disabled={busy || stage === current || (target?.isLost && (!reason || !category))}
          onClick={() => submit({ stageKey: stage, lostReason: reason || undefined, lostCategory: category || undefined, competitor: competitor || undefined }, 'Etapa atualizada.')}
        >
          Mover
        </button>
      </div>
      {target?.isLost && (
        <div className="lg:col-span-3 grid sm:grid-cols-3 gap-2 rounded-lg border border-red-200 bg-bad-50 p-3">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria da perda">
            <option value="">Categoria da perda…</option>
            {Object.entries(LOSS_CATEGORIES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <input className={inputClass} placeholder="Motivo (obrigatório)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo da perda" />
          <input className={inputClass} placeholder="Concorrente (se houver)" value={competitor} onChange={(e) => setCompetitor(e.target.value)} aria-label="Concorrente" />
        </div>
      )}
      <div className="flex gap-2">
        <input className={inputClass} inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))} aria-label="Valor" />
        <button className={buttonClass('secondary')} disabled={busy || Number(val) === value} onClick={() => submit({ value: Number(val) }, 'Valor atualizado.')}>
          Atualizar valor
        </button>
      </div>
      <div className="flex gap-2">
        <input className={inputClass} placeholder="Anotação" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className={buttonClass('secondary')} disabled={busy || !note.trim()} onClick={() => submit({ note }, 'Anotação salva.')}>
          Salvar
        </button>
      </div>
    </div>
  );
}
