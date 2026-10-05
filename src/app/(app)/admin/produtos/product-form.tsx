'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

type V = { key: string; name: string; description: string; categoryKey: string; status: 'ACTIVE' | 'INACTIVE'; sortOrder: number };

export function ProductForm({ id, initial }: { id?: string; initial?: V }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState<V>(initial ?? { key: '', name: '', description: '', categoryKey: 'CONSORCIO', status: 'ACTIVE', sortOrder: 10 });

  async function save() {
    setBusy(true);
    try {
      await api(id ? `/products/${id}` : '/products', { method: id ? 'PATCH' : 'POST', body: { ...v, description: v.description || null, categoryKey: v.categoryKey || undefined } });
      toast(id ? 'Produto atualizado.' : 'Produto criado.');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={id ? buttonClass('ghost', 'sm') : buttonClass('primary')} onClick={() => setOpen(true)}>
        {id ? 'Editar' : '+ Novo produto'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={id ? 'Editar produto' : 'Novo produto'}
        footer={
          <button className={buttonClass('primary')} disabled={busy} onClick={save}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Código" hint={id ? 'Fixo: já usado em leads e oportunidades' : 'Ex.: PESADOS (maiúsculas, números e _)'}>
            <input className={inputClass} disabled={!!id} value={v.key} onChange={(e) => setV({ ...v, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
          </Field>
          <Field label="Nome">
            <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            <input className={inputClass} maxLength={500} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <Field label="Categoria (código)">
            <input className={inputClass} value={v.categoryKey} onChange={(e) => setV({ ...v, categoryKey: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Ordem de exibição">
            <input className={inputClass} type="number" min={0} max={999} value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={v.status === 'ACTIVE'} onChange={(e) => setV({ ...v, status: e.target.checked ? 'ACTIVE' : 'INACTIVE' })} /> Ativo (aceito em leads, filtros e roteamento)
          </label>
        </div>
      </Modal>
    </>
  );
}
