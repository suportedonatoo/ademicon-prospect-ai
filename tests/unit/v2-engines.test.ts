import { describe, expect, it } from 'vitest';
import { computeSubScores, lifecycleFor, mergeIntelligenceConfig, recencyScore } from '@/modules/lead-intelligence/subscores';
import { detectIntents, signalFromTracking, signalsFromMessage } from '@/modules/lead-intelligence/signal-detector';
import { nextAllowedTime, recommend, type NbaInput } from '@/modules/lead-intelligence/nba-engine';
import { assessOpportunity, classifyLoss } from '@/modules/opportunities/health-engine';
import { assessCapacity, withinWorkingHours } from '@/modules/consultants/capacity-engine';
import { compareLeads, nameSimilarity } from '@/modules/leads/match-engine';
import { isQuietNow, quietEndsAt } from '@/modules/notifications/quiet-hours';
import { advance, selectPlaybook, type PlaybookStep } from '@/modules/playbooks/playbook-engine';
import { classifyRecovery } from '@/modules/recovery/recovery-engine';

const now = new Date('2026-09-30T15:00:00-03:00');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('Lead Intelligence — sub-scores e decaimento', () => {
  it('lead completo, engajado e recente tem índice alto; tudo é explicado por fatores', () => {
    const r = computeSubScores(
      {
        product: 'IMOVEL', desiredValue: 400000, city: 'Jundiaí', cityServed: true, objective: 'Casa própria', term: 'Até 3 meses', phone: '5511999990000', email: 'a@b.com', intent: 'HIGH',
        signals: { requestedContact: true, simulationStarted: true, repliedBot: true }, inboundMessages: 5, outboundMessages: 5,
        buyingSignals: [{ type: 'simulation_requested', confidence: 1 }, { type: 'price_question', confidence: 0.8 }], intentEvents: [{ type: 'URGENCY', confidence: 0.8 }],
        lastInteractionAt: now, createdAt: daysAgo(2),
      },
      undefined,
      now
    );
    expect(r.fit).toBe(100);
    expect(r.intent).toBe(100);
    expect(r.recency).toBe(100);
    expect(r.priorityIndex).toBeGreaterThanOrEqual(80);
    expect(r.lifecycle).toBe('ACTIVE');
    expect(r.factors.every((f) => f.label && typeof f.points === 'number')).toBe(true);
    expect(r.method).toBe('RULE');
  });

  it('decaimento: recência cai por degraus e o ciclo muda para nutrição/reativação', () => {
    expect(recencyScore(0.5)).toBe(100);
    expect(recencyScore(5)).toBe(80);
    expect(recencyScore(20)).toBe(35);
    expect(recencyScore(90)).toBe(0);
    expect(lifecycleFor(10)).toBe('ACTIVE');
    expect(lifecycleFor(35)).toBe('NURTURE');
    expect(lifecycleFor(70)).toBe('REACTIVATION');
    const old = computeSubScores({ product: 'IMOVEL', createdAt: daysAgo(80), lastInteractionAt: daysAgo(75) }, undefined, now);
    expect(old.lifecycle).toBe('REACTIVATION');
    expect(old.recency).toBe(0);
  });

  it('opt-out zera intenção, engajamento e prioridade', () => {
    const r = computeSubScores({ intent: 'HIGH', optOut: true, inboundMessages: 9, createdAt: now }, undefined, now);
    expect(r.priorityIndex).toBe(0);
    expect(r.intent).toBe(0);
  });

  it('configuração inválida cai no padrão (pesos e degraus)', () => {
    const c = mergeIntelligenceConfig({ weights: { fit: -1 } as never, decay: { steps: [30, 10, 5, 1], nurtureDays: 0, reactivationDays: 1 } as never });
    expect(c.weights.fit).toBe(0.25);
    expect(c.decay.steps).toEqual([7, 14, 30, 60]);
    expect(c.decay.reactivationDays).toBeGreaterThan(c.decay.nurtureDays);
  });
});

