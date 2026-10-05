'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, FieldGroup, Modal, inputClass } from '@/components/client';
import { PRODUCTS, SOURCES } from '@/modules/leads/catalog';

type Opt = { id: string; name: string };
type V = {
  name: string;
  priority: string;
  active: boolean;
  conditions: { products: string[]; regionIds: string[]; cities: string; ufs: string; sources: string[]; minScore: string };
  pjIds: string[];
  method: string;
  consultantId: string;
  capacity: string;
};

const METHODS = { EQUAL_SPLIT: 'Divisão igual (quem recebeu menos no mês)', ROUND_ROBIN: 'Round Robin', LEAST_LOAD: 'Menor carga', PRIORITY: 'Prioridade do consultor', SPECIFIC_CONSULTANT: 'Consultor específico' };

function Checks({ items, value, onChange }: { items: [string, string][]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {items.map(([k, l]) => (
        <label key={k} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} /> {l}
        </label>
      ))}
    </div>
  );
}

export function RuleForm({ id, initial, options }: { id?: string; initial?: V; options: { regions: Opt[]; pjs: Opt[]; consultants: Opt[] } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<V>(initial ?? { name: '', priority: '100', active: true, conditions: { products: [], regionIds: [], cities: '', ufs: '', sources: [], minScore: '' }, pjIds: [], method: 'EQUAL_SPLIT', consultantId: '', capacity: '' });
  const setC = (patch: Partial<V['conditions']>) => setV((x) => ({ ...x, conditions: { ...x.conditions, ...patch } }));
  return (
    <>
      <button className={id ? buttonClass('secondary', 'sm') : buttonClass('primary')} onClick={() => setOpen(true)}>
        {id ? 'Editar' : '+ Nova regra'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={id ? 'Editar regra' : 'Nova regra de distribuição'}
        wide
        footer={
          <button
            className={buttonClass('primary')}
            onClick={async () => {
              try {
                const c = v.conditions;
                await api(id ? `/routing/rules/${id}` : '/routing/rules', {
                  method: id ? 'PATCH' : 'POST',
                  body: {
                    name: v.name,
                    priority: Number(v.priority),
                    active: v.active,
                    conditions: {
                      products: c.products,
                      regionIds: c.regionIds,
                      cities: c.cities.split(',').map((x) => x.trim()).filter(Boolean),
                      ufs: c.ufs.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean),
                      sources: c.sources,
                      minScore: c.minScore === '' ? null : Number(c.minScore),
                    },
                    pjIds: v.pjIds,
                    method: v.method,
                    consultantId: v.consultantId || null,
                    capacity: v.capacity === '' ? null : Number(v.capacity),
                  },
                });
                toast('Regra salva (auditado).');
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Salvar regra
          </button>
        }
      >
        <div className="grid sm:grid-cols-[1fr_140px] gap-3 mb-4">
          <Field label="Nome">
            <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Prioridade" hint="Menor = avaliada antes">
            <input className={inputClass} type="number" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })} />
          </Field>
        </div>
        <div className="rounded-xl border border-line p-4 space-y-3">
          <b className="text-sm text-brand-700">SE</b>
          <FieldGroup label="Produto">
            <Checks items={Object.entries(PRODUCTS)} value={v.conditions.products} onChange={(products) => setC({ products })} />
          </FieldGroup>
          <FieldGroup label="Região">
            <Checks items={options.regions.map((r) => [r.id, r.name])} value={v.conditions.regionIds} onChange={(regionIds) => setC({ regionIds })} />
          </FieldGroup>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Cidades (vírgula)">
              <input className={inputClass} value={v.conditions.cities} onChange={(e) => setC({ cities: e.target.value })} />
            </Field>
            <Field label="UFs (vírgula)">
              <input className={inputClass} value={v.conditions.ufs} onChange={(e) => setC({ ufs: e.target.value })} />
            </Field>
            <Field label="Score mínimo">
              <input className={inputClass} type="number" min={0} max={100} value={v.conditions.minScore} onChange={(e) => setC({ minScore: e.target.value })} />
            </Field>
          </div>
          <FieldGroup label="Origem">
            <Checks items={Object.entries(SOURCES)} value={v.conditions.sources} onChange={(sources) => setC({ sources })} />
          </FieldGroup>
        </div>
        <div className="rounded-xl border border-line p-4 space-y-3 mt-3">
          <b className="text-sm text-brand-700">ENTÃO</b>
          <FieldGroup label="PJs (vazio = todas as PJs ativas)">
            <Checks items={options.pjs.map((p) => [p.id, p.name])} value={v.pjIds} onChange={(pjIds) => setV({ ...v, pjIds })} />
          </FieldGroup>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Método">
              <select className={inputClass} value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>
                {Object.entries(METHODS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            {v.method === 'SPECIFIC_CONSULTANT' && (
              <Field label="Consultor">
                <select className={inputClass} value={v.consultantId} onChange={(e) => setV({ ...v, consultantId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {options.consultants.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Capacidade por consultor" hint="Máx. leads abertos nesta regra">
              <input className={inputClass} type="number" min={1} value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Regra ativa
          </label>
        </div>
      </Modal>
    </>
  );
}
