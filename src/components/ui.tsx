import Link from 'next/link';
import type { ReactNode } from 'react';
import { initials } from '@/lib/format';

// Componentes de apresentação reutilizáveis (server-safe, sem estado).

export const cx = (...c: unknown[]) => c.filter((x) => typeof x === 'string' && x).join(' ');

export function PageHeader({ title, subtitle, actions, crumb, aside }: { title: string; subtitle?: ReactNode; actions?: ReactNode; crumb?: string; aside?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {crumb && <div className="text-xs font-medium uppercase tracking-[0.08em] text-brand-500 mb-1.5">{crumb}</div>}
        <h1 className="text-[30px] leading-[1.15] font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-[15px] text-muted mt-1.5 max-w-3xl">{subtitle}</p>}
        {actions && <div className="flex flex-wrap items-center gap-2 mt-4">{actions}</div>}
      </div>
      {aside}
    </div>
  );
}

export function Card({ children, className, title, subtitle, actions, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx('bg-surface border border-line rounded-3xl min-w-0', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="text-[13px] text-muted mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cx(pad && 'p-6', pad && (title || actions) && 'pt-4', !pad && (title || actions) && 'pt-3', !pad && '[&>.tbl]:px-5 [&>.tbl]:pt-5 overflow-hidden rounded-b-3xl')}>{children}</div>
    </section>
  );
}

/** Valores longos (texto) usam corpo menor para caber no cartão. */
export const bigValue = (v: unknown) => (typeof v === 'string' && v.length > 9 ? 'text-xl' : 'text-[32px]');

export function Stat({ label, value, hint, tone = 'default', href }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'hero'; href?: string }) {
  const body = (
    <div className={cx('rounded-3xl border p-5 h-full transition-colors', tone === 'hero' ? 'bg-ink border-ink text-white' : 'bg-surface border-line hover:border-brand-200')}>
      <div className={cx('text-[13px]', tone === 'hero' ? 'text-white/80' : 'text-muted')}>{label}</div>
      <div className={cx('leading-tight font-bold tracking-tight tabular mt-1.5 break-words', bigValue(value))}>{value}</div>
      {hint && <div className={cx('text-xs mt-1.5', tone === 'hero' ? 'text-lime' : 'text-faint')}>{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const TONES = {
  gray: 'bg-slate-100 text-ink-2',
  blue: 'bg-[#dfe8f8] text-[#2a4f9c]',
  green: 'bg-ok-50 text-ok',
  amber: 'bg-warn-50 text-warn',
  red: 'bg-bad-50 text-bad',
  violet: 'bg-[#ece4f8] text-[#5b3ea6]',
  dark: 'bg-ink text-white',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = 'gray', dot, className, title }: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = 28, tone = 'blue' }: { name?: string | null; size?: number; tone?: 'blue' | 'dark' | 'green' }) {
  const bg = tone === 'dark' ? 'bg-ink text-lime' : tone === 'green' ? 'bg-ok-50 text-ok' : avatarTone(name);
  return (
    <span className={cx('inline-grid place-items-center rounded-full font-semibold shrink-0', bg)} style={{ width: size, height: size, fontSize: size * 0.38 }} title={name ?? ''}>
      {initials(name)}
    </span>
  );
}

/** Tom pastel estável por nome (iniciais coloridas, como nas listas). */
const AVATAR_TONES = ['bg-[#dfe8f8] text-[#2a4f9c]', 'bg-ok-50 text-ok', 'bg-warn-50 text-warn', 'bg-bad-50 text-bad', 'bg-ink text-lime'];
export const avatarTone = (name?: string | null) => AVATAR_TONES[[...(name ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="mx-auto size-10 rounded-full bg-slate-100 grid place-items-center text-faint mb-3">○</div>
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="text-sm text-muted mt-1 max-w-md mx-auto">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{label}</dt>
      <dd className="text-[14.5px] text-ink mt-1 break-words">{children ?? '—'}</dd>
    </div>
  );
}

export function LinkButton({ href, children, variant = 'secondary', size = 'md', className }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md'; className?: string }) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size), className)}>
      {children}
    </Link>
  );
}

export function buttonClass(variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary', size: 'sm' | 'md' = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
    size === 'sm' ? 'rounded-full text-[12.5px] px-3 py-1.5' : 'rounded-xl text-sm px-4 h-10',
    variant === 'primary' && 'bg-ink text-white hover:bg-[#22302a]',
    variant === 'secondary' && 'bg-surface text-ink border border-line hover:bg-slate-50',
    variant === 'ghost' && 'text-ink-2 hover:bg-slate-100',
    variant === 'danger' && 'bg-surface text-bad border border-[#f0c9c5] hover:bg-bad-50'
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="tbl overflow-x-auto scroll-thin">
      <table className={cx('w-full text-sm', className)}>{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cx('text-left text-[11px] font-medium uppercase tracking-[0.08em] text-faint px-4 py-3 bg-slate-50 first:rounded-l-xl last:rounded-r-xl whitespace-nowrap', className)}>{children}</th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx('px-4 py-3.5 border-b border-line align-middle', className)}>{children}</td>;

export function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint mb-3">{title}</h3>
      {children}
    </div>
  );
}

export function Notice({ tone = 'blue', title, children }: { tone?: 'blue' | 'amber' | 'green' | 'red'; title?: string; children: ReactNode }) {
  const map = { blue: 'bg-brand-50 border-brand-100', amber: 'bg-warn-50 border-[#eed9a8]', green: 'bg-ok-50 border-brand-200', red: 'bg-bad-50 border-[#f0c9c5]' };
  return (
    <div className={cx('rounded-2xl border px-4 py-3 text-sm text-ink-2', map[tone])}>
      {title && <b className="text-ink">{title} </b>}
      {children}
    </div>
  );
}
