import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { conversationScope, leadScope } from '../leads/scope';
import { getAIProvider } from '../ai/providers';
import { buildLeadFacts, getMemory, missingSlots } from '../ai/memory/memory.service';
import { searchKnowledge } from '../knowledge-base/knowledge.service';
import { getOrgSettings } from '../organizations/settings';
import { supervise } from '../ai/supervisor/supervisor';
import { assertFlag } from '../organizations/flags.service';
import { INTENT_LABELS, SIGNAL_LABELS } from '../lead-intelligence/signal-detector';
import { NBA_ACTIONS } from '../lead-intelligence/nba-engine';
import type { ChatTurn } from '../ai/providers/types';

// CONSULTANT COPILOT + BATTLECARD — tudo derivado dos dados do lead/conversa.
// Sugestões NUNCA são enviadas automaticamente: o consultor revisa e decide.

/** Battlecard: painel contextual da conversa (cliente, temperatura, objetivo, objeção, intenção, IA sugere). */
export async function battlecard(ctx: Ctx, conversationId: string) {
  assertCan(ctx, 'conversation.read');
  const conv = await db.conversation.findFirst({
    where: { ...conversationScope(ctx), id: conversationId },
    include: { lead: { include: { memory: true, consultant: { select: { name: true } }, opportunities: { where: { status: 'OPEN' }, include: { stage: { select: { name: true } } }, take: 1 } } } },
  });
  if (!conv) throw NotFound('Conversa');
  const lead = conv.lead;
  const [intent, signals, nba, summary] = await Promise.all([
    db.intentEvent.findFirst({ where: { leadId: lead.id, type: { notIn: ['QUESTION', 'OBJECTION'] } }, orderBy: { createdAt: 'desc' } }),
    db.buyingSignal.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'desc' }, take: 20, distinct: ['type'] }),
    db.nextBestAction.findFirst({ where: { leadId: lead.id, status: 'OPEN' }, orderBy: { createdAt: 'desc' } }),
    db.conversationSummary.findFirst({ where: { conversationId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const objections = [...new Set([...(lead.memory?.objections ?? [])])];
  // Pontos de conversa: próxima ação + material aprovado para a principal objeção.
  const talkingPoints: { text: string; source: string }[] = [];
  if (nba) talkingPoints.push({ text: `${NBA_ACTIONS[nba.action as keyof typeof NBA_ACTIONS] ?? nba.action}: ${nba.reason}`, source: 'Next Best Action (regra)' });
  if (objections[0]) {
    const kb = await searchKnowledge(ctx.orgId, objections[0], { topK: 1, product: lead.product });
    if (kb[0]) talkingPoints.push({ text: `Tratar objeção "${objections[0]}" com: ${kb[0].title}`, source: `Knowledge Base · ${kb[0].title}` });
    else talkingPoints.push({ text: `Tratar objeção "${objections[0]}" — não há material aprovado na base (registre uma resposta).`, source: 'Knowledge Base' });
  }
  if (!lead.desiredValue || !lead.product) talkingPoints.push({ text: `Confirmar ${[!lead.product && 'produto', !lead.desiredValue && 'valor de crédito'].filter(Boolean).join(' e ')}`, source: 'Dados faltantes' });
  if (signals.some((s) => s.type === 'simulation_requested') && lead.product) talkingPoints.push({ text: 'Apresentar a simulação com os valores que o cliente informou', source: 'Sinal: pediu simulação' });
  return {
    lead: { id: lead.id, name: lead.name, temperature: lead.temperature, score: lead.score, product: lead.product, objective: lead.objective, desiredValue: lead.desiredValue, city: lead.city, term: lead.term, consultant: lead.consultant?.name ?? null, optOut: lead.optOut },
    subScores: { fit: lead.fitScore, intent: lead.intentScore, engagement: lead.engagementScore, behavior: lead.behaviorScore, recency: lead.recencyScore },
    intent: intent ? { type: intent.type, label: INTENT_LABELS[intent.type as keyof typeof INTENT_LABELS] ?? intent.type, evidence: intent.evidence, confidence: intent.confidence } : null,
    objections,
    signals: signals.map((s) => ({ type: s.type, label: SIGNAL_LABELS[s.type as keyof typeof SIGNAL_LABELS] ?? s.type, at: s.createdAt })),
    opportunity: lead.opportunities[0] ? { id: lead.opportunities[0].id, code: lead.opportunities[0].code, stage: lead.opportunities[0].stage.name, value: lead.opportunities[0].value, health: lead.opportunities[0].health } : null,
    nextBestAction: nba,
    summary: summary?.content ?? lead.aiSummary ?? null,
    talkingPoints,
    method: 'Derivado de dados do lead, conversa, sinais (regras) e Knowledge Base aprovada.',
  };
}

async function history(conversationId: string): Promise<ChatTurn[]> {
  const msgs = await db.message.findMany({ where: { conversationId, senderType: { not: 'SYSTEM' } }, orderBy: { createdAt: 'desc' }, take: 20 });
  return msgs.reverse().map((m) => ({ role: m.senderType === 'LEAD' ? 'lead' : m.senderType === 'HUMAN' ? 'human' : 'assistant', content: m.content }));
}

/** Copilot na conversa/oportunidade. */
export async function copilot(ctx: Ctx, leadId: string, action: 'SUMMARIZE' | 'SUGGEST_REPLY' | 'ANALYZE_OBJECTION' | 'NEXT_ACTION' | 'ANALYZE_OPPORTUNITY') {
  assertCan(ctx, 'conversation.read');
  await assertFlag(ctx.orgId, 'AI_COPILOT');
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: leadId } });
  if (!lead) throw NotFound('Lead');
  const conv = await db.conversation.findFirst({ where: { leadId, organizationId: ctx.orgId }, orderBy: { lastMessageAt: 'desc' } });
  const memory = await getMemory(ctx.orgId, leadId);
  const facts = buildLeadFacts(lead, memory);
  const ai = getAIProvider();
  const settings = await getOrgSettings(ctx.orgId);

  switch (action) {
    case 'SUMMARIZE': {
      const h = conv ? await history(conv.id) : [];
      const text = await ai.summarize({ lead: facts, history: h });
      return { action, title: 'Resumo', content: text, sources: [], requiresApproval: false };
    }
    case 'SUGGEST_REPLY': {
      const h = conv ? await history(conv.id) : [];
      const lastLead = [...h].reverse().find((t) => t.role === 'lead')?.content ?? null;
      const knowledge = await searchKnowledge(ctx.orgId, lastLead ?? `${facts.product ?? ''} consórcio`, { topK: settings.ai.knowledge.topK, product: facts.product });
      const out = await ai.generateTurn({ agentKey: 'QUALIFICATION', instructions: 'Você é o COPILOT do consultor humano: escreva uma sugestão de resposta curta, que o CONSULTOR vai revisar e enviar em nome próprio. Não se apresente como assistente virtual.', playbook: null, personality: settings.ai.personality, disclosure: '', forbiddenTopics: settings.ai.rules.forbiddenTopics, isFirstTurn: false, lead: facts, missingSlots: missingSlots(facts, 'QUALIFICATION'), history: h.slice(0, -1), userMessage: lastLead, knowledge, minRelevance: settings.ai.knowledge.minRelevance });
      const verdict = supervise({ reply: out.reply, knowledge, lead: facts, userMessage: lastLead, forbiddenTopics: settings.ai.rules.forbiddenTopics, isFirstTurn: false, disclosure: '', maxChars: settings.ai.rules.maxMessageChars });
      return { action, title: 'Sugestão de resposta (revise antes de enviar)', content: verdict.finalReply, sources: knowledge.map((k) => k.title), supervisor: verdict.action, requiresApproval: true };
    }
    case 'ANALYZE_OBJECTION': {
      const objections = memory?.objections ?? [];
      const intents = await db.intentEvent.findMany({ where: { leadId, type: 'OBJECTION' }, orderBy: { createdAt: 'desc' }, take: 5 });
      if (!objections.length && !intents.length) return { action, title: 'Objeções', content: 'Nenhuma objeção registrada nas conversas deste lead.', sources: [], requiresApproval: false };
      const main = objections[0] ?? intents[0].evidence.split(':')[0];
      const kb = await searchKnowledge(ctx.orgId, `${main} objeção como responder`, { topK: 2, product: lead.product });
      const lines = [`Principal objeção: ${main}`, ...intents.slice(0, 3).map((i) => `• "${i.evidence}"`), kb.length ? `Material aprovado: ${kb.map((k) => k.title).join('; ')}` : 'Sem material aprovado na Knowledge Base para essa objeção.'];
      return { action, title: 'Análise de objeção', content: lines.join('\n'), sources: kb.map((k) => k.title), requiresApproval: false };
    }
    case 'NEXT_ACTION': {
      const { refreshLeadIntelligence } = await import('../lead-intelligence/intelligence-v2.service');
      const r = await refreshLeadIntelligence(ctx.orgId, leadId);
      const top = r?.recommendations ?? [];
      return { action, title: 'Próximas ações (sinal por regra)', content: top.map((t) => `${t.priority} · ${t.label} — ${t.reason}`).join('\n') || 'Nada pendente.', sources: [], requiresApproval: false, recommendations: top };
    }
    case 'ANALYZE_OPPORTUNITY': {
      const opp = await db.opportunity.findFirst({ where: { leadId, status: 'OPEN', organizationId: ctx.orgId }, orderBy: { updatedAt: 'desc' } });
      if (!opp) return { action, title: 'Oportunidade', content: 'Este lead não tem oportunidade aberta.', sources: [], requiresApproval: false };
      const { getOpportunityIntelligence } = await import('../opportunities/opportunity-intelligence.service');
      const h = await getOpportunityIntelligence(ctx, opp.id);
      return { action, title: `Oportunidade #${opp.code}`, content: h ? [`Saúde: ${h.health} (${h.score}/100)`, `Na etapa há ${h.stageAgeDays} dia(s) · sem atividade há ${h.idleDays} dia(s)`, `Follow-up: ${h.followUpStatus}`, ...h.reasons.map((r) => `• ${r}`)].join('\n') : 'Oportunidade encerrada.', sources: [], requiresApproval: false };
    }
  }
}
