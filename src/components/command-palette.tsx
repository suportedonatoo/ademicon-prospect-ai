'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { Icon } from './icons';
import { cx } from './ui';

// COMMAND PALETTE (Ctrl+K / ⌘K): busca global real (API /search, com RBAC) + ações rápidas.
// As ações vêm do servidor já filtradas pelas permissões do usuário.

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: string;
}

type Hit = { type: string; id: string; title: string; subtitle: string; href: string };
type Group = { type: string; label: string; items: Hit[] };

const TYPE_ICON: Record<string, string> = { lead: 'users', company: 'building', opportunity: 'target', conversation: 'chat', campaign: 'megaphone', consultant: 'user', pj: 'building' };

export function CommandPalette({ actions }: { actions: PaletteAction[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);
  const initial = useRef('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = (e: Event) => {
      initial.current = (e as CustomEvent<string>).detail ?? '';
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('app:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('app:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ(initial.current);
      initial.current = '';
      setGroups([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Busca com debounce (250 ms) e descarte de respostas antigas.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setGroups([]);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      api<{ groups: Group[] }>(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => id === reqId.current && setGroups(r.groups))
        .catch(() => id === reqId.current && setGroups([]))
        .finally(() => id === reqId.current && setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const filteredActions = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? actions.filter((a) => a.label.toLowerCase().includes(term) || a.hint?.toLowerCase().includes(term)) : actions;
  }, [q, actions]);

  const flat = useMemo(() => [...groups.flatMap((g) => g.items.map((i) => ({ href: i.href }))), ...filteredActions.map((a) => ({ href: a.href }))], [groups, filteredActions]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  if (!open) return null;
  let idx = -1;
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[3px] flex items-start justify-center p-3 sm:pt-[12vh]" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Busca e ações rápidas" className="w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 border-b border-line">
          <Icon name="search" className="size-4 text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, flat.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === 'Enter' && flat[active]) go(flat[active].href);
            }}
            placeholder="Buscar lead, telefone, empresa, oportunidade, campanha… ou digite uma ação"
            className="flex-1 h-14 text-base outline-none bg-transparent"
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
          />
          {loading && <span className="text-xs text-faint">buscando…</span>}
          <kbd className="hidden sm:inline text-[11px] text-faint border border-line rounded px-1.5">Esc</kbd>
        </div>
        <div id="palette-results" role="listbox" className="max-h-[60vh] overflow-y-auto scroll-thin py-2">
          {q.trim().length >= 2 && !loading && !groups.length && <p className="px-4 py-3 text-sm text-muted">Nenhum resultado para “{q.trim()}”.</p>}
          {groups.map((g) => (
            <div key={g.label} className="pb-1">
              <div className="px-4 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{g.label}</div>
              {g.items.map((i) => {
                idx++;
                const me = idx;
                return (
                  <button key={`${g.label}-${i.id}`} role="option" aria-selected={active === me} onMouseEnter={() => setActive(me)} onClick={() => go(i.href)} className={cx('w-[calc(100%-16px)] mx-2 flex items-center gap-3 px-2.5 py-2 text-left rounded-xl', active === me ? 'bg-slate-100' : 'hover:bg-slate-50')}>
                    <span className="size-8 rounded-lg bg-slate-100 grid place-items-center shrink-0"><Icon name={TYPE_ICON[i.type] ?? 'search'} className="size-4 text-ink-2" /></span>
                    <span className="min-w-0">
                      <b className="block text-sm font-medium text-ink truncate">{i.title}</b>
                      <small className="block text-xs text-muted truncate">{i.subtitle}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {filteredActions.length > 0 && <div className="px-4 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">Ações</div>}
          {filteredActions.map((a) => {
            idx++;
            const me = idx;
            return (
              <button key={a.id} role="option" aria-selected={active === me} onMouseEnter={() => setActive(me)} onClick={() => go(a.href)} className={cx('w-[calc(100%-16px)] mx-2 flex items-center gap-3 px-2.5 py-2 text-left rounded-xl', active === me ? 'bg-slate-100' : 'hover:bg-slate-50')}>
                <span className="size-8 rounded-lg bg-slate-100 grid place-items-center shrink-0"><Icon name={a.icon} className="size-4 text-ink-2" /></span>
                <span className="text-sm text-ink">{a.label}</span>
                {a.hint && <span className="ml-auto text-xs text-faint">{a.hint}</span>}
              </button>
            );
          })}
        </div>
        <div className="border-t border-line px-4 py-2 text-[11px] text-faint flex gap-3">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Ctrl+K alternar</span>
        </div>
      </div>
    </div>
  );
}
