'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';
import { PRODUCTS } from '@/modules/leads/catalog';

type V = { pjId: string; name: string; email: string; phone: string; products: string[]; maxOpenLeads: string; priority: string; available: boolean; active: boolean };

export function ConsultantForm({ id, initial, pjs }: { id?: string; initial?: V; pjs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<V>(initial ?? { pjId: pjs[0]?.id ?? '', name: '', email: '', phone: '', products: [], maxOpenLeads: '30', priority: '0', available: true, active: true });
  return (
    <>
      <button className={id ? buttonClass('ghost', 'sm') : buttonClass('primary')} onClick={() => setOpen(true)}>
        {id ? 'Editar' : '+ Novo consultor'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={id ? 'Editar consultor' : 'Novo consultor'}
        footer={
          <button
            className={buttonClass('primary')}
            onClick={async () => {
              try {
                await api(id ? `/consultants/${id}` : '/consultants', { method: id ? 'PATCH' : 'POST', body: { ...v, phone: v.phone || null, maxOpenLeads: Number(v.maxOpenLeads), priority: Number(v.priority) } });
                toast('Consultor salvo.');
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Salvar
          </button>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome" className="sm:col-span-2">
            <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <input className={inputClass} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <input className={inputClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </Field>
          <Field label="PJ">
            <select className={inputClass} value={v.pjId} onChange={(e) => setV({ ...v, pjId: e.target.value })}>
              {pjs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Capacidade (leads abertos)">
            <input className={inputClass} type="number" min={1} value={v.maxOpenLeads} onChange={(e) => setV({ ...v, maxOpenLeads: e.target.value })} />
          </Field>
          <Field label="Prioridade (0–10)" hint="Usada pelo método 'Prioridade'">
            <input className={inputClass} type="number" min={0} max={10} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <div className="text-[12.5px] font-medium text-ink-2 mb-1">Especialidades (vazio = todos os produtos)</div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(PRODUCTS).map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={v.products.includes(k)} onChange={(e) => setV({ ...v, products: e.target.checked ? [...v.products, k] : v.products.filter((p) => p !== k) })} /> {l}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.available} onChange={(e) => setV({ ...v, available: e.target.checked })} /> Disponível
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Ativo
          </label>
        </div>
      </Modal>
    </>
  );
}
