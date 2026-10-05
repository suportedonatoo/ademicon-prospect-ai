'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass, cx } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

type Item = { id: string; title: string; description: string | null; url: string; embed: string | null; category: string; order: number; active: boolean; completed: boolean };
type V = { title: string; description: string; url: string; category: string; order: string; active: boolean };

export function TrainingForm({ item, label }: { item?: Item; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<V>(
    item
      ? { title: item.title, description: item.description ?? '', url: item.url, category: item.category, order: String(item.order), active: item.active }
      : { title: '', description: '', url: '', category: 'Geral', order: '0', active: true }
  );
  const save = async () => {
    try {
      await api(item ? `/training/${item.id}` : '/training', { method: item ? 'PATCH' : 'POST', body: { ...v, order: Number(v.order || 0), description: v.description || null } });
      toast('Conteúdo salvo.');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <>
      <button className={item ? buttonClass('ghost', 'sm') : buttonClass('primary')} onClick={() => setOpen(true)}>
        {label ?? (item ? 'Editar' : '+ Adicionar conteúdo')}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={item ? 'Editar conteúdo' : 'Adicionar conteúdo'}
        footer={
          <button className={buttonClass('primary')} onClick={save}>
            Salvar
          </button>
        }
      >
        <div className="grid gap-3">
          <Field label="Título">
            <input className={inputClass} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
          <Field label="Link" hint="Vídeo do YouTube/Vimeo (aparece aqui dentro) ou link de apostila/PDF.">
            <input className={inputClass} placeholder="https://www.youtube.com/watch?v=…" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />
          </Field>
          <Field label="Descrição">
            <textarea className={inputClass} rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Field label="Módulo / categoria">
              <input className={inputClass} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />
            </Field>
            <Field label="Ordem">
              <input className={inputClass} inputMode="numeric" value={v.order} onChange={(e) => setV({ ...v, order: e.target.value.replace(/\D/g, '') })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Publicado para a equipe
          </label>
        </div>
      </Modal>
    </>
  );
}

export function TrainingCard({ item, superAdmin }: { item: Item; superAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await api(`/training/${item.id}`, { body: { completed: !item.completed } });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(`Remover "${item.title}"?`)) return;
    try {
      await api(`/training/${item.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div className={cx('rounded-xl border bg-surface overflow-hidden flex flex-col', item.completed ? 'border-emerald-300' : 'border-line', !item.active && 'opacity-60')}>
      {item.embed ? (
        <div className="aspect-video bg-black">
          <iframe src={item.embed} title={item.title} className="w-full h-full" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" loading="lazy" />
        </div>
      ) : null}
      <div className="p-4 flex-1 flex flex-col">
        <b>{item.title}</b>
        {item.description && <p className="text-sm text-muted mt-1 flex-1">{item.description}</p>}
        {!item.embed && (
          <a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline mt-2">
            Abrir material ↗
          </a>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button className={buttonClass(item.completed ? 'secondary' : 'primary', 'sm')} disabled={busy} onClick={toggle}>
            {item.completed ? '✓ Concluído' : 'Marcar como concluído'}
          </button>
          {!item.active && <span className="text-xs text-muted">não publicado</span>}
          {superAdmin && (
            <>
              <TrainingForm item={item} />
              <button className={buttonClass('ghost', 'sm')} onClick={remove}>
                Remover
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
