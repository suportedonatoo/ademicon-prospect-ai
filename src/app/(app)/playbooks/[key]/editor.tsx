'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Card, buttonClass, cx } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

type Step =
  | { type: 'ACTION'; action: string; params: Record<string, unknown> }
  | { type: 'WAIT'; minutes: number }
  | { type: 'CONDITION'; condition: { field: string; op: string; value: string | number }; onFalse: 'STOP' | 'SKIP_NEXT' };

type Opt = { value: string; label: string };
type Initial = { playbookKey: string; name: string; description: string; priority: number; segment: Record<string, string[]>; steps: Step[] };

const ACTIONS: Opt[] = [
  { value: 'notify_consultant', label: 'Notificar consultor responsável' },
  { value: 'notify_role', label: 'Notificar gestores' },
  { value: 'create_task', label: 'Criar tarefa' },
  { value: 'recompute_nba', label: 'Recalcular próxima melhor ação' },
  { value: 'create_opportunity', label: 'Criar oportunidade' },
  { value: 'handoff_to_human', label: 'Transferir conversa para humano' },
  { value: 'send_template', label: 'Enviar template aprovado (exige opt-in)' },
];
const FIELDS: Opt[] = [
  { value: 'lead.status', label: 'Status do lead' },
  { value: 'lead.temperature', label: 'Temperatura' },
  { value: 'lead.score', label: 'Score' },
  { value: 'lead.intent', label: 'Intenção' },
  { value: 'lead.consultantId', label: 'Consultor (id)' },
  { value: 'lead.lifecycle', label: 'Ciclo de vida' },
];
const OPS: Opt[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'in', label: 'em (lista)' },
];
const TEMPS: Opt[] = [
  { value: 'FRIO', label: 'Frio' },
  { value: 'MORNO', label: 'Morno' },
  { value: 'QUENTE', label: 'Quente' },
];

