import type { LeadStatusKey } from './catalog';
import { BadRequest } from '@/lib/errors';

// Máquina de estados do lead. Toda mudança de status passa por aqui.
export const TRANSITIONS: Record<LeadStatusKey, LeadStatusKey[]> = {
  NEW: ['PROCESSING', 'QUALIFIED', 'IN_CONVERSATION', 'ASSIGNED', 'LOST', 'BLOCKED'],
  PROCESSING: ['NEW', 'QUALIFIED', 'ASSIGNED', 'IN_CONVERSATION', 'LOST', 'BLOCKED'],
  QUALIFIED: ['ASSIGNED', 'IN_CONVERSATION', 'OPPORTUNITY', 'LOST', 'BLOCKED'],
  ASSIGNED: ['IN_CONVERSATION', 'OPPORTUNITY', 'QUALIFIED', 'LOST', 'BLOCKED'],
  IN_CONVERSATION: ['NEW', 'QUALIFIED', 'ASSIGNED', 'OPPORTUNITY', 'LOST', 'BLOCKED'],
  OPPORTUNITY: ['CONVERTED', 'LOST', 'ASSIGNED', 'IN_CONVERSATION'],
  CONVERTED: [],
  LOST: ['NEW', 'QUALIFIED', 'ASSIGNED'],
  BLOCKED: ['NEW'],
};

export function canTransition(from: LeadStatusKey, to: LeadStatusKey): boolean {
  return from === to || TRANSITIONS[from]?.includes(to);
}

export function assertTransition(from: LeadStatusKey, to: LeadStatusKey) {
  if (!canTransition(from, to)) throw BadRequest(`Transição de status inválida: ${from} → ${to}`);
}

/** Estados em que o lead ocupa a capacidade de um consultor. */
export const OPEN_ASSIGNED_STATUSES: LeadStatusKey[] = ['ASSIGNED', 'IN_CONVERSATION', 'OPPORTUNITY'];