describe('Detecção de intenção e sinais de compra', () => {
  it('detecta pedido de ligação, urgência e interesse financeiro com evidência', () => {
    const r = detectIntents('Preciso logo, me liga hoje? quanto fica a parcela de 300 mil?');
    const types = r.map((x) => x.type);
    expect(types).toEqual(expect.arrayContaining(['URGENCY', 'CALL_REQUEST', 'FINANCIAL_INTEREST', 'QUESTION']));
    expect(r.find((x) => x.type === 'CALL_REQUEST')!.evidence).toMatch(/me liga/i);
  });
  it('detecta desistência, comparação e especialista', () => {
    expect(detectIntents('desisti, vou fazer financiamento do banco').map((x) => x.type)).toEqual(expect.arrayContaining(['DROPOUT', 'COMPARISON']));
    expect(detectIntents('é para a minha empresa, uma frota de caminhões').map((x) => x.type)).toContain('SPECIALIST_NEEDED');
  });
  it('mensagem neutra não gera intenção inventada', () => {
    expect(detectIntents('ok, obrigado')).toEqual([]);
  });
  it('sinais de compra por mensagem e por rastreamento', () => {
    expect(signalsFromMessage('qual a taxa de administração?', { firstReply: true }).map((s) => s.type)).toEqual(expect.arrayContaining(['replied', 'price_question']));
    expect(signalFromTracking('WHATSAPP_CLICK')?.type).toBe('whatsapp_clicked');
    expect(signalFromTracking('PAGE_VIEW', { sessionsBefore: 0 })).toBeNull();
    expect(signalFromTracking('PAGE_VIEW', { sessionsBefore: 2 })?.type).toBe('returned_to_site');
  });
});

const baseNba = (over: Partial<NbaInput> = {}, lead: Partial<NbaInput['lead']> = {}): NbaInput => ({
  lead: { status: 'ASSIGNED', temperature: 'MORNO', intent: 'MEDIUM', consultantId: 'c1', optOut: false, consentStatus: 'GRANTED', product: 'IMOVEL', desiredValue: 300000, city: 'Jundiaí', preferredChannel: null, lifecycle: 'ACTIVE', signals: {}, ...lead },
  priorityIndex: 55,
  awaitingReplyMinutes: null,
  conversationMode: 'AI',
  lastContactHoursAgo: 2,
  hasOpenOpportunity: false,
  opportunityHealth: null,
  opportunityStageKey: null,
  openTasks: 1,
  overdueTasks: 0,
  simulationSent: false,
  recentIntents: [],
  recentSignals: [],
  objections: [],
  ...over,
});

describe('Next Best Action', () => {
  it('cliente esperando resposta com humano → responder agora (crítico)', () => {
    const [top] = recommend(baseNba({ awaitingReplyMinutes: 22, conversationMode: 'HUMAN' }), now);
    expect(top.action).toBe('SEND_WHATSAPP');
    expect(top.priority).toBe('CRITICAL');
    expect(top.signals.map((s) => s.key)).toContain('awaiting_reply');
    expect(top.validUntil.getTime()).toBeGreaterThan(now.getTime());
  });
  it('pediu simulação e ainda não recebeu → enviar simulação, com motivos reais', () => {
    const recs = recommend(baseNba({ recentIntents: ['SIMULATION_REQUEST'], recentSignals: ['price_question'], priorityIndex: 70 }), now);
    const sim = recs.find((r) => r.action === 'SEND_SIMULATION')!;
    expect(sim.priority).toBe('HIGH');
    expect(sim.signals.map((s) => s.key)).toEqual(['simulation_requested', 'price_question', 'priority']);
  });
  it('quente sem consultor → distribuir (crítico, dono = gestor)', () => {
    const [top] = recommend(baseNba({}, { consultantId: null, temperature: 'QUENTE' }), now);
    expect(top.action).toBe('TRANSFER_TO_CONSULTANT');
    expect(top.ownerType).toBe('PJ_MANAGER');
  });
  it('opt-out → aguardar, nunca contato ativo', () => {
    const recs = recommend(baseNba({ recentIntents: ['CALL_REQUEST'] }, { optOut: true }), now);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toBe('WAIT');
  });
  it('perdido que voltou ao site → reativar; convertido → nada', () => {
    expect(recommend(baseNba({ recentSignals: ['returned_to_site'] }, { status: 'LOST' }), now)[0].action).toBe('REACTIVATE');
    expect(recommend(baseNba({}, { status: 'CONVERTED' }), now)).toEqual([]);
  });
  it('respeita o horário de silêncio do cliente ao sugerir o melhor horário', () => {
    const night = new Date(2026, 8, 30, 22, 30);
    const next = nextAllowedTime(night, { start: 21, end: 8 })!;
    expect(next.getHours()).toBe(8);
    expect(next.getDate()).toBe(1);
    expect(nextAllowedTime(new Date(2026, 8, 30, 10), { start: 21, end: 8 })).toBeNull();
  });
});

