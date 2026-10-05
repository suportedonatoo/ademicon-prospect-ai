import Link from 'next/link';
import { cx } from '@/components/ui';
import { PERIOD_LABEL, type Period } from '@/modules/management/dashboards.service';

export const PERIODS = Object.keys(PERIOD_LABEL) as Period[];

export function parsePeriod(v?: string): Period {
  return PERIODS.includes(v as Period) ? (v as Period) : 'mes';
}

/** Abas de período (Hoje · 7 dias · 30 dias · Este mês). */
export function PeriodTabs({ current, base }: { current: Period; base: string }) {
  return (
    <div className="inline-flex gap-0.5 rounded-full border border-line bg-surface p-1 text-sm">
      {PERIODS.map((p) => (
        <Link key={p} href={`${base}?p=${p}`} className={cx('px-3.5 py-1.5 rounded-full whitespace-nowrap', current === p ? 'bg-ink text-white font-medium' : 'text-ink-2 hover:bg-slate-100')}>
          {PERIOD_LABEL[p]}
        </Link>
      ))}
    </div>
  );
}
