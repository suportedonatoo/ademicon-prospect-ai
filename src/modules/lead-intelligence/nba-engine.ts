// NEXT BEST ACTION ENGINE — responde "o que deve ser feito AGORA?" (motor puro, sem banco).
// Regras ordenadas por urgência; a primeira que se aplica vira a ação principal e as demais
// ficam como alternativas. Cada recomendação lista SOMENTE sinais reais que a justificaram.
// Método = RULE (sinal por regra), nunca apresentado como previsão de IA.

export const NBA_ACTIONS = {
  CONTACT_NOW: 'Contatar agora',
  CALL: 'Ligar para o cliente',
  SEND_WHATSAPP: 'Responder pelo WhatsApp',
  SEND_SIMULATION: 'Enviar simulação',
  FOLLOW_UP: 'Fazer follow-up',
  TRANSFER_TO_SPECIALIST: 'Transferir para especialista',
  TRANSFER_TO_CONSULTANT: 'Distribuir para consultor',
  CREATE_TASK: 'Criar tarefa de acompanhamento',
  WAIT: 'Aguardar',
  REACTIVATE: 'Reativar contato',
  NURTURE: 'Manter em nutrição',
  CLOSE: 'Encerrar / marcar como perdido',
} as const;
export type NbaAction = keyof typeof NBA_ACTIONS;
export type NbaPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface NbaInput {
  lead: {
    status: string;
    temperature: string;
    intent: string | null;
    consultantId: string | null;
    optOut: boolean;
    consentStatus: string;
    product: string | null;
    desiredValue: number | null;
    city: string | null;
    preferredChannel: string | null;
    lifecycle: string;
    signals: { requestedContact?: boolean; simulationStarted?: boolean } | null;
  };
  priorityIndex: number;
  /** Minutos desde a última mensagem do cliente que ainda não foi respondida (null = nada pendente). */
  awaitingReplyMinutes: number | null;
  conversationMode: string | null;
  lastContactHoursAgo: number | null;
  hasOpenOpportunity: boolean;
  opportunityHealth: string | null;
  opportunityStageKey: string | null;
  openTasks: number;
  overdueTasks: number;
  simulationSent: boolean;
  recentIntents: string[]; // tipos de IntentEvent dos últimos 14 dias
  recentSignals: string[]; // tipos de BuyingSignal dos últimos 14 dias
  objections: string[];
  /** Silêncio do cliente (preferência de comunicação): horas 0–23 */
  leadQuietHours?: { start: number; end: number } | null;
  consultantCapacity?: 'NORMAL' | 'ALTA' | 'CRITICA' | 'INDISPONIVEL' | null;
}

export interface NbaSignal {
  key: string;
  label: string;
}

export interface NbaRecommendation {
  action: NbaAction;
  label: string;
  priority: NbaPriority;
  reason: string;
  signals: NbaSignal[];
  confidence: number;
  ownerType: 'CONSULTANT' | 'PJ_MANAGER' | 'AI' | null;
  recommendedAt: Date | null;
  validUntil: Date;
  method: 'RULE';
}

const H = 3_600_000;

/** Próximo horário fora do silêncio do cliente (null = pode agora). */
export function nextAllowedTime(now: Date, quiet?: { start: number; end: number } | null): Date | null {
  if (!quiet) return null;
  const h = now.getHours();
  const inQuiet = quiet.start > quiet.end ? h >= quiet.start || h < quiet.end : h >= quiet.start && h < quiet.end;
  if (!inQuiet) return null;
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  if (h >= quiet.end) next.setDate(next.getDate() + 1);
  next.setHours(quiet.end);
  return next;
}