describe('Opportunity Intelligence', () => {
  const base = { status: 'OPEN', stageKey: 'PROPOSTA', stageOrder: 7, createdAt: daysAgo(30), openTasks: 1, overdueTasks: 0, leadTemperature: 'QUENTE', awaitingReply: false };
  it('saudável quando há atividade recente e dentro do prazo da etapa', () => {
    const r = assessOpportunity({ ...base, stageChangedAt: daysAgo(2), lastActivityAt: daysAgo(1) }, undefined, now)!;
    expect(r.health).toBe('HEALTHY');
    expect(r.followUpStatus).toBe('OK');
  });
  it('parada quando fica sem atividade além do limite', () => {
    const r = assessOpportunity({ ...base, stageChangedAt: daysAgo(20), lastActivityAt: daysAgo(16), openTasks: 0 }, undefined, now)!;
    expect(r.health).toBe('STALLED');
    expect(r.reasons.join(' ')).toMatch(/Sem atividade há 16 dias/);
  });
  it('em risco com tarefas atrasadas e sem próximo passo', () => {
    const r = assessOpportunity({ ...base, stageChangedAt: daysAgo(9), lastActivityAt: daysAgo(8), overdueTasks: 1, openTasks: 1 }, undefined, now)!;
    expect(r.health).toBe('AT_RISK');
  });
  it('fechada não é avaliada; motivo de perda é classificado', () => {
    expect(assessOpportunity({ ...base, status: 'WON', stageChangedAt: now, lastActivityAt: now }, undefined, now)).toBeNull();
    expect(classifyLoss('Fechou com outra administradora')).toBe('CONCORRENTE');
    expect(classifyLoss('parcela muito cara')).toBe('PRECO');
    expect(classifyLoss('não respondeu mais')).toBe('SEM_CONTATO');
  });
});

describe('Capacity Intelligence', () => {
  it('estados NORMAL / ALTA / CRÍTICA / INDISPONÍVEL', () => {
    const c = { maxOpenLeads: 10, maxOpenOpportunities: 10, activeOpportunities: 0, available: true, active: true };
    expect(assessCapacity({ ...c, activeLeads: 5 }).state).toBe('NORMAL');
    expect(assessCapacity({ ...c, activeLeads: 8 }).state).toBe('ALTA');
    expect(assessCapacity({ ...c, activeLeads: 10 }).state).toBe('CRITICA');
    expect(assessCapacity({ ...c, activeLeads: 1, available: false }).state).toBe('INDISPONIVEL');
  });
  it('horário de trabalho', () => {
    const wh = { days: [1, 2, 3, 4, 5], start: 8, end: 18 };
    expect(withinWorkingHours(wh, new Date(2026, 8, 30, 10))).toBe(true); // quarta 10h
    expect(withinWorkingHours(wh, new Date(2026, 8, 30, 20))).toBe(false);
    expect(withinWorkingHours(wh, new Date(2026, 9, 4, 10))).toBe(false); // domingo
  });
});

describe('Duplicidade avançada', () => {
  const lead = (o: Partial<Parameters<typeof compareLeads>[0]>) => ({ id: 'x', name: 'Maria Souza', phone: null, email: null, cnpj: null, company: null, city: 'Jundiaí', source: 'LANDING', ...o });
  it('identidade igual = exata', () => {
    expect(compareLeads(lead({ phone: '5511999990000' }), lead({ phone: '5511999990000' })).level).toBe('MATCH_EXACT');
  });
  it('mesmo final de telefone + nome parecido = alta; nunca exata', () => {
    const r = compareLeads(lead({ name: 'Maria Aparecida Souza', phone: '5511999990000' }), lead({ name: 'Maria A. Souza', phone: '551199990000' }));
    expect(r.level).toBe('MATCH_HIGH');
    expect(r.score).toBeLessThan(100);
  });
  it('só nome parecido + cidade = baixa/média; nomes diferentes = sem correspondência', () => {
    expect(['MATCH_LOW', 'MATCH_MEDIUM']).toContain(compareLeads(lead({ name: 'Joao da Silva' }), lead({ name: 'João Silva' })).level);
    expect(compareLeads(lead({ name: 'Carlos Pereira' }), lead({ name: 'Ana Lima' })).level).toBe('NO_MATCH');
    expect(nameSimilarity('Sr. José Carlos', 'jose carlos')).toBeGreaterThan(0.95);
    // mesmo primeiro nome e sobrenomes diferentes na mesma cidade não é a mesma pessoa
    expect(compareLeads(lead({ name: 'Maria Silva' }), lead({ name: 'Maria Souza' })).level).toBe('NO_MATCH');
    expect(compareLeads(lead({ name: 'Ana Paula Ribeiro' }), lead({ name: 'Ana Paula Rocha' })).level).toBe('NO_MATCH');
  });
});

