import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { logger } from '@/lib/logger';
import { systemCtx } from '../../auth/context';
import { getOrgSettings } from '../../organizations/settings';
import { searchKnowledge } from '../../knowledge-base/knowledge.service';
import { rescoreLead } from '../../lead-scoring/scoring.service';
import { routeLead } from '../../lead-routing/routing.service';
import { notifyConsultant, notifyRoles } from '../../notifications/notification.service';
import { canContactProactively, deliverMessage } from '../../messaging/messaging.service';
import { getOrCreateConversation } from '../../conversations/conversation.service';
import { recordPrivacyEvent } from '../../privacy/privacy.service';
import { getAIProvider } from '../providers';
import type { AgentKey, AgentTurnOutput, ChatTurn } from '../providers/types';
import { supervise } from '../supervisor/supervisor';
import { buildLeadFacts, getMemory, mergeMemory, missingSlots } from '../memory/memory.service';
import { selectPlaybookKey } from '../agents';
import { extractSlots } from '../nlu';
import { firstName } from '@/lib/normalize';
import { estimateCostMicros } from '../cost';
import { activePromptVersion } from '../prompt-versions.service';
import { assessConfidence } from '../confidence';
import { consultantPersona } from '../consultant-persona';

/**
 * MaestroEngine
 * MESSAGE → MAESTRO → CONTEXT → MEMORY → KNOWLEDGE → BUSINESS RULES → AGENT → SUPERVISOR → RESPONSE
 *
 *  1 receber mensagem · 2 identificar lead · 3 carregar contexto · 4 carregar memória
 *  5 identificar estágio · 6 identificar intenção · 7 selecionar agente · 8 consultar Knowledge Base
 *  9 validar regras · 10 gerar resposta · 11 decidir handoff · 12 registrar resumo
 * 13 atualizar score · 14 registrar evento
 */

export interface MaestroResult {
  conversationId: string;
  reply: string | null;
  agentKey: AgentKey | null;
  handoff: boolean;
  executionId: string | null;
  skipped?: string;
}

function chooseAgent(lead: { temperature: string; signals: unknown; status: string }): AgentKey {
  const s = (lead.signals ?? {}) as { requestedContact?: boolean };
  if (s.requestedContact || lead.temperature === 'MORNO' || lead.temperature === 'QUENTE' || ['QUALIFIED', 'ASSIGNED'].includes(lead.status)) return 'QUALIFICATION';
  return 'PROSPECT';
}

/** Mensagem recebida do lead (WhatsApp/web). Passo 1. */
export async function receiveInboundMessage(orgId: string, conversationId: string, text: string, externalId?: string) {
  const conversation = await db.conversation.findFirstOrThrow({ where: { id: conversationId, organizationId: orgId } });
  // Idempotência também no domínio: mensagem com o mesmo id externo já registrada → não responde de novo.
  if (externalId && (await db.message.findFirst({ where: { conversationId, externalId, direction: 'INBOUND' }, select: { id: true } }))) {
    return { conversationId, reply: null, agentKey: null, handoff: false, executionId: null, skipped: 'Mensagem duplicada' } satisfies MaestroResult;
  }
  const message = await db.message.create({
    data: { organizationId: orgId, conversationId, direction: 'INBOUND', senderType: 'LEAD', content: text.slice(0, 4000), status: 'DELIVERED', externalId },
  });
  const lead = await db.lead.findUniqueOrThrow({ where: { id: conversation.leadId } });
  await db.$transaction([
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
    db.lead.update({
      where: { id: lead.id },
      data: {
        lastInteractionAt: new Date(),
        signals: { ...((lead.signals as object) ?? {}), repliedBot: true },
        ...(['NEW', 'QUALIFIED', 'ASSIGNED'].includes(lead.status) ? { status: 'IN_CONVERSATION' } : {}),
      },
    }),
  ]);
  await publish(orgId, 'conversation.message_received', { conversationId, leadId: lead.id, messageId: message.id });

  if (conversation.mode === 'HUMAN' || conversation.botState === 'PAUSED') {
    if (conversation.assignedConsultantId) {
      await notifyConsultant(orgId, conversation.assignedConsultantId, { type: 'conversation.message', priority: 'HIGH', title: `Nova mensagem de ${lead.name}`, body: text.slice(0, 120), link: `/conversas?c=${conversationId}`, entityType: 'Lead', entityId: lead.id, dedupeKey: `msg:${message.id}` });
    }
    return { conversationId, reply: null, agentKey: null, handoff: false, executionId: null, skipped: 'Consultor ativo — IA pausada' } satisfies MaestroResult;
  }
  return runTurn(orgId, conversationId, text);
}

