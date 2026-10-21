'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

type Cfg = { enabled: boolean; cities: string[]; perConsultant: number; minScore: number };
type Run = { delivered: number; analyzed: number; requests: number; consultants: number; source: string; skipped: string | null } | null;

/** Gestão: liga o Agente Pesquisador na lista das 7h, escolhe cidades/quantidade e roda na hora para testar. */
export function ResearchAgentConfig({ initial, defaultCities }: { initial: Cfg; defaultCities: string }) {
  const router = useRouter();
  const [f, setF] = useState({ ...initial, cities: initial.cities.join(', ') });
  const [busy, setBusy] = useState<'save' | 'run' | null>(null);

  const save = async () => {
    await api('/settings', {
      method: 'PUT',
      body: { researchAgent: { enabled: f.enabled, cities: f.cities.split(',').map((c) => c.trim()).filter(Boolean), perConsultant: Number(f.perConsultant), minScore: Number(f.minScore) } },
    });
  };

  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <Field label="Cidades (Cidade/UF, separadas por vírgula)" className="sm:col-span-2" hint={`Vazio = cidades das PJs (${defaultCities || 'nenhuma cadastrada'})`}>
          <input className={inputClass} value={f.cities} placeholder="Jundiaí/SP, Campinas/SP" onChange={(e) => setF({ ...f, cities: e.target.value })} />
        </Field>
        <Field label="Empresas por consultor/dia">
          <input className={inputClass} type="number" min={1} max={30} value={f.perConsultant} onChange={(e) => setF({ ...f, perConsultant: Number(e.target.value) })} />
        </Field>
        <Field label="Nota mínima (0–100)">
          <input className={inputClass} type="number" min={0} max={100} value={f.minScore} onChange={(e) => setF({ ...f, minScore: Number(e.target.value) })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
        Rodar todo dia útil às 7h, antes da lista do Google Maps
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass('secondary')}
          disabled={!!busy}
          onClick={async () => {
            setBusy('save');
            try {
              await save();
              toast('Configuração do agente salva.');
              router.refresh();
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'save' ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          className={buttonClass('primary')}
          disabled={!!busy}
          onClick={async () => {
            setBusy('run');
            try {
              await save();
              const r = await api<Run>('/prospecting/research', { body: {} });
              if (!r) toast('Nada a fazer.');
              else toast(`${r.delivered} empresa(s) entregue(s) a ${r.consultants} consultor(es) · ${r.analyzed} analisadas · fonte: ${r.source}${r.skipped ? ` · ${r.skipped}` : ''}`, r.delivered ? 'success' : 'info');
              router.refresh();
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'run' ? 'Pesquisando…' : 'Rodar agora'}
        </button>
      </div>
    </div>
  );
}