export function recommend(input: NbaInput, now = new Date()): NbaRecommendation[] {
  const { lead } = input;
  const recs: NbaRecommendation[] = [];
  const sig = (key: string, label: string): NbaSignal => ({ key, label });
  const push = (action: NbaAction, priority: NbaPriority, reason: string, signals: NbaSignal[], confidence: number, validHours: number, ownerType: NbaRecommendation['ownerType'] = 'CONSULTANT', respectQuiet = true) =>
    recs.push({
      action,
      label: NBA_ACTIONS[action],
      priority,
      reason,
      signals,
      confidence: Math.round(Math.min(0.95, confidence + Math.min(0.1, (signals.length - 1) * 0.03)) * 100) / 100,
      ownerType,
      recommendedAt: respectQuiet ? nextAllowedTime(now, input.leadQuietHours) : null,
      validUntil: new Date(now.getTime() + validHours * H),
      method: 'RULE',
    });

  const intents = new Set(input.recentIntents);
  const signals = new Set(input.recentSignals);
  const s = lead.signals ?? {};

  // Encerrados
  if (lead.status === 'CONVERTED') return [];
  if (lead.status === 'BLOCKED') return [];
  if (lead.optOut) {
    push('WAIT', 'LOW', 'O titular pediu para não receber contato. Só atender se ele voltar a falar.', [sig('opt_out', 'Opt-out registrado')], 0.95, 24 * 30, null, false);
    return recs;
  }
  if (lead.status === 'LOST') {
    if (intents.has('RENEWED_INTEREST') || signals.has('returned_to_site') || signals.has('simulation_requested')) {
      push('REACTIVATE', 'HIGH', 'Lead perdido voltou a demonstrar interesse — retomar com o contexto anterior.', [...(intents.has('RENEWED_INTEREST') ? [sig('RENEWED_INTEREST', 'Interesse renovado')] : []), ...(signals.has('returned_to_site') ? [sig('returned_to_site', 'Voltou ao site')] : []), ...(signals.has('simulation_requested') ? [sig('simulation_requested', 'Nova simulação')] : [])], 0.7, 48);
    }
    return recs;
  }

  // 1) Cliente esperando resposta
  if (input.awaitingReplyMinutes != null && input.awaitingReplyMinutes >= 5 && input.conversationMode === 'HUMAN') {
    push('SEND_WHATSAPP', input.awaitingReplyMinutes >= 15 ? 'CRITICAL' : 'HIGH', `O cliente aguarda resposta há ${Math.round(input.awaitingReplyMinutes)} min (atendimento humano ativo).`, [sig('awaiting_reply', `Aguardando há ${Math.round(input.awaitingReplyMinutes)} min`), sig('mode_human', 'Conversa com consultor')], 0.9, 2, 'CONSULTANT', false);
  }

  // 2) Pediu contato / ligação
  const askedCall = intents.has('CALL_REQUEST');
  const askedContact = s.requestedContact || intents.has('CONTACT_REQUEST') || signals.has('requested_contact');
  if ((askedCall || askedContact) && (input.lastContactHoursAgo == null || input.lastContactHoursAgo > 1)) {
    const sigs = [...(askedCall ? [sig('CALL_REQUEST', 'Pediu ligação')] : []), ...(askedContact ? [sig('requested_contact', 'Pediu contato')] : []), ...(lead.temperature === 'QUENTE' ? [sig('temperature', 'Lead quente')] : [])];
    const action: NbaAction = askedCall || lead.preferredChannel === 'PHONE' ? 'CALL' : 'CONTACT_NOW';
    push(action, lead.temperature === 'QUENTE' ? 'CRITICAL' : 'HIGH', askedCall ? 'O cliente pediu uma ligação.' : 'O cliente pediu para falar com um consultor.', sigs, 0.85, 4);
  }

  // 3) Sem responsável
  if (!lead.consultantId && (lead.temperature === 'MORNO' || lead.temperature === 'QUENTE')) {
    push('TRANSFER_TO_CONSULTANT', lead.temperature === 'QUENTE' ? 'CRITICAL' : 'HIGH', `Lead ${lead.temperature.toLowerCase()} ainda sem consultor responsável.`, [sig('temperature', `Temperatura ${lead.temperature}`), sig('no_owner', 'Sem responsável')], 0.9, 2, 'PJ_MANAGER', false);
  }

  // 4) Especialista
  if (intents.has('SPECIALIST_NEEDED')) push('TRANSFER_TO_SPECIALIST', 'HIGH', 'A conversa indica um caso que pede especialista (empresa, frota, imóvel comercial…).', [sig('SPECIALIST_NEEDED', 'Precisa de especialista')], 0.7, 24);

  // 5) Simulação pedida e ainda não enviada
  const wantsSim = intents.has('SIMULATION_REQUEST') || signals.has('simulation_requested') || s.simulationStarted;
  if (wantsSim && !input.simulationSent && lead.product) {
    const sigs = [sig('simulation_requested', 'Pediu/fez simulação'), ...(signals.has('price_question') ? [sig('price_question', 'Perguntou valores')] : []), ...(input.priorityIndex >= 60 ? [sig('priority', `Índice de prioridade ${input.priorityIndex}`)] : [])];
    push('SEND_SIMULATION', input.priorityIndex >= 60 ? 'HIGH' : 'MEDIUM', 'Enviar simulação personalizada com os dados que o cliente já informou.', sigs, 0.8, 24);
  }

  // 6) Oportunidade parada
  if (input.hasOpenOpportunity && (input.opportunityHealth === 'STALLED' || input.opportunityHealth === 'AT_RISK')) {
    const stalled = input.opportunityHealth === 'STALLED';
    push('FOLLOW_UP', stalled ? 'HIGH' : 'MEDIUM', stalled ? `Oportunidade parada${input.opportunityStageKey ? ` na etapa ${input.opportunityStageKey}` : ''} — retomar contato.` : 'Oportunidade em risco — agendar próximo passo.', [sig('opportunity_health', stalled ? 'Oportunidade parada' : 'Oportunidade em risco'), ...(input.overdueTasks ? [sig('overdue', `${input.overdueTasks} tarefa(s) atrasada(s)`)] : [])], 0.75, 24);
  }

  // 7) Desistência sinalizada
  if (intents.has('DROPOUT') && !recs.some((r) => r.priority === 'CRITICAL')) {
    push('CLOSE', 'MEDIUM', 'O cliente sinalizou desistência — confirmar e registrar o motivo da perda (não insistir).', [sig('DROPOUT', 'Sinal de desistência')], 0.7, 72);
  }

  // 8) Decaimento
  if (lead.lifecycle === 'REACTIVATION') {
    push('REACTIVATE', lead.consentStatus === 'GRANTED' ? 'MEDIUM' : 'LOW', lead.consentStatus === 'GRANTED' ? 'Lead inativo há muito tempo — retomar com o contexto do último interesse.' : 'Lead inativo; sem consentimento para mensagem ativa — criar tarefa de contato consultivo.', [sig('lifecycle', 'Inativo (reativação)')], 0.6, 72);
  } else if (lead.lifecycle === 'NURTURE' || lead.temperature === 'FRIO') {
    if (!recs.length) push('NURTURE', 'LOW', lead.lifecycle === 'NURTURE' ? 'Sem interação recente — manter em nutrição.' : 'Lead frio — priorize os qualificados; manter em nutrição.', [sig(lead.lifecycle === 'NURTURE' ? 'lifecycle' : 'temperature', lead.lifecycle === 'NURTURE' ? 'Em nutrição' : 'Lead frio')], 0.6, 24 * 7, 'AI');
  }

  // 9) Follow-up por tempo sem contato
  if (lead.consultantId && input.lastContactHoursAgo != null && input.lastContactHoursAgo >= 72 && lead.lifecycle === 'ACTIVE' && !recs.some((r) => r.action === 'FOLLOW_UP')) {
    push('FOLLOW_UP', lead.temperature === 'QUENTE' ? 'HIGH' : 'MEDIUM', `Sem contato há ${Math.round(input.lastContactHoursAgo / 24)} dia(s).`, [sig('no_contact', `Sem contato há ${Math.round(input.lastContactHoursAgo / 24)}d`)], 0.7, 24);
  }

  // 10) Nenhuma tarefa aberta
  if (lead.consultantId && !input.openTasks && ['ASSIGNED', 'IN_CONVERSATION', 'OPPORTUNITY', 'QUALIFIED'].includes(lead.status)) {
    push('CREATE_TASK', 'LOW', 'Nenhuma tarefa aberta para este lead — registre o próximo passo.', [sig('no_task', 'Sem tarefa aberta')], 0.65, 48);
  }

  if (!recs.length) push('WAIT', 'LOW', 'Nada pendente agora — aguardar a próxima interação do cliente.', [sig('nothing_pending', 'Sem pendências')], 0.5, 24, null, false);

  const order: Record<NbaPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return recs.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 4);
}
