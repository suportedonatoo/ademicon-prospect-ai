// LEAD RECOVERY — classifica cada situação de recuperação em uma fila (motor puro).

export type RecoveryReason =
  | 'HOT_UNATTENDED'
  | 'ABANDONED_CONVERSATION'
  | 'FORGOTTEN_LEAD'
  | 'STALLED_OPPORTUNITY'
  | 'PROPOSAL_NO_RETURN'
  | 'REHEATED';
export type RecoveryQueue = 'NOW' | 'TODAY' | 'NURTURE' | 'NONE';

export const RECOVERY_REASON_LABEL: Record<RecoveryReason, string> = {
  HOT_UNATTENDED: 'Lead quente não atendido',
  ABANDONED_CONVERSATION: 'Conversa abandonada',
  FORGOTTEN_LEAD: 'Lead esquecido',
  STALLED_OPPORTUNITY: 'Oportunidade parada',
  PROPOSAL_NO_RETURN: 'Proposta sem retorno',
  REHEATED: 'Lead reaquecido',
};
export const RECOVERY_QUEUE_LABEL: Record<RecoveryQueue, string> = { NOW: 'Recuperar agora', TODAY: 'Recuperar hoje', NURTURE: 'Nutrir', NONE: 'Sem prioridade' };

export interface RecoveryInput {
  reason: RecoveryReason;
  temperature: string;
  hoursIdle: number;
  optOut: boolean;
  priorityIndex: number;
}

export function classifyRecovery(i: RecoveryInput): RecoveryQueue {
  if (i.optOut) return 'NONE';
  switch (i.reason) {
    case 'HOT_UNATTENDED':
      return 'NOW';
    case 'ABANDONED_CONVERSATION':
      return i.temperature === 'QUENTE' || i.hoursIdle <= 24 ? 'NOW' : 'TODAY';
    case 'REHEATED':
      return i.temperature === 'QUENTE' || i.priorityIndex >= 60 ? 'NOW' : 'TODAY';
    case 'PROPOSAL_NO_RETURN':
      return i.hoursIdle >= 24 * 7 ? 'NOW' : 'TODAY';
    case 'STALLED_OPPORTUNITY':
      return i.temperature === 'QUENTE' ? 'NOW' : 'TODAY';
    case 'FORGOTTEN_LEAD':
      if (i.temperature === 'QUENTE') return 'NOW';
      if (i.temperature === 'MORNO') return 'TODAY';
      return 'NURTURE';
  }
}
