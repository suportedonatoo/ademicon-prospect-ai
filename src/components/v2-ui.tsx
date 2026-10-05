import type { ReactNode } from 'react';
import { Badge, bigValue, cx, type Tone } from './ui';

// Componentes de apresentação da V2 (server-safe).

export function SubScoreBars({ scores, method = 'RULE' }: { scores: { label: string; value: number }[]; method?: string }) {
  return (
    <div className="space-y-2">
      {scores.map((s) => (
        <div key={s.label} className="grid grid-cols-[110px_1fr_32px] items-center gap-3 text-sm">
          <span className="text-ink-2">{s.label}</span>
          <span className="h-2 rounded-full bg-slate-100 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.value} aria-label={s.label}>
            <span className="block h-full rounded-full bg-series-1" style={{ width: `${Math.max(2, s.value)}%` }} />
          </span>
          <b className="tabular text-right text-ink">{s.value}</b>
        </div>
      ))}
      <p className="text-[11px] text-faint">{method === 'RULE' ? 'Sinal por regra (explicável) — não é probabilidade de compra.' : method}</p>
    </div>
  );
}

const PRIORITY_TONE: Record<string, Tone> = { CRITICAL: 'red', HIGH: 'amber', MEDIUM: 'blue', LOW: 'gray' };
const PRIORITY_LABEL: Record<string, string> = { CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' };
export const PriorityBadge = ({ p }: { p: string }) => <Badge tone={PRIORITY_TONE[p] ?? 'gray'}>{PRIORITY_LABEL[p] ?? p}</Badge>;

const STATUS_TONE: Record<string, Tone> = { OK: 'green', WARN: 'amber', DOWN: 'red', MOCK: 'violet', NOT_CONFIGURED: 'gray', CONNECTED: 'green', ERROR: 'red', DISABLED: 'gray', HEALTHY: 'green', AT_RISK: 'amber', STALLED: 'red', NORMAL: 'green', ALTA: 'amber', CRITICA: 'red', INDISPONIVEL: 'gray' };
const STATUS_LABEL: Record<string, string> = { OK: 'OK', WARN: 'Atenção', DOWN: 'Crítico', MOCK: 'Mock', NOT_CONFIGURED: 'Não configurado', CONNECTED: 'Conectado', ERROR: 'Erro', DISABLED: 'Desativado', HEALTHY: 'Saudável', AT_RISK: 'Em risco', STALLED: 'Parada', NORMAL: 'Normal', ALTA: 'Alta', CRITICA: 'Crítica', INDISPONIVEL: 'Indisponível' };
export const StatusBadge2 = ({ s }: { s: string | null | undefined }) => (s ? <Badge tone={STATUS_TONE[s] ?? 'gray'} dot>{STATUS_LABEL[s] ?? s}</Badge> : <span className="text-faint">—</span>);

/** Indicador: cartão neutro; o tom vira um selo discreto. `tone="hero"` é o cartão escuro de destaque da linha. */
export function Kpi({ label, value, tone = 'default', hint, href }: { label: string; value: ReactNode; tone?: 'default' | 'red' | 'amber' | 'green' | 'hero'; hint?: ReactNode; href?: string }) {
  const hero = tone === 'hero';
  const flag = { red: ['red', 'crítico'], amber: ['amber', 'atenção'], green: ['green', 'ok'] }[tone as 'red'] as [Tone, string] | undefined;
  const body = (
    <div className={cx('rounded-3xl border p-5 h-full', hero ? 'bg-ink border-ink text-white' : 'bg-surface border-line')}>
      <div className={cx('flex items-start justify-between gap-2 text-[13px]', hero ? 'text-white/80' : 'text-muted')}>
        {/* rótulos antigos vinham com emoji; o visual novo não usa */}
        <span>{label.replace(/^[^\p{L}\p{N}]+/u, '')}</span>
        {flag && <Badge tone={flag[0]}>{flag[1]}</Badge>}
      </div>
      <div className={cx('leading-tight font-bold tracking-tight tabular mt-1.5 break-words', bigValue(value), !hero && 'text-ink')}>{value}</div>
      {hint && <div className={cx('text-xs mt-1.5', hero ? 'text-lime' : 'text-faint')}>{hint}</div>}
    </div>
  );
  return href ? (
    <a href={href} className="block hover:opacity-90">
      {body}
    </a>
  ) : (
    body
  );
}

export function DataNote({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] text-faint mt-2">{children}</p>;
}