/** Primeiro contato proativo (somente com opt-in e dentro dos limites). */
export async function startConversation(orgId: string, leadId: string): Promise<MaestroResult | { skipped: string }> {
  const check = await canContactProactively(orgId, leadId);
  if (!check.allowed) return { skipped: check.reason! };
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const agent = chooseAgent(lead);
  const { conversation, created } = await getOrCreateConversation(orgId, leadId, { agent });
  if (!created) return { skipped: 'Conversa já existente' };
  await db.leadActivity.create({
    data: { organizationId: orgId, leadId, type: 'PROACTIVE_CONTACT', description: `Primeiro contato automático (${agent === 'QUALIFICATION' ? 'Qualification' : 'Prospect'} Agent)`, actorType: 'AI' },
  });
  return runTurn(orgId, conversation.id, null);
}

/** Saudação no canal web (chat da landing): o titular abriu o chat, então não é contato proativo. */
export async function startWebGreeting(orgId: string, conversationId: string) {
  return runTurn(orgId, conversationId, null);
}

async function runTurn(orgId: string, conversationId: string, text: string | null): Promise<MaestroResult> {
  const startedAt = Date.now();
  const ai = getAIProvider();
  const settings = await getOrgSettings(orgId);

  // 2–4 · lead, contexto e memória
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 }, lead: true },
  });
  const lead = conversation.lead;
  if (lead.optOut) return { conversationId, reply: null, agentKey: null, handoff: false, executionId: null, skipped: 'Opt-out' };
  // IA do consultor responsável (nome/apresentação/estilo próprios); sem perfil → padrão da organização.
  const owner = conversation.assignedConsultantId ? await db.consultant.findUnique({ where: { id: conversation.assignedConsultantId }, select: { name: true, aiProfile: true } }) : null;
  const persona = owner
    ? consultantPersona(owner.aiProfile, owner.name, { personality: settings.ai.personality, disclosure: settings.ai.rules.disclosure })
    : { personality: settings.ai.personality, disclosure: settings.ai.rules.disclosure, instructions: '' };
  const memory = await getMemory(orgId, lead.id);
  const facts = buildLeadFacts(lead, memory);

  // 5–7 · estágio, intenção e agente
  const agentKey = chooseAgent(lead);
  const preObjections = text ? extractSlots(text).objections ?? [] : [];
  const history: ChatTurn[] = [...conversation.messages]
    .reverse()
    .filter((m) => m.senderType !== 'SYSTEM' && (!text || m.content !== text || m.direction !== 'INBOUND'))
    .map((m) => ({ role: m.senderType === 'LEAD' ? 'lead' : m.senderType === 'HUMAN' ? 'human' : 'assistant', content: m.content }));
  const isFirstTurn = !conversation.messages.some((m) => m.direction === 'OUTBOUND' && m.senderType === 'AI');
  const playbookKey = selectPlaybookKey({ agentKey, isFirstTurn, objections: [...(facts.objections ?? []), ...preObjections], text });

  const [agent, playbook] = await Promise.all([
    db.aIAgent.findFirst({ where: { organizationId: orgId, key: agentKey } }),
    db.aIPlaybook.findFirst({ where: { organizationId: orgId, key: playbookKey, active: true } }),
  ]);
  if (agent && !agent.active) {
    return { conversationId, reply: null, agentKey, handoff: false, executionId: null, skipped: `Agente ${agentKey} inativo` };
  }

  const execution = await db.aIExecution.create({
    data: {
      organizationId: orgId,
      leadId: lead.id,
      conversationId,
      agentKey,
      playbookKey,
      provider: ai.name,
      model: agent?.model || ai.model,
      input: { text, isFirstTurn, missing: missingSlots(facts, agentKey) },
    },
  });
  await publish(orgId, 'ai.execution_started', { executionId: execution.id, leadId: lead.id, conversationId, agentKey });

  try {
    // 8 · Knowledge Base
    const query = [text, preObjections.join(' '), !text ? `${facts.product ?? ''} consórcio como funciona` : ''].filter(Boolean).join(' ');
    const knowledge = await searchKnowledge(orgId, query, { topK: settings.ai.knowledge.topK, product: facts.product });

    // 9–10 · regras de negócio + geração
    const output: AgentTurnOutput = await ai.generateTurn({
      agentKey,
      instructions: [agent?.instructions ?? '', persona.instructions].filter(Boolean).join('\n'),
      playbook: playbook ? { key: playbook.key, name: playbook.name, objective: playbook.objective, rules: playbook.rules, nextAction: playbook.nextAction } : null,
      personality: persona.personality,
      disclosure: persona.disclosure,
      forbiddenTopics: settings.ai.rules.forbiddenTopics,
      isFirstTurn,
      lead: facts,
      missingSlots: missingSlots(facts, agentKey),
      history,
      userMessage: text,
      knowledge,
      minRelevance: settings.ai.knowledge.minRelevance,
      model: agent?.model,
      temperature: agent?.temperature,
    });

    // Supervisor
    const verdict = supervise({
      reply: output.reply,
      knowledge,
      // valores informados nesta mesma mensagem também são fatos válidos (não são "inventados")
      lead: { ...facts, value: facts.value ?? output.extracted.value ?? null },
      userMessage: text,
      forbiddenTopics: settings.ai.rules.forbiddenTopics,
      isFirstTurn,
      disclosure: persona.disclosure,
      maxChars: settings.ai.rules.maxMessageChars,
    });

    // Memória + dados do lead (nunca sobrescreve dado conhecido com vazio)
    const e = output.extracted;
    await mergeMemory(orgId, lead.id, { ...e, intent: output.intent === 'LOW' ? undefined : output.intent });
    await db.lead.update({
      where: { id: lead.id },
      data: {
        ...(e.product && !lead.product ? { product: e.product } : {}),
        ...(e.value && !lead.desiredValue ? { desiredValue: e.value } : {}),
        ...(e.city && !lead.city ? { city: e.city } : {}),
        ...(e.uf && !lead.uf ? { uf: e.uf } : {}),
        ...(e.objective && !lead.objective ? { objective: e.objective } : {}),
        ...(e.term && !lead.term ? { term: e.term } : {}),
        ...(e.preferredChannel ? { preferredChannel: e.preferredChannel } : {}),
        ...(output.wantsHuman ? { signals: { ...((lead.signals as object) ?? {}), repliedBot: !!text, requestedContact: true } } : {}),
        ...(output.intent === 'HIGH' ? { intent: 'HIGH' } : {}),
        lastAgent: agentKey,
        lastInteractionAt: new Date(),
      },
    });

    // Opt-out solicitado na conversa (LGPD)
    if (output.optOut) {
      await db.lead.update({ where: { id: lead.id }, data: { optOut: true, consentStatus: 'REVOKED' } });
      await db.consent.updateMany({ where: { leadId: lead.id, status: 'GRANTED' }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await db.conversation.update({ where: { id: conversationId }, data: { botState: 'PAUSED' } });
      await recordPrivacyEvent(orgId, { leadId: lead.id, type: 'OPT_OUT', source: 'WHATSAPP', purpose: 'MARKETING', payload: { message: text } });
      await publish(orgId, 'consent.revoked', { leadId: lead.id, channel: 'WHATSAPP', source: 'conversation' });
    }


    // Knowledge gap
    if (output.knowledgeGap && text) {
      await db.knowledgeGap.create({
        data: { organizationId: orgId, question: text, leadId: lead.id, conversationId, agentKey, context: { product: facts.product, playbookKey }, answerGiven: verdict.finalReply },
      });
      await publish(orgId, 'ai.knowledge_gap', { leadId: lead.id, conversationId, question: text });
    }

    // 13 · score (sinais + intenção detectada)
    const score = await rescoreLead(systemCtx(orgId, 'Maestro'), lead.id, { reason: `Conversa (${agentKey})`, intentOverride: output.intent === 'HIGH' ? 'HIGH' : undefined });

    // 11 · decidir handoff
    const updatedLead = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    const updatedFacts = buildLeadFacts(updatedLead, await getMemory(orgId, lead.id));
    const turns = conversation.messages.filter((m) => m.senderType === 'AI').length + 1;
    const h = settings.ai.handoff;
    const handoffReason = output.optOut
      ? null
      : output.wantsHuman && h.onExplicitRequest
        ? 'Pedido explícito do cliente'
        : output.intent === 'HIGH' && h.onHighIntent
          ? 'Alta intenção detectada'
          : agentKey === 'QUALIFICATION' && h.afterQualificationComplete && missingSlots(updatedFacts, 'QUALIFICATION').length === 0
            ? 'Qualificação concluída'
            : turns >= h.maxBotTurns
              ? `Limite de ${h.maxBotTurns} respostas automáticas`
              : null;

    // Resposta (no pedido explícito de humano, a própria mensagem de handoff responde ao cliente)
    // Com handoff, a mensagem de transferência já avisa o cliente: frases de encerramento do agente
    // ("vou passar seu atendimento…") sairiam duplicadas e são retiradas.
    const replyText = handoffReason
      ? verdict.finalReply
          .split(/(?<=[.!?])\s+/)
          .filter((x) => !/vou passar seu atendimento|vou chamar um consultor|j[aá] tenho o que preciso/i.test(x))
          .join(' ')
          .trim()
      : verdict.finalReply;
    const skipReply = (!!handoffReason && output.wantsHuman && !output.isQuestion) || replyText.length < 3;
    const message = skipReply
      ? null
      : await deliverMessage(orgId, conversationId, { content: replyText, senderType: 'AI', agentKey, aiExecutionId: execution.id });

    const latencyMs = Date.now() - startedAt;
    const conf = assessConfidence({ knowledge, knowledgeGap: output.knowledgeGap, verdictAction: verdict.action, violations: verdict.violations.length, handoff: !!handoffReason, fallback: !!output.fallback });
    const modelUsed = output.modelUsed ?? agent?.model ?? ai.model;
    const promptV = await activePromptVersion(orgId, agentKey);
    await db.aIExecution.update({
      where: { id: execution.id },
      data: {
        model: modelUsed,
        tokensInput: output.usage?.inputTokens ?? null,
        tokensOutput: output.usage?.outputTokens ?? null,
        costMicros: estimateCostMicros(modelUsed, output.usage?.inputTokens, output.usage?.outputTokens),
        promptVersion: promptV?.version ?? null,
        confidence: conf.confidence,
        riskLevel: conf.riskLevel,
        requiresHuman: conf.requiresHuman,
        status: verdict.action === 'BLOCKED' ? 'BLOCKED' : 'COMPLETED',
        output: { draft: output.reply, final: verdict.finalReply, intent: output.intent, extracted: output.extracted as object, wantsHuman: output.wantsHuman, knowledgeGap: output.knowledgeGap, handoffReason, score: score.score, confidenceReason: conf.reason, fallback: !!output.fallback, sources: knowledge.map((k) => ({ documentId: k.documentId, chunkId: k.chunkId, title: k.title, relevance: Math.round(k.score * 1000) / 1000 })) },
        supervisorVerdict: { action: verdict.action, violations: verdict.violations } as object,
        knowledgeRefs: output.usedKnowledgeIds,
        latencyMs,
        completedAt: new Date(),
      },
    });
    await db.aIEvent.create({ data: { organizationId: orgId, executionId: execution.id, type: `supervisor.${verdict.action.toLowerCase()}`, payload: { violations: verdict.violations.length } } });
    await publish(orgId, 'ai.execution_completed', { executionId: execution.id, leadId: lead.id, conversationId, agentKey, latencyMs, supervisor: verdict.action });

    if (handoffReason) await performHandoff(orgId, conversationId, handoffReason);

    return { conversationId, reply: message?.content ?? null, agentKey, handoff: !!handoffReason, executionId: execution.id };
  } catch (e) {
    logger.error('maestro.failed', { conversationId, error: String(e) });
    await db.aIExecution.update({ where: { id: execution.id }, data: { status: 'FAILED', error: String(e).slice(0, 1000), completedAt: new Date(), latencyMs: Date.now() - startedAt } });
    throw e;
  }
}

/** HUMAN HANDOFF: AI → HANDOFF → CONSULTOR (bot PAUSED, humano ACTIVE, resumo automático). */
export async function performHandoff(orgId: string, conversationId: string, reason: string) {
  const ctx = systemCtx(orgId, 'Maestro');
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { lead: true, messages: { orderBy: { createdAt: 'asc' }, take: 60 } } });
  let lead = conversation.lead;

  if (!lead.consultantId) {
    await routeLead(ctx, lead.id);
    lead = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
  }
  const memory = await getMemory(orgId, lead.id);
  const facts = buildLeadFacts(lead, memory);
  const history: ChatTurn[] = conversation.messages
    .filter((m) => m.senderType !== 'SYSTEM')
    .map((m) => ({ role: m.senderType === 'LEAD' ? 'lead' : m.senderType === 'HUMAN' ? 'human' : 'assistant', content: m.content }));
  const summary = await getAIProvider().summarize({ lead: facts, history });

  const consultant = lead.consultantId ? await db.consultant.findUnique({ where: { id: lead.consultantId }, include: { pj: true } }) : null;
  await db.$transaction([
    db.conversation.update({ where: { id: conversationId }, data: { mode: 'HUMAN', botState: 'PAUSED', assignedConsultantId: lead.consultantId } }),
    db.conversationSummary.create({
      data: {
        organizationId: orgId,
        conversationId,
        leadId: lead.id,
        kind: 'HANDOFF',
        content: summary,
        structured: { reason, product: facts.product, value: facts.value, objective: facts.objective, city: facts.city, score: lead.score, source: lead.source, objections: facts.objections, intent: facts.intent } as object,
      },
    }),
    db.lead.update({ where: { id: lead.id }, data: { aiSummary: summary } }),
    db.leadActivity.create({
      data: { organizationId: orgId, leadId: lead.id, type: 'HANDOFF', description: `Transferido da IA para ${consultant?.name ?? 'consultor'} · ${reason}`, actorType: 'AI', metadata: { reason } },
    }),
  ]);
  await mergeMemory(orgId, lead.id, { summary });
  await deliverMessage(orgId, conversationId, {
    content: `Obrigado pelas informações! Um consultor${consultant && !/^consultor/i.test(firstName(consultant.name)) ? ` (${firstName(consultant.name)})` : ''} vai continuar o atendimento por aqui.`,
    senderType: 'AI',
    agentKey: 'QUALIFICATION',
  });
  await deliverMessage(orgId, conversationId, { content: `Handoff: IA pausada · consultor ativo · motivo: ${reason}`, senderType: 'SYSTEM' });

  if (lead.consultantId) {
    await notifyConsultant(orgId, lead.consultantId, {
      type: 'conversation.handoff',
      title: `Handoff: ${lead.name} aguarda você`,
      body: summary.split('\n').slice(0, 2).join(' · '),
      link: `/conversas?c=${conversationId}`,
      priority: 'HIGH',
      entityType: 'Lead',
      entityId: lead.id,
    });
  } else {
    await notifyRoles(orgId, ['MANAGER', 'ADMIN'], { type: 'conversation.handoff', priority: 'HIGH', title: `Handoff sem consultor: ${lead.name}`, body: reason, link: `/conversas?c=${conversationId}`, entityType: 'Lead', entityId: lead.id });
  }
  await publish(orgId, 'conversation.handoff', { conversationId, leadId: lead.id, reason, consultantId: lead.consultantId });
  await publish(orgId, 'ai.handoff', { conversationId, leadId: lead.id, reason });
  return { summary, consultantId: lead.consultantId };
}
