import { Badge, cx, type Tone } from './ui';
import { intentLabel, landingHeatLabel, sourceLabel, statusLabel, temperatureLabel } from '@/modules/leads/catalog';

const TEMP_TONE: Record<string, Tone> = { FRIO: 'blue', MORNO: 'amber', QUENTE: 'red' };
const STATUS_TONE: Record<string, Tone> = {
  NEW: 'gray',
  PROCESSING: 'gray',
  QUALIFIED: 'blue',
  ASSIGNED: 'violet',
  IN_CONVERSATION: 'amber',
  OPPORTUNITY: 'blue',
  CONVERTED: 'green',
  LOST: 'red',
  BLOCKED: 'dark',
};

export function ScoreBadge({ score, temperature, size = 'md' }: { score: number; temperature: string; size?: 'sm' | 'md' }) {
  const tone = TEMP_TONE[temperature] ?? 'gray';
  const ring = { gray: 'ring-slate-300 text-slate-700', amber: 'ring-warn text-warn', blue: 'ring-[#9db4e0] text-[#2a4f9c]', red: 'ring-bad text-bad' }[tone as 'gray'] ?? 'ring-slate-300';
  return (
    <span title={`Score ${score} · ${temperatureLabel(temperature)} (indicador operacional, não é garantia de compra)`} className={cx('inline-grid place-items-center rounded-lg ring-[1.5px] font-bold tabular bg-white', ring, size === 'sm' ? 'min-w-8 h-6 text-xs px-1' : 'min-w-10 h-8 text-sm px-1.5')}>
      {score}
    </span>
  );
}

export const TempBadge = ({ temperature }: { temperature: string }) => (
  <Badge tone={TEMP_TONE[temperature] ?? 'gray'} dot>
    {temperatureLabel(temperature)}
  </Badge>
);

export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? 'gray'}>{statusLabel(status)}</Badge>;

export const SourceBadge = ({ source }: { source: string }) => <Badge tone="gray">{sourceLabel(source)}</Badge>;

export const IntentBadge = ({ intent }: { intent?: string | null }) =>
  intent ? <Badge tone={intent === 'HIGH' ? 'green' : intent === 'MEDIUM' ? 'amber' : 'gray'}>Intenção {intentLabel(intent).toLowerCase()}</Badge> : null;

export function ModeBadge({ mode }: { mode: string }) {
  return mode === 'HUMAN' ? (
    <Badge tone="green" dot>
      CONSULTOR ATIVO
    </Badge>
  ) : (
    <Badge tone="violet" dot>
      IA ATIVA
    </Badge>
  );
}

/** Qualificação feita na landing da PJ: Morno (deixou contato) / Quente (pediu para ser chamado agora). */
export const LandingHeatBadge = ({ heat }: { heat?: string | null }) =>
  heat ? (
    <Badge tone={heat === 'QUENTE' ? 'red' : heat === 'MORNO' ? 'amber' : 'gray'} dot>
      Landing: {landingHeatLabel(heat)}
    </Badge>
  ) : null;
