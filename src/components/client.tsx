'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, toast, TEMP_CREDENTIALS_KEY, TEMP_CREDENTIALS_TTL_MS, type TempCredential, type ToastKind } from '@/lib/client';
import { buttonClass, cx } from './ui';

// Componentes interativos genéricos.

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, ...d }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
    };
    window.addEventListener('app:toast', on);
    return () => window.removeEventListener('app:toast', on);
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 w-[min(380px,calc(100vw-32px))]" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx('animate-in rounded-xl px-4 py-3 text-sm shadow-lg border', t.kind === 'error' ? 'bg-bad-50 border-[#f0c9c5] text-bad' : t.kind === 'info' ? 'bg-white border-line text-ink' : 'bg-ink border-ink text-white')}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Painel fixo com as senhas provisórias criadas nos últimos 5 minutos (ver showTempPassword). */
export function TempPasswords() {
  const [items, setItems] = useState<TempCredential[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const load = () => {
      try {
        const live = (JSON.parse(sessionStorage.getItem(TEMP_CREDENTIALS_KEY) ?? '[]') as TempCredential[]).filter((c) => Date.now() - c.at < TEMP_CREDENTIALS_TTL_MS);
        sessionStorage.setItem(TEMP_CREDENTIALS_KEY, JSON.stringify(live));
        setItems(live);
      } catch {
        setItems([]);
      }
      setNow(Date.now());
    };
    load();
    window.addEventListener('app:temp-credentials', load);
    const t = setInterval(load, 1000);
    return () => {
      window.removeEventListener('app:temp-credentials', load);
      clearInterval(t);
    };
  }, []);
  const drop = (email: string) => {
    sessionStorage.setItem(TEMP_CREDENTIALS_KEY, JSON.stringify(items.filter((c) => c.email !== email)));
    window.dispatchEvent(new Event('app:temp-credentials'));
  };
  if (!items.length) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[90] w-[min(380px,calc(100vw-32px))] space-y-2" role="region" aria-label="Senhas provisórias">
      {items.map((c) => {
        const left = Math.max(0, Math.ceil((TEMP_CREDENTIALS_TTL_MS - (now - c.at)) / 1000));
        return (
          <div key={c.email} className="rounded-2xl border border-line bg-white p-4 shadow-xl text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <b className="block truncate">{c.name}</b>
                <span className="block text-xs text-muted truncate">{c.email}</span>
              </div>
              <button onClick={() => drop(c.email)} className="size-7 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 text-xs" aria-label="Fechar">
                ✕
              </button>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-[13px]">{c.password}</code>
              <button
                className={buttonClass('secondary', 'sm')}
                onClick={async () => {
                  await navigator.clipboard.writeText(`Login: ${c.email}\nSenha provisória: ${c.password}`);
                  toast('Login e senha copiados.');
                }}
              >
                Copiar
              </button>
            </div>
            <p className="mt-2 text-xs text-muted tabular">
              Senha provisória · some em {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. Depois disso não aparece de novo.
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide }: { open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[3px] grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('animate-in bg-white rounded-3xl shadow-2xl w-full max-h-[calc(100vh-32px)] flex flex-col', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="size-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 text-ink text-sm" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className={cx('p-6 overflow-y-auto scroll-thin', !wide && 'modal-body')}>{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line bg-slate-50 rounded-b-3xl flex justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  );
}

/** Botão que chama a API e atualiza a página (router.refresh). */
export function ActionButton({
  path,
  method = 'POST',
  body,
  children,
  variant = 'secondary',
  size = 'md',
  confirm,
  success,
  redirectTo,
  className,
}: {
  path: string;
  method?: string;
  body?: unknown;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  confirm?: string;
  success?: string;
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={cx(buttonClass(variant, size), className)}
      disabled={busy || pending}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setBusy(true);
        try {
          await api(path, { method, body: body ?? {} });
          if (success) toast(success);
          start(() => (redirectTo ? router.push(redirectTo) : router.refresh()));
        } catch (e) {
          toast((e as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? '…' : children}
    </button>
  );
}

/** Barra de filtros que sincroniza com a URL (filtros server-side). */
export function FilterBar({ fields, className }: { fields: { name: string; label: string; options?: { value: string; label: string }[]; type?: 'search' | 'date' }[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const active = fields.some((f) => params.get(f.name));
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      {fields.map((f) =>
        f.options ? (
          <select key={f.name} aria-label={f.label} value={params.get(f.name) ?? ''} onChange={(e) => set(f.name, e.target.value)} className="h-10 rounded-xl border border-line bg-white px-3.5 text-sm text-ink max-w-52">
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={f.name}
            type={f.type === 'date' ? 'date' : 'search'}
            aria-label={f.label}
            placeholder={f.label}
            defaultValue={params.get(f.name) ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => set(f.name, v), f.type === 'date' ? 0 : 350);
            }}
            className="h-10 rounded-xl border border-line bg-white px-3.5 text-sm min-w-0 w-72 max-w-full placeholder:text-faint"
          />
        )
      )}
      {active && (
        <button className="text-sm text-brand-600 hover:underline px-1" onClick={() => router.replace(pathname)}>
          Limpar filtros
        </button>
      )}
    </div>
  );
}

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const go = (p: number) => {
    const next = new URLSearchParams(params.toString());
    next.set('page', String(p));
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
      <span className="tabular">
        {total ? `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} de ${total.toLocaleString('pt-BR')}` : '0 resultados'}
      </span>
      <div className="flex gap-2">
        <button className={buttonClass('secondary', 'sm')} disabled={page <= 1} onClick={() => go(page - 1)}>
          Anterior
        </button>
        <button className={buttonClass('secondary', 'sm')} disabled={page >= pages} onClick={() => go(page + 1)}>
          Próxima
        </button>
      </div>
    </div>
  );
}

/** Escolha única em pílulas (no lugar de um select curto). */
export function Chips({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(value === o.value ? '' : o.value)} className={cx('rounded-full border px-3.5 py-1.5 text-sm', value === o.value ? 'bg-ink border-ink text-white font-medium' : 'border-line bg-white text-ink-2 hover:bg-slate-50')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const inputClass = 'w-full h-11 rounded-xl border border-line bg-white px-3.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100';
export const labelClass = 'block text-[13px] font-medium text-ink mb-1.5';

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

/** Agrupador para controles que já têm seus próprios <label> (checkboxes). */
export function FieldGroup({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cx('block', className)} role="group" aria-label={label}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-muted mt-1">{hint}</span>}
    </div>
  );
}
