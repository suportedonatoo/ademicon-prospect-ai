'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass, cx } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';
import { ScoreBadge } from '@/components/badges';
import { brl, brlShort } from '@/lib/format';
import { productLabel } from '@/modules/leads/catalog';

type Item = { id: string; code: number; leadId: string; leadName: string; score: number; temperature: string; value: number; product: string | null; consultant: string | null; pj: string | null; updatedAt: string };
type Column = { key: string; name: string; isWon: boolean; isLost: boolean; count: number; total: number; items: Item[] };

export function Board({ columns: initial, canMove }: { columns: Column[]; canMove: boolean }) {
  const router = useRouter();
  const [columns, setColumns] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [lost, setLost] = useState<{ id: string; from: string } | null>(null);
  const [reason, setReason] = useState('');

  // Dados novos do servidor (filtros ou router.refresh) substituem o estado otimista.
  useEffect(() => {
    setColumns(initial);
  }, [initial]);

  const move = async (id: string, from: string, to: string, lostReason?: string) => {
    if (from === to) return;
    const item = columns.find((c) => c.key === from)?.items.find((i) => i.id === id);
    if (!item) return;
    // Atualização otimista
    setColumns((cols) =>
      cols.map((c) =>
        c.key === from
          ? { ...c, count: c.count - 1, total: c.total - item.value, items: c.items.filter((i) => i.id !== id) }
          : c.key === to
            ? { ...c, count: c.count + 1, total: c.total + item.value, items: [item, ...c.items] }
            : c
      )
    );
    try {
      await api(`/opportunities/${id}`, { method: 'PATCH', body: { stageKey: to, lostReason } });
      toast(`#${item.code} → ${columns.find((c) => c.key === to)?.name}`);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
      setColumns(initial);
    }
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto scroll-thin pb-4 -mx-1 px-1 snap-x">
        {columns.map((col) => (
          <section
            key={col.key}
            className={cx('snap-start shrink-0 w-[272px] rounded-xl bg-slate-100/80 border flex flex-col max-h-[calc(100vh-230px)]', over === col.key ? 'border-brand-500 bg-brand-50' : 'border-transparent')}
            onDragOver={(e) => {
              if (!canMove) return;
              e.preventDefault();
              setOver(col.key);
            }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const [id, from] = e.dataTransfer.getData('text/plain').split('|');
              if (!id) return;
              if (col.isLost) {
                setLost({ id, from });
                setReason('');
              } else move(id, from, col.key);
            }}
          >
            <header className="px-3 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <span className={cx('size-2 rounded-full', col.isWon ? 'bg-ok' : col.isLost ? 'bg-bad' : 'bg-series-1')} />
                <b className="text-[13px] text-ink">{col.name}</b>
                <span className="ml-auto text-[11px] font-semibold bg-white rounded-full px-2 tabular">{col.count}</span>
              </div>
              <div className="text-[11.5px] text-muted mt-0.5 pl-4 tabular">{brlShort(col.total)}</div>
            </header>
            <div className="px-2 pb-2 space-y-2 overflow-y-auto scroll-thin flex-1">
              {col.items.map((i) => (
                <article
                  key={i.id}
                  draggable={canMove}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', `${i.id}|${col.key}`);
                    setDragging(i.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cx('bg-white rounded-lg border border-line p-3 shadow-sm hover:border-brand-200 transition', canMove && 'cursor-grab', dragging === i.id && 'opacity-40')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/oportunidades/${i.id}`} className="text-[13px] font-medium text-ink hover:text-brand-600 leading-tight">
                      {i.leadName}
                    </Link>
                    <ScoreBadge score={i.score} temperature={i.temperature} size="sm" />
                  </div>
                  <div className="text-[11.5px] text-muted mt-1">
                    #{i.code} · {productLabel(i.product)}
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[12px]">
                    <b className="tabular">{brl(i.value)}</b>
                    <span className="text-muted truncate max-w-32">{i.consultant ?? 'Sem consultor'}</span>
                  </div>
                </article>
              ))}
              {col.count > col.items.length && <div className="text-center text-[11px] text-muted py-1">+{col.count - col.items.length} (use os filtros)</div>}
              {col.items.length === 0 && <div className="text-center text-[11.5px] text-faint py-6">Arraste para cá</div>}
            </div>
          </section>
        ))}
      </div>
      <Modal
        open={!!lost}
        onClose={() => setLost(null)}
        title="Marcar como perdido"
        footer={
          <button
            className={buttonClass('danger')}
            disabled={!reason.trim()}
            onClick={() => {
              if (lost) move(lost.id, lost.from, 'PERDIDO', reason.trim());
              setLost(null);
            }}
          >
            Confirmar perda
          </button>
        }
      >
        <Field label="Motivo da perda (obrigatório)">
          <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Selecione…</option>
            {['Sem orçamento no momento', 'Optou por financiamento', 'Comprou com concorrente', 'Não respondeu após tentativas', 'Desistiu do projeto', 'Outro'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
      </Modal>
    </>
  );
}
