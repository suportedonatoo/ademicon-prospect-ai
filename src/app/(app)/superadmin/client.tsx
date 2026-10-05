'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass, cx } from '@/components/ui';
import { inputClass } from '@/components/client';

/** Alterna entre o menu enxuto do Super Admin e o menu completo do sistema. */
export function MenuToggle({ full }: { full: boolean }) {
  const router = useRouter();
  return (
    <button
      className={buttonClass('secondary', 'sm')}
      onClick={() => {
        document.cookie = `pa_nav=${full ? 'simple' : 'full'}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        router.refresh();
      }}
    >
      {full ? 'Menu enxuto' : 'Menu completo do sistema'}
    </button>
  );
}

type Field = { key: string; label: string; secret: boolean; hint?: string; options?: string[]; source: string | null; display: string | null; updatedAt: string | null; updatedBy: string | null };
type Group = { id: string; title: string; description: string; docs?: string; fields: Field[] };

const TEST_KEY: Record<string, string> = { whatsapp: 'whatsapp', ai: 'ai', google_ads: 'google_ads', meta: 'meta', maps: 'maps', instagram: 'instagram' };

export function CredentialsGroup({ group }: { group: Group }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; detail: string; mode?: string } | null>(null);

  const save = async (patch: Record<string, string | null>) => {
    setBusy(true);
    try {
      const r = await api<{ changed: number }>('/superadmin/credentials', { method: 'PUT', body: patch });
      toast(r.changed ? 'Chaves salvas (criptografadas). Já estão em uso.' : 'Nada para salvar.');
      setValues({});
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTest(null);
    try {
      setTest(await api('/superadmin/test', { body: { provider: TEST_KEY[group.id] } }));
    } catch (e) {
      setTest({ ok: false, detail: (e as Error).message });
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{group.title}</h2>
          <p className="text-sm text-muted">{group.description}</p>
        </div>
        {group.docs && (
          <a href={group.docs} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
            Documentação oficial ↗
          </a>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        {group.fields.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{f.label}</span>
              <span className={cx('text-[11px]', f.source ? 'text-ok' : 'text-faint')}>{f.source ? `✓ ${f.source === 'painel' ? 'salvo no painel' : 'no .env'}` : 'vazio'}</span>
            </span>
            {f.options ? (
              <select className={inputClass} value={values[f.key] ?? f.display ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                <option value="" disabled>
                  Escolha…
                </option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputClass}
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                placeholder={f.display ?? f.hint ?? ''}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
            <span className="flex justify-between gap-2 text-[11px] text-muted mt-0.5">
              <span>{f.hint && f.display ? f.hint : f.updatedBy ? `alterado por ${f.updatedBy}` : ''}</span>
              {f.source === 'painel' && (
                <button type="button" className="text-bad hover:underline" disabled={busy} onClick={() => confirm(`Remover "${f.label}" do painel?`) && save({ [f.key]: null })}>
                  remover
                </button>
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button className={buttonClass('primary', 'sm')} disabled={busy || !Object.values(values).some((v) => v.trim())} onClick={() => save(values)}>
          Salvar
        </button>
        <button className={buttonClass('secondary', 'sm')} onClick={runTest}>
          Testar conexão
        </button>
        {test && (
          <span className={cx('text-sm', test.ok ? 'text-ok' : 'text-bad')}>
            {test.ok ? '✓' : '✕'} {test.mode === 'mock' ? '[modo simulado] ' : ''}
            {test.detail}
          </span>
        )}
      </div>
    </div>
  );
}

type Remote = { connected: boolean; campaigns: { id: string; name: string; status: string; linked: boolean }[] };

export function AdsActions({ source, connected }: { source: 'GOOGLE_ADS' | 'META'; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<Remote | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass('secondary', 'sm')} disabled={busy || !connected} onClick={() => run(async () => setRemote(await api<Remote>(`/superadmin/ads?source=${source}`)))}>
          Ver campanhas da conta
        </button>
        <button
          className={buttonClass('secondary', 'sm')}
          disabled={busy || !connected}
          onClick={() =>
            run(async () => {
              const r = await api<{ imported: number }>('/superadmin/ads', { body: { action: 'import', source } });
              toast(`${r.imported} campanha(s) importada(s).`);
              router.refresh();
            })
          }
        >
          Importar campanhas
        </button>
        <button
          className={buttonClass('primary', 'sm')}
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await api<{ campaigns: number; results: { error?: string }[] }>('/superadmin/ads', { body: { action: 'sync', source } });
              const errors = r.results.filter((x) => x.error).length;
              toast(`Métricas sincronizadas: ${r.campaigns - errors}/${r.campaigns} campanha(s).${errors ? ` ${errors} com erro.` : ''}`, errors ? 'error' : undefined);
              router.refresh();
            })
          }
        >
          Sincronizar métricas
        </button>
      </div>
      {!connected && <p className="text-xs text-muted">Configure as chaves em Configurar APIs para ver e importar as campanhas reais.</p>}
      {remote && (
        <ul className="text-sm divide-y divide-line border border-line rounded-lg">
          {remote.campaigns.map((c) => (
            <li key={c.id} className="px-3 py-2 flex justify-between gap-2">
              <span>
                {c.name} <span className="text-xs text-muted">· {c.id}</span>
              </span>
              <span className={cx('text-xs', c.linked ? 'text-ok' : 'text-muted')}>{c.linked ? 'vinculada' : c.status}</span>
            </li>
          ))}
          {!remote.campaigns.length && <li className="px-3 py-2 text-muted">Nenhuma campanha na conta.</li>}
        </ul>
      )}
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <input className={inputClass + ' font-mono text-xs'} readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      <button
        className={buttonClass('secondary', 'sm')}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          toast('Copiado.');
        }}
      >
        Copiar
      </button>
    </div>
  );
}
