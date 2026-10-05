'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';
import { PRODUCTS } from '@/modules/leads/catalog';

type Product = { key: string; label: string; termOptions: number[]; minValue: number; maxValue: number; adminFeePct?: number | null; reserveFundPct?: number | null };
type Values = { name: string; slug: string; products: Product[]; requiredFields: string[]; parametersVerified: boolean; disclaimer: string; active: boolean };

const EMPTY: Values = {
  name: '',
  slug: '',
  products: [{ key: 'IMOVEL', label: 'Imóvel', termOptions: [120, 180, 200], minValue: 80000, maxValue: 2000000, adminFeePct: null, reserveFundPct: null }],
  requiredFields: ['product', 'value', 'name', 'whatsapp'],
  parametersVerified: false,
  disclaimer: 'Simulação ilustrativa, sem valor de proposta. As condições oficiais são apresentadas pelo consultor.',
  active: true,
};

export function SimulatorEditor({ id, initial, fieldLabels }: { id?: string; initial?: Values; fieldLabels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState<Values>(initial ?? EMPTY);
  const upd = (i: number, patch: Partial<Product>) => setV((x) => ({ ...x, products: x.products.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  return (
    <>
      <button className={id ? 'text-xs text-brand-600 hover:underline' : buttonClass('primary')} onClick={() => setOpen(true)}>
        {id ? 'Configurar' : '+ Novo simulador'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={id ? 'Configurar simulador' : 'Novo simulador'}
        wide
        footer={
          <button
            className={buttonClass('primary')}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(id ? `/simulators/${id}` : '/simulators', { method: id ? 'PATCH' : 'POST', body: v });
                toast('Simulador salvo.');
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar
          </button>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome">
            <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Slug">
            <input className={inputClass} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
          </Field>
        </div>
        <div className="mt-4">
          <div className="text-[12.5px] font-medium text-ink-2 mb-2">Campos obrigatórios</div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(fieldLabels).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  disabled={['name', 'whatsapp', 'product', 'value'].includes(k)}
                  checked={v.requiredFields.includes(k) || ['name', 'whatsapp', 'product', 'value'].includes(k)}
                  onChange={(e) => setV({ ...v, requiredFields: e.target.checked ? [...v.requiredFields, k] : v.requiredFields.filter((f) => f !== k) })}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted mt-1">Nome, WhatsApp, produto e valor são sempre obrigatórios (necessários para gerar o lead).</p>
        </div>
        <div className="mt-4 space-y-3">
          <div className="text-[12.5px] font-medium text-ink-2">Produtos</div>
          {v.products.map((p, i) => (
            <div key={i} className="rounded-xl border border-line p-3 grid sm:grid-cols-3 gap-2">
              <Field label="Produto">
                <select className={inputClass} value={p.key} onChange={(e) => upd(i, { key: e.target.value, label: PRODUCTS[e.target.value as keyof typeof PRODUCTS] })}>
                  {Object.entries(PRODUCTS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prazos (meses)">
                <input className={inputClass} value={p.termOptions.join(', ')} onChange={(e) => upd(i, { termOptions: e.target.value.split(',').map((x) => Number(x.trim())).filter(Boolean) })} />
              </Field>
              <Field label="Valor mín. / máx.">
                <div className="flex gap-1">
                  <input className={inputClass} value={p.minValue} onChange={(e) => upd(i, { minValue: Number(e.target.value.replace(/\D/g, '')) })} />
                  <input className={inputClass} value={p.maxValue} onChange={(e) => upd(i, { maxValue: Number(e.target.value.replace(/\D/g, '')) })} />
                </div>
              </Field>
              <Field label="Taxa de adm. total (%)" hint="Somente valor oficial">
                <input className={inputClass} value={p.adminFeePct ?? ''} onChange={(e) => upd(i, { adminFeePct: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} />
              </Field>
              <Field label="Fundo de reserva (%)" hint="Somente valor oficial">
                <input className={inputClass} value={p.reserveFundPct ?? ''} onChange={(e) => upd(i, { reserveFundPct: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} />
              </Field>
              <div className="flex items-end">
                <button className={buttonClass('ghost', 'sm')} onClick={() => setV({ ...v, products: v.products.filter((_, j) => j !== i) })} disabled={v.products.length === 1}>
                  Remover produto
                </button>
              </div>
            </div>
          ))}
          <button className={buttonClass('secondary', 'sm')} onClick={() => setV({ ...v, products: [...v.products, { ...EMPTY.products[0], key: 'VEICULO', label: 'Veículo', termOptions: [50, 70, 80], minValue: 30000, maxValue: 400000 }] })}>
            + Produto
          </button>
        </div>
        <label className="flex items-start gap-2 text-sm mt-4 rounded-lg bg-warn-50 border border-amber-200 p-3">
          <input type="checkbox" className="mt-1" checked={v.parametersVerified} onChange={(e) => setV({ ...v, parametersVerified: e.target.checked })} />
          Confirmo que taxa de administração e fundo de reserva informados são <b>oficiais e vigentes</b>. Sem esta confirmação, o simulador exibe apenas crédito ÷ prazo.
        </label>
        <Field label="Aviso legal (exibido junto ao resultado)" className="mt-3">
          <textarea className={inputClass + ' h-20 py-2'} value={v.disclaimer} onChange={(e) => setV({ ...v, disclaimer: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm mt-3">
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Ativo
        </label>
      </Modal>
    </>
  );
}
