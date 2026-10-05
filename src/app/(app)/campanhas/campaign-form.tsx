'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';
import { PRODUCTS } from '@/modules/leads/catalog';

type Opt = { id: string; name: string };
export type CampaignValues = { name: string; product: string; regionId: string; pjId: string; landingPageId: string; source: string; startAt: string; endAt: string; budget: string; utmCampaign: string };

const SOURCES = { GOOGLE_ADS: 'Google Ads', META: 'Meta Ads', INSTAGRAM: 'Instagram', WHATSAPP: 'WhatsApp', ORGANIC: 'Orgânico', EMAIL: 'E-mail', OFFLINE: 'Offline' };

export function CampaignFormButton({ id, initial, options, label = '+ Nova campanha', variant = 'primary' }: { id?: string; initial?: Partial<CampaignValues>; options: { regions: Opt[]; pjs: Opt[]; landings: Opt[] }; label?: string; variant?: 'primary' | 'secondary' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<CampaignValues>({ name: '', product: 'IMOVEL', regionId: '', pjId: '', landingPageId: '', source: 'GOOGLE_ADS', startAt: '', endAt: '', budget: '0', utmCampaign: '', ...initial });
  const set = (k: keyof CampaignValues, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <>
      <button className={buttonClass(variant)} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={id ? 'Editar campanha' : 'Nova campanha'}
        wide
        footer={
          <button
            className={buttonClass('primary')}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const body = { ...f, budget: Number(f.budget || 0), regionId: f.regionId || null, pjId: f.pjId || null, landingPageId: f.landingPageId || null, startAt: f.startAt || null, endAt: f.endAt || null, utmCampaign: f.utmCampaign || null, product: f.product || null };
                const c = await api<{ id: string }>(id ? `/campaigns/${id}` : '/campaigns', { method: id ? 'PATCH' : 'POST', body });
                toast(id ? 'Campanha atualizada.' : 'Campanha criada como rascunho.');
                setOpen(false);
                router.push(`/campanhas/${c.id}`);
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
          <Field label="Nome" className="sm:col-span-2">
            <input className={inputClass} value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Origem / canal">
            <select className={inputClass} value={f.source} onChange={(e) => set('source', e.target.value)}>
              {Object.entries(SOURCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Produto">
            <select className={inputClass} value={f.product} onChange={(e) => set('product', e.target.value)}>
              {Object.entries(PRODUCTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Região">
            <select className={inputClass} value={f.regionId} onChange={(e) => set('regionId', e.target.value)}>
              <option value="">Todas</option>
              {options.regions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="PJ">
            <select className={inputClass} value={f.pjId} onChange={(e) => set('pjId', e.target.value)}>
              <option value="">Todas</option>
              {options.pjs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Landing page">
            <select className={inputClass} value={f.landingPageId} onChange={(e) => set('landingPageId', e.target.value)}>
              <option value="">Nenhuma</option>
              {options.landings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orçamento (R$)">
            <input className={inputClass} inputMode="numeric" value={f.budget} onChange={(e) => set('budget', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Início">
            <input type="date" className={inputClass} value={f.startAt} onChange={(e) => set('startAt', e.target.value)} />
          </Field>
          <Field label="Fim">
            <input type="date" className={inputClass} value={f.endAt} onChange={(e) => set('endAt', e.target.value)} />
          </Field>
          <Field label="utm_campaign" hint="Leads que chegarem com este utm_campaign são atribuídos automaticamente à campanha." className="sm:col-span-2">
            <input className={inputClass} value={f.utmCampaign} onChange={(e) => set('utmCampaign', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))} placeholder="search-imovel-jundiai" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
