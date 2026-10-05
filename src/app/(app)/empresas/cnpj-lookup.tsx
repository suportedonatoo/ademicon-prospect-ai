'use client';

import { useState } from 'react';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { inputClass } from '@/components/client';

type Company = { legalName: string; tradeName?: string; cnae?: string; size?: string; situation?: string; city?: string; uf?: string; phone?: string; email?: string };

/** Consulta de CNPJ no Cadastro Nacional de Empresas (Receita Federal, via BrasilAPI). */
export function CnpjLookup() {
  const [cnpj, setCnpj] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ company: Company | null; mode: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setRes(null);
    try {
      setRes(await api(`/prospecting/cnpj?cnpj=${encodeURIComponent(cnpj)}`));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2 max-w-md">
        <input className={inputClass} placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
        <button className={buttonClass('primary', 'sm')} disabled={busy || cnpj.replace(/\D/g, '').length !== 14} onClick={run}>
          {busy ? 'Consultando…' : 'Consultar'}
        </button>
      </div>
      {res && !res.company && <p className="text-sm text-muted">CNPJ não encontrado.</p>}
      {res?.company && (
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div>
            <dt className="text-xs text-muted">Razão social</dt>
            <dd className="font-medium">{res.company.legalName}</dd>
          </div>
          {res.company.tradeName && (
            <div>
              <dt className="text-xs text-muted">Nome fantasia</dt>
              <dd>{res.company.tradeName}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Situação</dt>
            <dd>{res.company.situation ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Porte</dt>
            <dd>{res.company.size ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Atividade (CNAE)</dt>
            <dd>{res.company.cnae ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Cidade</dt>
            <dd>{[res.company.city, res.company.uf].filter(Boolean).join('/') || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Telefone / e-mail</dt>
            <dd>{[res.company.phone, res.company.email].filter(Boolean).join(' · ') || '—'}</dd>
          </div>
          {res.mode === 'mock' && <p className="sm:col-span-2 text-xs text-warn">Modo simulado — dados fictícios.</p>}
        </dl>
      )}
    </div>
  );
}
