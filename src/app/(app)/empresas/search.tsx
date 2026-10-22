'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

export function SearchCompanies({ left }: { left: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ provider: 'google_maps', category: 'Construtoras', city: 'Jundiaí', uf: 'SP', neighborhood: '', radiusKm: '5' });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  if (left === 0) return <p className="text-sm font-medium text-bad">Período de teste atingido: você já usou as 2 buscas disponíveis.</p>;
  return (
    <form
      className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const res = await api<{ search: { id: string }; total: number; added: number; mode: string }>('/prospecting', {
            body: { ...f, neighborhood: f.neighborhood || undefined, radiusKm: f.radiusKm ? Number(f.radiusKm) : undefined, limit: 20 },
          });
          toast(`${res.total} empresas encontradas (${res.added} novas)${res.mode === 'mock' ? ' · dados fictícios do provider mock' : ''}.`);
          // A lista passa a mostrar só o resultado DESTA busca.
          router.push(`/empresas?busca=${res.search.id}`, { scroll: false });
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
        <input className={inputClass} type="number" min={1} max={50} value={f.radiusKm} placeholder="cidade toda" onChange={(e) => set('radiusKm', e.target.value)} />
      </Field>
      <Field label="Limite">
        <input className={inputClass} type="number" value={20} readOnly aria-readonly title="Limite fixo de 20 empresas por busca" />
      </Field>
      <button className={buttonClass('primary') + ' h-9'} disabled={busy}>
        {busy ? 'Buscando…' : 'Buscar empresas'}
      </button>
      <p className="text-xs text-muted sm:col-span-3 lg:col-span-6">
        O Google busca por categoria e área: com raio, só entram empresas dentro do círculo; sem raio, só as da cidade. Filtros por CNAE, porte e situação chegam com a base de CNPJ da Receita.
        {left !== null && ` Período de teste: ${left} de 2 buscas restantes.`}
      </p>
    </form>
  );
}
