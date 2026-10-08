'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { Avatar, cx } from './ui';
import type { NavGroup } from './nav';
import { api } from '@/lib/client';
import { CommandPalette, type PaletteAction } from './command-palette';
import { RealtimeBridge } from './realtime';
import { Logo } from './logo';

// Layout da aplicação: sidebar (responsiva) + topbar com busca, notificações e usuário.

export function Shell({ nav, user, appName, actions, children }: { nav: NavGroup[]; user: ShellUser; appName: string; actions: PaletteAction[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:rounded-lg focus:shadow">
        Pular para o conteúdo
      </a>
      <RealtimeBridge />
      <CommandPalette actions={actions} />
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 w-[min(300px,82vw)] lg:w-[256px] bg-chrome border-r border-line text-ink-2 flex flex-col transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        )}
        aria-label="Menu principal"
      >
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-3 shrink-0">
          <Link href="/" className="min-w-0 flex-1" aria-label={appName}>
            <Logo className="h-[15px]" />
            <small className="hidden lg:block text-[11px] text-faint mt-1.5">Ademicon · Prospecção · IA</small>
          </Link>
          <button onClick={() => setOpen(false)} className="lg:hidden size-9 grid place-items-center text-ink text-lg" aria-label="Fechar menu">
            ✕
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto scroll-thin px-3.5 pb-3 space-y-5">
          {nav.map((g, gi) => (
            <div key={gi}>
              {g.label && <div className="px-2.5 pt-1 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{g.label}</div>}
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const base = item.href.split('?')[0];
                  // Item mais específico vence: em /gestao/divulgacao só "Divulgação" acende, não "Painel" (/gestao).
                  const under = (b: string) => pathname === b || (b !== '/dashboard' && pathname.startsWith(b + '/'));
                  const moreSpecific = nav.some((ng) => ng.items.some((o) => o.href.split('?')[0].length > base.length && under(o.href.split('?')[0])));
                  const active = under(base) && !moreSpecific;
                  return (
                    <li key={item.href} className="relative">
                      {active && <span className="absolute -left-3.5 top-2.5 bottom-2.5 w-1 rounded-r bg-brand-500" aria-hidden />}
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cx('flex items-center gap-3 rounded-xl px-3 h-10 text-[14.5px] transition-colors', active ? 'bg-ink text-white font-medium' : 'hover:bg-slate-100 hover:text-ink')}
                      >
                        <Icon name={item.icon} className={cx('size-[17px]', active ? 'text-lime' : 'opacity-70')} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3.5 shrink-0">
          <div className="rounded-2xl bg-slate-100 p-3">
            <div className="flex items-center gap-2 px-1 text-[14.5px] font-medium text-ink">
              <Icon name="spark" className="size-4 text-brand-500" /> Maestro <span className="size-1.5 rounded-full bg-brand-500" aria-label="ativo" />
            </div>
            <form
              className="relative mt-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('q') as HTMLInputElement;
                window.dispatchEvent(new CustomEvent('app:palette', { detail: input.value }));
                input.value = '';
              }}
            >
              <input name="q" aria-label="Pergunte sobre seus leads" placeholder="Busque ou peça: agenda com Maria amanhã 15h" className="w-full h-9 rounded-xl border border-line bg-white pl-3 pr-8 text-[13px] placeholder:text-faint focus:outline-none focus:border-brand-500" />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-500" aria-label="Perguntar">
                <Icon name="send" className="size-3.5" />
              </button>
            </form>
            <a href="/api-docs" target="_blank" className="flex items-center gap-1.5 text-xs text-muted hover:text-ink px-1 mt-3">
              <Icon name="file" className="size-3.5" /> Documentação da API
            </a>
          </div>
          <div className="lg:hidden flex items-center gap-3 rounded-2xl bg-slate-100 p-3 mt-2.5">
            <Avatar name={user.name} tone="dark" size={36} />
            <span className="leading-tight min-w-0">
              <b className="block text-sm text-ink truncate">{user.name}</b>
              <small className="text-xs text-muted">{user.roleName}</small>
            </span>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex flex-col">
        <Topbar user={user} onMenu={() => setOpen(true)} />
        <main id="conteudo" tabIndex={-1} className="flex-1 px-4 sm:px-6 lg:px-8 py-7 max-w-[1600px] w-full mx-auto outline-none">{children}</main>
      </div>
    </div>
  );
}

function Topbar({ user, onMenu }: { user: ShellUser; onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 h-[72px] bg-chrome/90 backdrop-blur border-b border-line flex items-center gap-3 px-4 sm:px-6 lg:px-8">
      <button onClick={onMenu} className="lg:hidden size-10 shrink-0 grid place-items-center rounded-xl border border-line bg-white" aria-label="Abrir menu">
        <Icon name="menu" />
      </button>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('app:palette'))}
        className="relative flex-1 min-w-0 max-w-[520px] h-10 rounded-full bg-white pl-10 pr-3 sm:pr-16 text-sm text-faint text-left border border-line hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-brand-500"
        aria-label="Busca global e ações (Ctrl+K)"
      >
        <Icon name="search" className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <span className="block truncate">Buscar lead, empresa, oportunidade, conversa…</span>
        <kbd className="hidden sm:inline absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono border border-line rounded-md px-1.5 bg-chrome">Ctrl K</kbd>
      </button>
      <div className="ml-auto lg:ml-12 flex items-center gap-3">
        <Notifications />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

type ShellUser = { name: string; email: string; role: string; roleName: string; scopeLabel: string; menu: 'full' | 'simple' | null; canProfile: boolean };

type Notif = { id: string; title: string; body: string | null; link: string | null; priority?: string; readAt: string | null; createdAt: string };

function Notifications() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: Notif[]; unread: number }>({ items: [], unread: 0 });
  const load = () => api<{ items: Notif[]; unread: number }>('/notifications').then(setData).catch(() => undefined);
  useEffect(() => {
    load();
    // Tempo real via SSE; o intervalo longo é só uma rede de segurança (sem polling agressivo).
    const onRt = () => load();
    window.addEventListener('rt:notification', onRt);
    const t = setInterval(load, 120_000);
    return () => {
      clearInterval(t);
      window.removeEventListener('rt:notification', onRt);
    };
  }, []);
  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && data.unread) api('/notifications', { method: 'POST' }).then(() => setTimeout(load, 400));
        }}
        className="relative size-10 grid place-items-center rounded-full border border-line bg-white hover:bg-slate-50"
        aria-label={`Notificações (${data.unread} não lidas)`}
      >
        <Icon name="bell" />
        {data.unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-[10.5px] font-bold grid place-items-center">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(360px,calc(100vw-24px))] bg-white border border-line rounded-2xl shadow-xl z-30 animate-in overflow-hidden">
          <div className="px-5 py-4 border-b border-line font-semibold text-base">Notificações</div>
          <ul className="max-h-96 overflow-y-auto scroll-thin divide-y divide-line">
            {data.items.length === 0 && (
              <li className="px-4 py-9 text-sm text-muted text-center">
                <Icon name="bell" className="size-5 mx-auto mb-2 opacity-50" />
                Nada por aqui.
              </li>
            )}
            {data.items.map((n) => (
              <li key={n.id}>
                <a href={`/api/v1/notifications/${n.id}/open?via=bell`} onClick={() => setOpen(false)} className={cx('block px-4 py-2.5 hover:bg-slate-50', !n.readAt && 'bg-brand-50/60')}>
                  <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                    {(n.priority === 'HIGH' || n.priority === 'CRITICAL') && <span className={cx('size-2 rounded-full shrink-0', n.priority === 'CRITICAL' ? 'bg-bad' : 'bg-series-4')} aria-label={`Prioridade ${n.priority}`} />}
                    {n.title}
                  </div>
                  {n.body && <div className="text-xs text-muted line-clamp-2">{n.body}</div>}
                  <div className="text-[11px] text-faint mt-0.5">{new Date(n.createdAt).toLocaleString('pt-BR')}</div>
                </a>
              </li>
            ))}
          </ul>
          <Link href="/notificacoes" onClick={() => setOpen(false)} className="block text-center text-sm font-medium text-brand-600 py-3 bg-slate-50 hover:bg-slate-100">
            Ver todas · preferências
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const item = 'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] text-ink hover:bg-slate-100 text-left';
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/login';
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2.5 rounded-full pr-2 h-10 hover:bg-slate-100" aria-label="Menu do usuário" aria-expanded={open}>
        <Avatar name={user.name} tone="dark" size={38} />
        <span className="hidden sm:block text-left leading-tight">
          <b className="block text-[13.5px] text-ink">{user.name}</b>
          <small className="text-[11.5px] text-muted">{user.roleName}</small>
        </span>
        <span className="hidden sm:block text-muted text-xs ml-1" aria-hidden>
          ⌄
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-3 w-[min(300px,calc(100vw-24px))] bg-white border border-line rounded-3xl shadow-xl z-30 animate-in overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
            <Avatar name={user.name} tone="dark" size={42} />
            <span className="leading-tight min-w-0">
              <b className="block text-[15px] text-ink truncate">{user.name}</b>
              {user.email && <small className="block text-xs text-muted truncate">{user.email}</small>}
              <small className="text-xs font-medium text-brand-600" title={`Escopo de dados: ${user.scopeLabel}`}>
                {user.roleName}
              </small>
            </span>
          </div>
          <div className="p-2" onClick={() => setOpen(false)}>
            {user.canProfile && (
              <Link href="/perfil" className={item}>
                <Icon name="user" className="size-4" /> Meu perfil
              </Link>
            )}
            <Link href="/configuracoes/notificacoes" className={item}>
              <Icon name="bell" className="size-4" /> Preferências de notificação
            </Link>
            <Link href="/configuracoes/senha" className={item}>
              <Icon name="lock" className="size-4" /> Trocar senha
            </Link>
            {user.menu && (
              <button
                className={item}
                onClick={() => {
                  document.cookie = `pa_nav=${user.menu === 'full' ? 'simple' : 'full'}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
                  window.location.reload();
                }}
              >
                <Icon name="grid" className="size-4" /> {user.menu === 'full' ? 'Menu enxuto' : 'Menu completo do sistema'}
              </button>
            )}
            <button className={item} onClick={logout}>
              <Icon name="refresh" className="size-4" /> Trocar de perfil
            </button>
            <button className={cx(item, '!text-bad border-t border-line rounded-t-none mt-1')} onClick={logout}>
              <Icon name="logout" className="size-4" /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
