'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Badge, Card, buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

type P = { id: string; key: string; name: string; objective: string; trigger: string; rules: string[]; agentKey: string; nextAction: string; active: boolean };

export function PlaybookCard({ p, canConfig }: { p: P; canConfig: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ ...p, rulesText: p.rules.join('\n') });
  if (!edit) {
    return (
      <Card title={p.name} subtitle={<code className="text-[11px]">{p.key}</code>} actions={<Badge tone={p.active ? 'green' : 'gray'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>}>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Objetivo</dt>
            <dd>{p.objective}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Gatilho</dt>
            <dd>{p.trigger}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Regras</dt>
            <dd>
              <ul className="list-disc pl-4 text-ink-2">
                {p.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="flex justify-between text-xs text-muted pt-1">
            <span>Agente: {p.agentKey === 'PROSPECT' ? 'Prospect Agent' : 'Qualification Agent'}</span>
            <span>Próxima ação: {p.nextAction}</span>
          </div>
        </dl>
        {canConfig && (
          <button className={buttonClass('secondary', 'sm') + ' mt-3'} onClick={() => setEdit(true)}>
            Editar
          </button>
        )}
      </Card>
    );
  }
  return (
    <Card title={`Editar: ${p.name}`}>
      <div className="space-y-2.5">
        <Field label="Nome">
          <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Objetivo">
          <textarea className={inputClass + ' h-16 py-2'} value={v.objective} onChange={(e) => setV({ ...v, objective: e.target.value })} />
        </Field>
        <Field label="Gatilho">
          <input className={inputClass} value={v.trigger} onChange={(e) => setV({ ...v, trigger: e.target.value })} />
        </Field>
        <Field label="Regras (uma por linha)">
          <textarea className={inputClass + ' h-24 py-2'} value={v.rulesText} onChange={(e) => setV({ ...v, rulesText: e.target.value })} />
        </Field>
        <Field label="Agente">
          <select className={inputClass} value={v.agentKey} onChange={(e) => setV({ ...v, agentKey: e.target.value })}>
            <option value="PROSPECT">Prospect Agent</option>
            <option value="QUALIFICATION">Qualification Agent</option>
          </select>
        </Field>
        <Field label="Próxima ação">
          <input className={inputClass} value={v.nextAction} onChange={(e) => setV({ ...v, nextAction: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Ativo
        </label>
        <div className="flex gap-2">
          <button
            className={buttonClass('primary', 'sm')}
            onClick={async () => {
              try {
                await api(`/ai/playbooks/${p.id}`, { method: 'PATCH', body: { name: v.name, objective: v.objective, trigger: v.trigger, rules: v.rulesText.split('\n').map((r) => r.trim()).filter(Boolean), agentKey: v.agentKey, nextAction: v.nextAction, active: v.active } });
                toast('Playbook salvo.');
                setEdit(false);
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Salvar
          </button>
          <button className={buttonClass('ghost', 'sm')} onClick={() => setEdit(false)}>
            Cancelar
          </button>
        </div>
      </div>
    </Card>
  );
}
