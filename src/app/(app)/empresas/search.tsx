'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

export function SearchCompanies({ left }: { left: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ provider: 'google_maps', category: 'Construtoras', city: 'Jundiaí', uf: 'SP', neighborhood: '', radiusKm: '5', cnae: '', size: '', situation: 'ATIVA', limit: '20', minRating: '', minReviews: '', onlyMobile: true, onlyWebsite: false });
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const google = f.provider === 'google_maps';
  if (left === 0) return <p className="text-sm font-medium text-bad">Período de teste atingido: você já usou as 2 buscas disponíveis.</p>;
  return (
    <form
      className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const res = await api<{ total: number; added: number; filteredOut: number; mode: string }>('/prospecting', {
            body: {
              ...f,
              neighborhood: f.neighborhood || undefined,
              cnae: f.cnae || undefined,
              size: f.size || undefined,
              situation: f.situation || undefined,
              radiusKm: Number(f.radiusKm),
              limit: 20,
              // nota e avaliações só existem no Google
              minRating: google && f.minRating ? Number(f.minRating) : undefined,
              minReviews: google && f.minReviews ? Number(f.minReviews) : undefined,
            },
          });
          toast(`${res.total} empresas encontradas (${res.added} novas)${res.filteredOut ? ` · ${res.filteredOut} fora dos filtros de qualidade` : ''}${res.mode === 'mock' ? ' · dados fictícios do provider mock' : ''}.`);
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
        <input className={inputClass} type="number" value={20} readOnly aria-readonly title="Limite fixo de 20 empresas por busca" />
      </Field>
      <fieldset className="sm:col-span-3 lg:col-span-6 rounded-2xl border border-line px-4 py-3 flex flex-wrap items-end gap-x-5 gap-y-3">
        <legend className="px-1 text-xs font-semibold text-ink-2">Qualidade do contato</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.onlyMobile} onChange={(e) => set('onlyMobile', e.target.checked)} /> Só celular (dá para chamar no WhatsApp)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.onlyWebsite} onChange={(e) => set('onlyWebsite', e.target.checked)} /> Só com site
        </label>
        {google && (
          <>
            <Field label="Avaliações no Google (mín.)">
              <select className={inputClass} value={f.minReviews} onChange={(e) => set('minReviews', e.target.value)}>
                <option value="">Qualquer</option>
                <option value="5">5+</option>
                <option value="20">20+ (empresa estabelecida)</option>
                <option value="50">50+</option>
              </select>
            </Field>
            <Field label="Nota mínima">
              <select className={inputClass} value={f.minRating} onChange={(e) => set('minRating', e.target.value)}>
                <option value="">Qualquer</option>
                <option value="3.5">3,5+</option>
                <option value="4">4,0+</option>
                <option value="4.5">4,5+</option>
              </select>
            </Field>
          </>
        )}
        <p className="text-xs text-muted basis-full">O que não passar nos filtros não entra na lista. Filtros mais rígidos trazem menos empresas, porém mais fáceis de converter.</p>
      </fieldset>
      <button className={buttonClass('primary') + ' h-9'} disabled={busy}>
        {busy ? 'Buscando…' : 'Buscar empresas'}
      </button>
      {left !== null && <p className="text-xs text-muted sm:col-span-3 lg:col-span-6">Período de teste: {left} de 2 buscas restantes.</p>}
    </form>
  );
}
