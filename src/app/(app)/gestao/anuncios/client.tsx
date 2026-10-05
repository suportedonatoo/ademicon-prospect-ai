'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

type Opt = { id: string; name: string };
type Ad = { id?: string; name: string; source: string; externalId: string; budget: string; consultantIds: string[] };

export function AdForm({ consultants, ad }: { consultants: Opt[]; ad?: Ad }) {
  const router = useRouter();
  const blank: Ad = { name: '', source: 'META', externalId: '', budget: '', consultantIds: [] };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Ad>(ad ?? blank);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setV({ ...v, consultantIds: v.consultantIds.includes(id) ? v.consultantIds.filter((x) => x !== id) : [...v.consultantIds, id] });
  const shown = consultants.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));

  const save = async () => {
    setBusy(true);
    try {
      await api(ad?.id ? `/gestao/anuncios/${ad.id}` : '/gestao/anuncios', {
        method: ad?.id ? 'PATCH' : 'POST',
        body: { name: v.name, source: v.source, externalId: v.externalId || null, budget: Number(v.budget || 0), consultantIds: v.consultantIds },
      });
      toast(ad?.id ? 'Anúncio atualizado.' : 'Anúncio criado. Copie o link e use no Google/Meta.');
      setOpen(false);
      if (!ad) setV(blank);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className={ad ? buttonClass('secondary', 'sm') : buttonClass('primary')} onClick={() => setOpen(true)}>
        {ad ? 'Editar / quem pagou' : '+ Novo anúncio'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={ad ? 'Editar anúncio' : 'Novo anúncio patrocinado'}
        footer={
          <button className={buttonClass('primary')} disabled={busy} onClick={save}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        }
      >
        <div className="grid gap-3">
          <Field label="Nome do anúncio">
            <input className={inputClass} placeholder="Ex.: Imóveis outubro — grupo 1" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Onde roda">
              <select className={inputClass} value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })}>
                <option value="META">Meta (Facebook)</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="GOOGLE_ADS">Google Ads</option>
                <option value="OUTRO">Outro</option>
              </select>
            </Field>
            <Field label="Verba (R$)" hint="Opcional">
              <input className={inputClass} inputMode="numeric" value={v.budget} onChange={(e) => setV({ ...v, budget: e.target.value.replace(/\D/g, '') })} />
            </Field>
          </div>
          <Field label="ID da campanha no Google/Meta" hint="Opcional: liga os leads de formulário e as métricas de custo a este anúncio.">
            <input className={inputClass} value={v.externalId} onChange={(e) => setV({ ...v, externalId: e.target.value.trim() })} />
          </Field>
          <Field label={`Quem pagou (${v.consultantIds.length})`} hint="1 consultor = individual · vários = grupo (divisão igual entre eles).">
            <div className="grid gap-2">
              <input className={inputClass} placeholder="Filtrar consultores…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="max-h-56 overflow-y-auto border border-line rounded-lg divide-y divide-line">
                {shown.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={v.consultantIds.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name}
                  </label>
                ))}
              </div>
            </div>
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function CopyLink({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <input className={inputClass + ' font-mono text-xs'} readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      <button
        className={buttonClass('secondary', 'sm')}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          toast('Link copiado.');
        }}
      >
        Copiar
      </button>
    </div>
  );
}
