'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

export function SearchCompanies() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ provider: 'google_maps', category: 'Construtoras', city: 'Jundiaí', uf: 'SP', neighborhood: '', radiusKm: '5', cnae: '', size: '', situation: 'ATIVA', limit: '20' });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const res = await api<{ total: number; added: number; mode: string }>('/prospecting', {
            body: { ...f, neighborhood: f.neighborhood || undefined, cnae: f.cnae || undefined, size: f.size || undefined, situation: f.situation || undefined, radiusKm: Number(f.radiusKm), limit: Number(f.limit) },
          });
          toast(`${res.total} empresas encontradas (${res.added} novas)${res.mode === 'mock' ? ' · dados fictícios do provider mock' : ''}.`);
          router.refresh();
        } catch (err) {
          toast((err as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Fonte">
        <select className={inputClass} value={f.provider} onChange={(e) => set('provider', e.target.value)}>
          <option value="google_maps">Google Maps (API oficial)</option>
          <option value="bing_maps">Bing Maps (API oficial)</option>
          <option value="company_registry">Cadastro empresarial</option>
        </select>
      </Field>
      <Field label="Categoria">
        <input className={inputClass} value={f.category} onChange={(e) => set('category', e.target.value)} />
      </Field>
      <Field label="Cidade">
        <input className={inputClass} value={f.city} onChange={(e) => set('city', e.target.value)} />
      </Field>
      <Field label="UF">
        <input className={inputClass} maxLength={2} value={f.uf} onChange={(e) => set('uf', e.target.value.toUpperCase())} />
      </Field>
      <Field label="Bairro">
        <input className={inputClass} value={f.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />
      </Field>
      <Field label="Raio (km)">
        <input className={inputClass} type="number" min={1} max={50} value={f.radiusKm} onChange={(e) => set('radiusKm', e.target.value)} />
      </Field>
      <Field label="CNAE">
        <input className={inputClass} value={f.cnae} onChange={(e) => set('cnae', e.target.value)} placeholder="4120-4/00" />
      </Field>
      <Field label="Porte">
        <select className={inputClass} value={f.size} onChange={(e) => set('size', e.target.value)}>
          <option value="">Todos</option>
          <option>MEI</option>
          <option>ME</option>
          <option>EPP</option>
          <option>Demais</option>
        </select>
      </Field>
      <Field label="Situação">
        <select className={inputClass} value={f.situation} onChange={(e) => set('situation', e.target.value)}>
          <option value="">Todas</option>
          <option>ATIVA</option>
          <option>INAPTA</option>
          <option>BAIXADA</option>
        </select>
      </Field>
      <Field label="Limite">
        <input className={inputClass} type="number" min={1} max={50} value={f.limit} onChange={(e) => set('limit', e.target.value)} />
      </Field>
      <button className={buttonClass('primary') + ' h-9'} disabled={busy}>
        {busy ? 'Buscando…' : 'Buscar empresas'}
      </button>
    </form>
  );
}
