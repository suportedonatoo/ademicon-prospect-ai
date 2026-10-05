'use client';

import { useState, type ReactNode } from 'react';

// Gráficos SVG leves: marcas finas, cantos de 4px na ponta, grade discreta, tooltip no hover.
// Cores por papel (tokens em globals.css). Série única = azul; categorias = ordem fixa da paleta.

const SERIES = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)', 'var(--color-series-5)', 'var(--color-series-6)', 'var(--color-series-7)', 'var(--color-series-8)'];
const RAMP = ['var(--color-ramp-1)', 'var(--color-ramp-2)', 'var(--color-ramp-3)', 'var(--color-ramp-4)', 'var(--color-ramp-5)', 'var(--color-ramp-6)'];
const fmt = (n: number) => n.toLocaleString('pt-BR');

function Tip({ x, y, children }: { x: number | string; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg whitespace-nowrap" style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  );
}

/** Barras horizontais (ranking). Uma série → azul; valor escrito ao lado (texto em tinta, não na cor da série). */
export function BarList({ items, format = fmt, empty = 'Sem dados no período.' }: { items: { label: string; value: number; sub?: string; href?: string }[]; format?: (n: number) => string; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length || items.every((i) => !i.value)) return <div className="text-sm text-muted py-6 text-center">{empty}</div>;
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="group grid grid-cols-[minmax(110px,200px)_1fr_auto] items-center gap-3 text-sm" title={`${i.label}: ${format(i.value)}${i.sub ? ` · ${i.sub}` : ''}`}>
          <span className="truncate text-ink-2">{i.href ? <a className="hover:underline" href={i.href}>{i.label}</a> : i.label}</span>
          <span className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <span className="block h-full rounded-full bg-series-1 group-hover:bg-brand-600 transition-[width] duration-500" style={{ width: `${Math.max(1, (i.value / max) * 100)}%` }} />
          </span>
          <span className="tabular font-medium text-ink text-right min-w-12">
            {format(i.value)}
            {i.sub && <span className="block text-[11px] font-normal text-muted">{i.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Funil ordinal: rampa de um só tom (claro → escuro) + taxa de passagem entre etapas. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const prev = steps[i - 1]?.value;
        const rate = prev ? (s.value / prev) * 100 : null;
        return (
          <li key={s.label} className="grid grid-cols-[110px_1fr_110px] items-center gap-3 text-sm" title={`${s.label}: ${fmt(s.value)}`}>
            <span className="text-ink-2">{s.label}</span>
            <span className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (s.value / max) * 100)}%`, background: RAMP[Math.min(i, RAMP.length - 1)] }} />
            </span>
            <span className="tabular text-right">
              <b className="text-ink">{fmt(s.value)}</b>
              {rate != null && <span className="text-xs text-muted ml-1.5">{rate.toFixed(0)}%</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Série temporal: linhas de 2px com crosshair + tooltip. Até 2 séries, legenda + rótulo direto. */
export function LineChart({ data, series, height = 220 }: { data: { label: string; values: number[] }[]; series: { name: string }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const pad = { l: 36, r: 16, t: 14, b: 26 };
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const nice = Math.ceil(max / 4) * 4 || 4;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / nice) * ih;
  const ticks = [0, nice / 2, nice];
  const every = Math.ceil(data.length / 8);
  if (!data.length) return <div className="text-sm text-muted py-10 text-center">Sem dados no período.</div>;

  return (
    <div className="relative">
      {series.length > 1 && (
        <div className="flex gap-4 text-xs text-ink-2 mb-2">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <i className="inline-block w-3 h-[3px] rounded" style={{ background: SERIES[i] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={series.map((s) => s.name).join(' e ')} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e9eee7" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
              {fmt(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % every === 0 || i === data.length - 1 ? (
            <text key={d.label} x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[11px]">
              {d.label}
            </text>
          ) : null
        )}
        {series.map((s, si) => (
          <polyline key={s.name} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={data.map((d, i) => `${x(i)},${y(d.values[si])}`).join(' ')} />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="#8b958d" strokeDasharray="3 3" />}
        {hover != null && series.map((s, si) => <circle key={s.name} cx={x(hover)} cy={y(data[hover].values[si])} r={4.5} fill={SERIES[si]} stroke="white" strokeWidth={2} />)}
        {data.map((d, i) => (
          <rect key={i} x={x(i) - iw / data.length / 2} y={pad.t} width={Math.max(4, iw / data.length)} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && (
        <Tip x={`${(x(hover) / W) * 100}%`} y={0}>
          <b>{data[hover].label}</b>
          {series.map((s, si) => (
            <div key={s.name}>
              {s.name}: <b className="tabular">{fmt(data[hover].values[si])}</b>
            </div>
          ))}
        </Tip>
      )}
    </div>
  );
}

/** Colunas em pílula (série única). A última (ou a que está sob o cursor) fica em destaque com o valor. */
export function Columns({ items, format = fmt, tipSuffix = '' }: { items: { label: string; value: number }[]; format?: (n: number) => string; tipSuffix?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="text-sm text-muted py-10 text-center">Sem dados.</div>;
  const on = hover ?? items.length - 1;
  const every = Math.ceil(items.length / 8);
  return (
    <div>
      <div className="flex items-end gap-1.5 sm:gap-2 h-52 pt-8" onMouseLeave={() => setHover(null)}>
        {items.map((i, idx) => (
          <div key={i.label} className="relative flex-1 flex flex-col items-center justify-end h-full min-w-0" onMouseEnter={() => setHover(idx)} title={`${i.label}: ${format(i.value)}`}>
            {on === idx && <span className="absolute z-10 -translate-y-1.5 rounded-lg bg-ink px-2 py-1 text-xs font-medium text-white whitespace-nowrap" style={{ bottom: `${Math.max(6, (i.value / max) * 100)}%` }}>{format(i.value)}{hover == null ? tipSuffix : ''}</span>}
            <span className={`w-full max-w-9 min-h-2.5 rounded-full transition-colors ${on === idx ? 'bg-series-1' : 'bg-slate-200'}`} style={{ height: `${(i.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 sm:gap-2 mt-2">
        {items.map((i, idx) => (
          <span key={i.label} className={`flex-1 text-center text-[11px] whitespace-nowrap overflow-visible min-w-0 ${idx === items.length - 1 ? 'font-semibold text-ink' : 'text-muted'}`}>
            {idx % every === 0 || idx === items.length - 1 ? i.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barra 100% empilhada para composição (≤ 6 categorias) com legenda sempre visível. */
export function Composition({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 gap-[2px] rounded-full overflow-hidden mb-4">
        {items.filter((i) => i.value).map((i, idx) => (
          <span key={i.label} title={`${i.label}: ${fmt(i.value)} (${Math.round((i.value / total) * 100)}%)`} style={{ flex: i.value, background: SERIES[idx % SERIES.length] }} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {items.map((i, idx) => (
          <li key={i.label} className="flex items-center gap-2 min-w-0">
            <i className="size-2.5 rounded-sm shrink-0" style={{ background: SERIES[idx % SERIES.length] }} />
            <span className="truncate text-ink-2">{i.label}</span>
            <b className="ml-auto tabular text-ink">{fmt(i.value)}</b>
            <span className="text-xs text-muted w-9 text-right tabular">{Math.round((i.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Rosca de composição com total no centro e legenda em lista (valor + %). */
export function Donut({ items, centerLabel = 'total' }: { items: { label: string; value: number }[]; centerLabel?: string }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total) return <div className="text-sm text-muted py-10 text-center">Sem dados no período.</div>;
  const TONES = ['#131c17', '#2f9e5b', '#8fd3a0', '#c8f29a', '#7d8a81', '#c9d2c7', '#4a6a58', '#d9a441'];
  const C = 2 * Math.PI * 40;
  let acc = 0;
  return (
    <div className="grid sm:grid-cols-[200px_1fr] items-center gap-6">
      <div className="relative mx-auto w-[200px]">
        <svg viewBox="0 0 100 100" className="w-full -rotate-90" role="img" aria-label={items.map((i) => `${i.label}: ${i.value}`).join(', ')}>
          {items.map((i, idx) => {
            const len = (i.value / total) * C;
            const el = <circle key={i.label} cx="50" cy="50" r="40" fill="none" stroke={TONES[idx % TONES.length]} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 0.8)} ${C}`} strokeDashoffset={-acc} />;
            acc += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-[11px] text-muted">{centerLabel}</span>
          <b className="text-2xl tabular leading-tight">{fmt(total)}</b>
        </div>
      </div>
      <ul className="divide-y divide-line text-[14.5px]">
        {items.map((i, idx) => (
          <li key={i.label} className="flex items-center gap-3 py-2.5 min-w-0">
            <i className="size-2.5 rounded-[3px] shrink-0" style={{ background: TONES[idx % TONES.length] }} />
            <span className="truncate text-ink">{i.label}</span>
            <b className="ml-auto tabular">{fmt(i.value)}</b>
            <span className="text-xs text-muted w-10 text-right tabular">{Math.round((i.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
