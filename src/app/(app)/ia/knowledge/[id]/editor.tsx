'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Badge, Card, buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';
import { PRODUCTS } from '@/modules/leads/catalog';
import { KB_ACTIONS, KB_STATUS } from '@/modules/knowledge-base/status';

type V = { title: string; categoryKey: string; source: string; ownerName: string; product: string; validFrom: string; validUntil: string; priority: string; content: string; changeNote: string };

export function DocEditor({ id, status, initial, canManage, categories }: { id: string | null; status: string; initial: V; canManage: boolean; categories: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof V, val: string) => setV((x) => ({ ...x, [k]: val }));
  const body = { ...v, product: v.product || null, validFrom: v.validFrom || null, validUntil: v.validUntil || null, priority: Number(v.priority || 0), changeNote: v.changeNote || undefined };

  const setStatus = async (s: string) => {
    try {
      await api(`/knowledge/${id}/status`, { body: { status: s } });
      toast(s === 'PUBLISHED' ? 'Documento publicado e indexado (RAG).' : ['ARCHIVED', 'DRAFT'].includes(s) ? 'Status atualizado — documento fora do RAG.' : 'Status atualizado.');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Card title="Conteúdo" actions={<Badge tone={KB_STATUS[status]?.tone ?? 'gray'}>{KB_STATUS[status]?.label ?? status}</Badge>}>
      <fieldset disabled={!canManage} className="space-y-3">
        <Field label="Título">
          <input className={inputClass} value={v.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Categoria">
            <select className={inputClass} value={v.categoryKey} onChange={(e) => set('categoryKey', e.target.value)}>
              {Object.entries(categories).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Produto">
            <select className={inputClass} value={v.product} onChange={(e) => set('product', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(PRODUCTS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade (0–10)">
            <input className={inputClass} type="number" min={0} max={10} value={v.priority} onChange={(e) => set('priority', e.target.value)} />
          </Field>
          <Field label="Fonte" className="sm:col-span-2">
            <input className={inputClass} value={v.source} onChange={(e) => set('source', e.target.value)} placeholder="Ex.: Manual comercial oficial, v2026-09" />
          </Field>
          <Field label="Responsável">
            <input className={inputClass} value={v.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
          </Field>
          <Field label="Vigente a partir de">
            <input type="date" className={inputClass} value={v.validFrom} onChange={(e) => set('validFrom', e.target.value)} />
          </Field>
          <Field label="Validade (expira em)">
            <input type="date" className={inputClass} value={v.validUntil} onChange={(e) => set('validUntil', e.target.value)} />
          </Field>
        </div>
        <Field label="Conteúdo" hint="Parágrafos separados por linha em branco viram trechos (chunks). Escreva como deve ser explicado ao cliente.">
          <textarea className={inputClass + ' h-72 py-2 text-[13.5px] leading-relaxed'} value={v.content} onChange={(e) => set('content', e.target.value)} />
        </Field>
        {id && (
          <Field label="Nota da alteração (nova versão)">
            <input className={inputClass} value={v.changeNote} onChange={(e) => set('changeNote', e.target.value)} />
          </Field>
        )}
      </fieldset>
      {canManage && (
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            className={buttonClass('primary')}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const d = await api<{ id: string }>(id ? `/knowledge/${id}` : '/knowledge', { method: id ? 'PATCH' : 'POST', body });
                toast(id ? 'Nova versão salva.' : 'Documento criado como rascunho.');
                if (!id) router.push(`/ia/knowledge/${d.id}`);
                else router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar
          </button>
          {id &&
            (KB_ACTIONS[status] ?? []).map((a) => (
              <button key={a.to} className={buttonClass('secondary')} onClick={() => setStatus(a.to)}>
                {a.label}
              </button>
            ))}
        </div>
      )}
    </Card>
  );
}
