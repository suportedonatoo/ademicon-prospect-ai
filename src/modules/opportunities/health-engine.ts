// OPPORTUNITY INTELLIGENCE — saúde, risco, idade na etapa e velocidade (motor puro, por regra).
// Não é probabilidade de fechamento: é um indicador operacional com motivos explícitos.

export type OpportunityHealth = 'HEALTHY' | 'AT_RISK' | 'STALLED';

export interface HealthConfig {
  /** Dias esperados em cada etapa antes de acender alerta. */
  stageSlaDays: Record<string, number>;
  /** Dias sem nenhuma atividade para considerar PARADA. */
  stallDays: number;
}

export const DEFAULT_HEALTH: HealthConfig = {
  stageSlaDays: { NOVO: 2, QUALIFICADO: 3, OPORTUNIDADE: 3, CONTATO: 5, NECESSIDADE: 7, SIMULACAO: 5, PROPOSTA: 7, NEGOCIACAO: 10 },
  stallDays: 14,
};

export interface HealthInput {
  status: string;
  stageKey: string;
  stageOrder: number;
  createdAt: Date;
  stageChangedAt: Date;
  lastActivityAt: Date | null;
  openTasks: number;
  overdueTasks: number;
  leadTemperature: string | null;
  awaitingReply: boolean;
}

export interface HealthResult {
  health: OpportunityHealth;
  score: number;
  reasons: string[];
  stageAgeDays: number;
  idleDays: number;
  /** Etapas avançadas por semana desde a criação. */
  velocity: number;
  followUpStatus: 'OK' | 'MISSING' | 'OVERDUE';
}

const DAY = 86_400_000;

export function assessOpportunity(o: HealthInput, config: HealthConfig = DEFAULT_HEALTH, now = new Date()): HealthResult | null {
  if (o.status !== 'OPEN') return null;
  const stageAgeDays = (now.getTime() - o.stageChangedAt.getTime()) / DAY;
  const idleDays = (now.getTime() - (o.lastActivityAt ?? o.stageChangedAt).getTime()) / DAY;
  const ageWeeks = Math.max(1 / 7, (now.getTime() - o.createdAt.getTime()) / DAY / 7);
  const velocity = Math.round((Math.max(0, o.stageOrder - 1) / ageWeeks) * 10) / 10;
  const sla = config.stageSlaDays[o.stageKey] ?? 7;
  const reasons: string[] = [];
  let score = 100;

  if (idleDays >= config.stallDays) {
    score -= 50;
    reasons.push(`Sem atividade há ${Math.floor(idleDays)} dias`);
  } else if (idleDays >= 7) {
    score -= 25;
    reasons.push(`Sem atividade há ${Math.floor(idleDays)} dias`);
  }
  if (stageAgeDays > sla * 2) {
    score -= 30;
    reasons.push(`Há ${Math.floor(stageAgeDays)} dias na etapa (esperado: até ${sla})`);
  } else if (stageAgeDays > sla) {
    score -= 15;
    reasons.push(`Acima do tempo esperado na etapa (${Math.floor(stageAgeDays)}/${sla} dias)`);
  }
  if (o.overdueTasks) {
    score -= Math.min(30, o.overdueTasks * 15);
    reasons.push(`${o.overdueTasks} tarefa(s) atrasada(s)`);
  }
  if (!o.openTasks) {
    score -= 10;
    reasons.push('Sem próximo passo agendado');
  }
  if (o.awaitingReply) {
    score -= 15;
    reasons.push('Cliente aguardando resposta');
  }
  if (o.leadTemperature === 'FRIO') {
    score -= 10;
    reasons.push('Lead esfriou');
  }
  score = Math.max(0, Math.min(100, score));
  const health: OpportunityHealth = idleDays >= config.stallDays || stageAgeDays > sla * 2 ? 'STALLED' : score < 60 ? 'AT_RISK' : 'HEALTHY';
  const followUpStatus = o.overdueTasks ? 'OVERDUE' : o.openTasks ? 'OK' : 'MISSING';
  if (!reasons.length) reasons.push('Dentro do esperado');
  return { health, score, reasons, stageAgeDays: Math.round(stageAgeDays * 10) / 10, idleDays: Math.round(idleDays * 10) / 10, velocity, followUpStatus };
}

export const HEALTH_LABEL: Record<OpportunityHealth, string> = { HEALTHY: 'Saudável', AT_RISK: 'Em risco', STALLED: 'Parada' };

export const LOSS_CATEGORIES = {
  PRECO: 'Preço / parcela',
  CONCORRENTE: 'Fechou com concorrente',
  PRAZO: 'Prazo / contemplação',
  SEM_INTERESSE: 'Perdeu o interesse',
  SEM_CONTATO: 'Sem contato / não respondeu',
  DESISTENCIA: 'Desistiu da compra',
  PRODUTO: 'Produto não atende',
  OUTRO: 'Outro',
} as const;
export type LossCategory = keyof typeof LOSS_CATEGORIES;

/** Classifica um motivo de perda digitado livremente (quando a categoria não vier informada). */
export function classifyLoss(reason: string | null | undefined): LossCategory {
  const r = (reason ?? '').toLowerCase();
  if (/concorr|outra administradora|outro cons|banco|financiamento/.test(r)) return 'CONCORRENTE';
  if (/pre[cç]o|parcela|caro|taxa|valor|bolso/.test(r)) return 'PRECO';
  if (/prazo|contempla|demora|esperar/.test(r)) return 'PRAZO';
  if (/n[aã]o respond|sem contato|sumiu|n[aã]o atende|telefone/.test(r)) return 'SEM_CONTATO';
  if (/desist|n[aã]o vai mais|adiou|cancel/.test(r)) return 'DESISTENCIA';
  if (/interesse/.test(r)) return 'SEM_INTERESSE';
  if (/produto|n[aã]o atende|n[aã]o tem/.test(r)) return 'PRODUTO';
  return 'OUTRO';
}
