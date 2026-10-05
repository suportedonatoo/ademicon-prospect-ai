import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import type { Ctx } from '../auth/context';
import { getOrgSettings } from '../organizations/settings';
import { searchKnowledge } from '../knowledge-base/knowledge.service';
import { getAIProvider } from '../ai/providers';
import { MockAIProvider } from '../ai/providers/mock.provider';
import { env } from '@/lib/env';
import type { ChatTurn } from '../ai/providers/types';
import { supervise } from '../ai/supervisor/supervisor';
import { assessConfidence } from '../ai/confidence';
import { CENTRAL_SITE, loadSite, siteLabel } from './landing-service.service';

/**
 * BOT DO VISITANTE (landing da PJ, "Simular apenas" → FRIO).
 * Tira dúvidas de forma ANÔNIMA: não cria lead, não pede nem guarda dado pessoal.
 * Usa o mesmo motor do Maestro (Knowledge Base + agente Prospect + AI Sales Supervisor + guardrails).
 * Quando o visitante mostra interesse ou pede um consultor, sugere a "Simulação com interesse".
 * A execução é registrada (sem dado pessoal) e aparece no console do Maestro e no AI Trace.
 */

export const visitorChatInput = z.object({
  sessionKey: z.string().max(100).optional().nullable(),
  message: z.string().trim().min(1).max(500),
  product: z.string().max(40).optional().nullable(),
  history: z
    .array(z.object({ role: z.enum(['visitor', 'bot']), text: z.string().max(1200) }))
    .max(12)
    .default([]),
});

/** Frases do agente que não fazem sentido no chat anônimo (oferta repetida / "vou chamar um consultor"). */
const VISITOR_DROP = [/j[aá] d[aá] para montar uma simula[cç][aã]o personalizada/i, /quer que um consultor/i, /vou chamar um consultor/i, /vou passar seu atendimento/i];

const INTEREST =/(quero (contratar|fechar|comprar|entrar|simular|um consultor|falar)|tenho interesse|me interessa|como (fa[cç]o|faço) para (contratar|entrar)|falar com (um |uma )?(consultor|atendente|pessoa)|me liga|pode me ligar)/i;

