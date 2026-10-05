// Distribuição de leads.
// Estratégia atual: Round Robin (PJ 001 → 002 → ... → 005 → 001 ...).
// Para 70 PJs, pesos, região ou produto, basta adicionar uma nova estratégia
// em STRATEGIES e apontar config.distributionStrategy para ela.
import { db } from './db.js';
import { config } from '../config.js';
import { listPJs } from './auth.js';

const STRATEGIES = {
  'round-robin': (pjs, state) => {
    const pj = pjs[state.pointer % pjs.length];
    state.pointer = (state.pointer + 1) % pjs.length;
    return pj;
  },
};

// Retorna o próximo PJ SEM consumir a vez (usado para mostrar "próximo da fila").
export function peekNextPJ() {
  const pjs = listPJs();
  const state = db.distribution;
  return pjs[state.pointer % pjs.length];
}

export function pickNextPJ() {
  const pjs = listPJs();
  const state = db.distribution;
  const pj = STRATEGIES[config.distributionStrategy](pjs, state);
  db.saveDistribution(state);
  return pj;
}

export function logDistribution(leadId, pjId, metodo) {
  const state = db.distribution;
  state.log.push({ leadId, pjId, at: Date.now(), metodo });
  db.saveDistribution(state);
}

export function distributionLog() {
  return [...db.distribution.log].sort((a, b) => b.at - a.at);
}