describe('Horário de silêncio (notificações)', () => {
  it('janela que atravessa a meia-noite', () => {
    const at = (h: number, m = 0) => new Date(`2026-09-30T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`);
    expect(isQuietNow(at(23), '22:00', '07:00', 'America/Sao_Paulo')).toBe(true);
    expect(isQuietNow(at(6, 59), '22:00', '07:00', 'America/Sao_Paulo')).toBe(true);
    expect(isQuietNow(at(12), '22:00', '07:00', 'America/Sao_Paulo')).toBe(false);
    const end = quietEndsAt(at(23), '22:00', '07:00', 'America/Sao_Paulo')!;
    expect((end.getTime() - at(23).getTime()) / 3_600_000).toBe(8);
  });
});

describe('Playbooks', () => {
  const steps: PlaybookStep[] = [
    { type: 'ACTION', action: 'notify_consultant', params: {} },
    { type: 'WAIT', minutes: 15 },
    { type: 'CONDITION', condition: { field: 'lead.status', op: 'eq', value: 'ASSIGNED' }, onFalse: 'STOP' },
    { type: 'ACTION', action: 'notify_role', params: { roles: ['MANAGER'] } },
  ];
  const facts = { temperature: 'QUENTE', product: 'IMOVEL', source: 'LANDING', pjId: 'p', consultantId: 'c', campaignId: null, status: 'ASSIGNED', intent: 'HIGH' };
  it('executa até a espera, depois continua se a condição seguir verdadeira', () => {
    const a = advance(steps, 0, facts, now);
    expect(a.actions.map((x) => x.action)).toEqual(['notify_consultant']);
    expect(a.status).toBe('WAITING');
    expect(a.nextRunAt!.getTime() - now.getTime()).toBe(15 * 60_000);
    const b = advance(steps, a.nextIndex, facts, now);
    expect(b.actions.map((x) => x.action)).toEqual(['notify_role']);
    expect(b.status).toBe('COMPLETED');
  });
  it('condição falsa interrompe (consultor já atendeu)', () => {
    expect(advance(steps, 2, { ...facts, status: 'IN_CONVERSATION' }, now).status).toBe('CANCELLED');
  });
  it('seleção por segmento: o mais específico/prioritário vence', () => {
    const pbs = [
      { key: 'geral', segment: {}, priority: 100 },
      { key: 'hot', segment: { temperatures: ['QUENTE'] }, priority: 10 },
      { key: 'frio', segment: { temperatures: ['FRIO'] }, priority: 5 },
    ];
    expect(selectPlaybook(pbs, facts)!.key).toBe('hot');
    expect(selectPlaybook(pbs, { ...facts, temperature: 'MORNO' })!.key).toBe('geral');
  });
});

describe('Recovery Center', () => {
  it('filas por motivo e temperatura', () => {
    expect(classifyRecovery({ reason: 'HOT_UNATTENDED', temperature: 'QUENTE', hoursIdle: 1, optOut: false, priorityIndex: 80 })).toBe('NOW');
    expect(classifyRecovery({ reason: 'FORGOTTEN_LEAD', temperature: 'MORNO', hoursIdle: 50, optOut: false, priorityIndex: 40 })).toBe('TODAY');
    expect(classifyRecovery({ reason: 'FORGOTTEN_LEAD', temperature: 'FRIO', hoursIdle: 500, optOut: false, priorityIndex: 10 })).toBe('NURTURE');
    expect(classifyRecovery({ reason: 'REHEATED', temperature: 'QUENTE', hoursIdle: 1, optOut: true, priorityIndex: 90 })).toBe('NONE');
  });
});