export function PlaybookEditor({ initial, isNew, canEdit, options }: { initial: Initial; isNew: boolean; canEdit: boolean; options: { products: Opt[]; sources: Opt[]; regions: Opt[]; pjs: Opt[] } }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const setStep = (i: number, s: Step) => setV((x) => ({ ...x, steps: x.steps.map((st, j) => (j === i ? s : st)) }));
  const move = (i: number, d: -1 | 1) =>
    setV((x) => {
      const steps = [...x.steps];
      const j = i + d;
      if (j < 0 || j >= steps.length) return x;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...x, steps };
    });
  const toggleSeg = (k: string, val: string) =>
    setV((x) => {
      const cur = new Set(x.segment[k] ?? []);
      if (cur.has(val)) cur.delete(val);
      else cur.add(val);
      return { ...x, segment: { ...x.segment, [k]: [...cur] } };
    });

  const save = async () => {
    setBusy(true);
    try {
      const steps = v.steps.map((s) => (s.type === 'CONDITION' ? { ...s, condition: { ...s.condition, value: s.condition.op === 'gte' || s.condition.op === 'lte' ? Number(s.condition.value) : s.condition.value } } : s));
      const saved = await api<{ playbookKey: string; version: number }>('/playbooks', { body: { ...v, steps, priority: Number(v.priority) } });
      toast(`Versão v${saved.version} salva como rascunho.`);
      router.push(`/playbooks/${saved.playbookKey}?v=${saved.version}`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const Seg = ({ k, label, opts }: { k: string; label: string; opts: Opt[] }) => (
    <fieldset>
      <legend className="text-[12.5px] font-medium text-ink-2 mb-1">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const on = (v.segment[k] ?? []).includes(o.value);
          return (
            <button type="button" key={o.value} aria-pressed={on} onClick={() => toggleSeg(k, o.value)} className={cx('rounded-full border px-2.5 py-0.5 text-xs', on ? 'bg-ink border-ink text-white' : 'border-line hover:bg-slate-50')}>
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <fieldset disabled={!canEdit} className="space-y-4">
      <Card title="Identificação">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Nome">
            <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Chave (única)" hint="letras minúsculas, números e _">
            <input className={inputClass + ' font-mono'} value={v.playbookKey} readOnly={!isNew} onChange={(e) => setV({ ...v, playbookKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
          </Field>
          <Field label="Prioridade" hint="menor = avaliado primeiro">
            <input type="number" className={inputClass} value={v.priority} onChange={(e) => setV({ ...v, priority: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Descrição" className="mt-3">
          <input className={inputClass} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
      </Card>
      <Card title="Segmento" subtitle="Vazio = vale para todos. O mais específico/prioritário vence.">
        <div className="space-y-3">
          <Seg k="temperatures" label="Temperatura" opts={TEMPS} />
          <Seg k="products" label="Produto" opts={options.products} />
          <Seg k="sources" label="Origem" opts={options.sources} />
          {options.regions.length > 0 && <Seg k="regionIds" label="Região" opts={options.regions} />}
          {options.pjs.length > 0 && <Seg k="pjIds" label="PJ" opts={options.pjs} />}
        </div>
      </Card>
      <Card title="Passos" subtitle="Executados em ordem. ESPERA pausa o playbook; CONDIÇÃO falsa encerra (ou pula o próximo passo).">
        <ol className="space-y-2">
          {v.steps.map((s, i) => (
            <li key={i} className="rounded-lg border border-line p-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted w-6">#{i + 1}</span>
              <select
                className={inputClass + ' w-36'}
                value={s.type}
                aria-label={`Tipo do passo ${i + 1}`}
                onChange={(e) => {
                  const t = e.target.value;
                  setStep(i, t === 'WAIT' ? { type: 'WAIT', minutes: 15 } : t === 'CONDITION' ? { type: 'CONDITION', condition: { field: 'lead.status', op: 'eq', value: 'ASSIGNED' }, onFalse: 'STOP' } : { type: 'ACTION', action: 'notify_consultant', params: {} });
                }}
              >
                <option value="ACTION">Ação</option>
                <option value="WAIT">Espera</option>
                <option value="CONDITION">Condição</option>
              </select>
              {s.type === 'ACTION' && (
                <>
                  <select className={inputClass + ' flex-1 min-w-[200px]'} value={s.action} aria-label="Ação" onChange={(e) => setStep(i, { ...s, action: e.target.value })}>
                    {ACTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  {['create_task', 'notify_consultant', 'notify_role'].includes(s.action) && (
                    <input className={inputClass + ' flex-1 min-w-[180px]'} placeholder="Título (use {lead} para o nome)" value={String(s.params.title ?? '')} onChange={(e) => setStep(i, { ...s, params: { ...s.params, title: e.target.value } })} aria-label="Título" />
                  )}
                  {s.action === 'send_template' && <input className={inputClass + ' w-48'} placeholder="nome_do_template" value={String(s.params.template ?? '')} onChange={(e) => setStep(i, { ...s, params: { ...s.params, template: e.target.value } })} aria-label="Template" />}
                </>
              )}
              {s.type === 'WAIT' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="number" min={1} className={inputClass + ' w-24'} value={s.minutes} onChange={(e) => setStep(i, { ...s, minutes: Math.max(1, Number(e.target.value)) })} /> minutos
                </label>
              )}
              {s.type === 'CONDITION' && (
                <>
                  <select className={inputClass + ' w-40'} value={s.condition.field} aria-label="Campo" onChange={(e) => setStep(i, { ...s, condition: { ...s.condition, field: e.target.value } })}>
                    {FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select className={inputClass + ' w-24'} value={s.condition.op} aria-label="Operador" onChange={(e) => setStep(i, { ...s, condition: { ...s.condition, op: e.target.value } })}>
                    {OPS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input className={inputClass + ' w-32'} value={String(s.condition.value)} aria-label="Valor" onChange={(e) => setStep(i, { ...s, condition: { ...s.condition, value: e.target.value } })} />
                  <select className={inputClass + ' w-36'} value={s.onFalse} aria-label="Se falso" onChange={(e) => setStep(i, { ...s, onFalse: e.target.value as 'STOP' | 'SKIP_NEXT' })}>
                    <option value="STOP">se falso: encerrar</option>
                    <option value="SKIP_NEXT">se falso: pular próximo</option>
                  </select>
                </>
              )}
              <span className="ml-auto flex gap-1">
                <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => move(i, -1)} aria-label="Mover para cima">
                  ↑
                </button>
                <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => move(i, 1)} aria-label="Mover para baixo">
                  ↓
                </button>
                <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setV({ ...v, steps: v.steps.filter((_, j) => j !== i) })} aria-label="Remover passo">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="flex gap-2 mt-3">
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setV({ ...v, steps: [...v.steps, { type: 'ACTION', action: 'create_task', params: {} }] })}>
            + Ação
          </button>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setV({ ...v, steps: [...v.steps, { type: 'WAIT', minutes: 60 }] })}>
            + Espera
          </button>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setV({ ...v, steps: [...v.steps, { type: 'CONDITION', condition: { field: 'lead.status', op: 'eq', value: 'ASSIGNED' }, onFalse: 'STOP' }] })}>
            + Condição
          </button>
        </div>
      </Card>
      {canEdit && (
        <button className={buttonClass('primary')} disabled={busy || !v.name || !v.playbookKey || !v.steps.length} onClick={save}>
          {busy ? 'Salvando…' : 'Salvar nova versão (rascunho)'}
        </button>
      )}
    </fieldset>
  );
}