export async function visitorChat(ctx: Ctx, subdomain: string, raw: unknown) {
  const { pj } = await loadSite(ctx, subdomain);
  const unitName = await siteLabel(ctx, pj);
  const siteKey = pj?.subdomain ?? CENTRAL_SITE;
  const input = visitorChatInput.parse(raw);
  const orgId = ctx.orgId;
  const settings = await getOrgSettings(orgId);
  const agent = await db.aIAgent.findFirst({ where: { organizationId: orgId, key: 'PROSPECT' } });
  // Economia: por padrão o visitante anônimo (ainda sem contato) é atendido pelo roteiro gratuito;
  // a IA paga fica para quem já é lead. AI_VISITOR_MODE=ia liga a IA também aqui.
  const ai = env.AI_VISITOR_MODE === 'ia' ? getAIProvider() : new MockAIProvider();
  // O card do chat já abre com a apresentação do assistente virtual (identificação de IA),
  // então a resposta não repete a saudação.
  const isFirstTurn = false;
  const history: ChatTurn[] = input.history.map((h) => ({ role: h.role === 'visitor' ? 'lead' : 'assistant', content: h.text }));
  const started = Date.now();

  const execution = await db.aIExecution.create({
    data: {
      organizationId: orgId,
      agentKey: 'PROSPECT',
      playbookKey: 'visitante_landing',
      provider: ai.name,
      model: agent?.model || ai.model,
      input: { text: input.message, isFirstTurn, missing: [], visitor: true, subdomain: siteKey },
    },
  });

  const knowledge = await searchKnowledge(orgId, input.message, { topK: settings.ai.knowledge.topK, product: input.product ?? null });
  const facts = { name: null, product: input.product ?? null, city: null, objections: [], score: 0, temperature: 'FRIO', source: 'LANDING', intent: null, summary: null };
  const output = await ai.generateTurn({
    agentKey: 'PROSPECT',
    instructions: `${agent?.instructions ?? ''}\nVisitante ANÔNIMO da landing da ${unitName}: responda dúvidas com base na Knowledge Base. Não peça nome, telefone ou outros dados pessoais neste chat. Se houver interesse, convide a fazer a "Simulação com interesse".`,
    playbook: null,
    personality: settings.ai.personality,
    disclosure: settings.ai.rules.disclosure,
    forbiddenTopics: settings.ai.rules.forbiddenTopics,
    isFirstTurn,
    lead: facts,
    missingSlots: [], // anônimo: não coleta dados
    history,
    userMessage: input.message,
    knowledge,
    minRelevance: settings.ai.knowledge.minRelevance,
    model: agent?.model,
    temperature: agent?.temperature,
  });

  const verdict = supervise({
    reply: output.reply,
    knowledge,
    lead: { ...facts, value: output.extracted.value ?? null },
    userMessage: input.message,
    forbiddenTopics: settings.ai.rules.forbiddenTopics,
    isFirstTurn,
    disclosure: settings.ai.rules.disclosure,
    maxChars: settings.ai.rules.maxMessageChars,
  });

  const suggestInterest = !verdict.violations.some((v) => v.check === 'security') && (output.wantsHuman || output.intent === 'HIGH' || INTEREST.test(input.message));
  // Anônimo: o bot não "chama consultor" nem fica oferecendo atendimento a cada resposta —
  // só convida para a Simulação com interesse quando o visitante demonstra interesse.
  const cleaned = verdict.finalReply
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !VISITOR_DROP.some((re) => re.test(s)))
    .join(' ')
    .trim();
  const reply = suggestInterest
    ? `${cleaned} Para um consultor da ${unitName} te atender, use o botão "Simulação com interesse" — é só deixar seu WhatsApp.`.trim()
    : cleaned || verdict.finalReply;

  if (output.knowledgeGap) {
    await db.knowledgeGap.create({ data: { organizationId: orgId, question: input.message, agentKey: 'PROSPECT', context: { visitor: true, subdomain: siteKey, product: input.product ?? null }, answerGiven: reply } });
    await publish(orgId, 'ai.knowledge_gap', { leadId: null, conversationId: null, question: input.message });
  }

  const conf = assessConfidence({ knowledge, knowledgeGap: output.knowledgeGap, verdictAction: verdict.action, violations: verdict.violations.length, handoff: false, fallback: !!output.fallback });
  await db.aIExecution.update({
    where: { id: execution.id },
    data: {
      status: verdict.action === 'BLOCKED' ? 'BLOCKED' : 'COMPLETED',
      model: output.modelUsed ?? agent?.model ?? ai.model,
      output: {
        draft: output.reply,
        final: reply,
        intent: output.intent,
        extracted: output.extracted as object,
        wantsHuman: output.wantsHuman,
        knowledgeGap: output.knowledgeGap,
        handoffReason: suggestInterest ? 'Visitante com interesse → convite para Simulação com interesse' : null,
        confidenceReason: conf.reason,
        fallback: !!output.fallback,
        sources: knowledge.map((k) => ({ documentId: k.documentId, chunkId: k.chunkId, title: k.title, relevance: Math.round(k.score * 1000) / 1000 })),
      },
      supervisorVerdict: { action: verdict.action, violations: verdict.violations } as object,
      knowledgeRefs: knowledge.map((k) => k.chunkId),
      latencyMs: Date.now() - started,
      tokensInput: output.usage?.inputTokens ?? null,
      tokensOutput: output.usage?.outputTokens ?? null,
      confidence: conf.confidence,
      riskLevel: conf.riskLevel,
      requiresHuman: false,
      completedAt: new Date(),
    },
  });

  if (input.sessionKey) {
    const session = await db.attributionSession.findFirst({ where: { sessionKey: input.sessionKey, organizationId: orgId }, select: { id: true } });
    if (session) await db.attributionEvent.create({ data: { organizationId: orgId, sessionId: session.id, type: 'VISITOR_CHAT' } });
  }
  return { reply, suggestInterest, executionId: execution.id };
}
