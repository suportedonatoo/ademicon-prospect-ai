import { z } from 'zod';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { getOrgSettings, MEMORY_FIELDS, updateOrgSettings } from '../organizations/settings';

export const agentInput = z.object({
  active: z.boolean(),
  model: z.string().max(80).nullable().optional(),
  temperature: z.coerce.number().min(0).max(1).nullable().optional(),
  instructions: z.string().min(10).max(8000),
});

export const playbookInput = z.object({
  name: z.string().min(3).max(120),
  objective: z.string().min(5).max(500),
  trigger: z.string().min(3).max(200),
  rules: z.array(z.string().max(300)).max(20),
  agentKey: z.enum(['PROSPECT', 'QUALIFICATION']),
  nextAction: z.string().min(3).max(200),
  active: z.boolean(),
});

export const aiSettingsInput = z.object({
  personality: z.object({ formality: z.enum(['formal', 'neutro', 'descontraido']), objectivity: z.enum(['direto', 'equilibrado', 'detalhado']), emojis: z.boolean(), style: z.string().max(300) }),
  rules: z.object({ maxMessageChars: z.coerce.number().int().min(160).max(2000), forbiddenTopics: z.array(z.string().max(80)).max(30), disclosure: z.string().min(20).max(300) }),
  handoff: z.object({ onHighIntent: z.boolean(), onExplicitRequest: z.boolean(), afterQualificationComplete: z.boolean(), maxBotTurns: z.coerce.number().int().min(2).max(50) }),
  knowledge: z.object({ minRelevance: z.coerce.number().min(0).max(1), topK: z.coerce.number().int().min(1).max(10) }),
  memory: z
    .object({ enabled: z.boolean(), retentionDays: z.coerce.number().int().min(1).max(1825), fields: z.array(z.enum(MEMORY_FIELDS)) })
    .optional(),
});

export async function listAgents(ctx: Ctx) {
  assertCan(ctx, 'ai.read');
  return db.aIAgent.findMany({ where: { organizationId: ctx.orgId }, orderBy: { key: 'asc' } });
}

export async function updateAgent(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, 'ai.configure');
  const input = agentInput.parse(raw);
  const agent = await db.aIAgent.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!agent) throw NotFound('Agente');
  await db.aIAgent.update({ where: { id }, data: input });
  await audit(ctx, 'ai.configured', { type: 'AIAgent', id }, { key: agent.key, active: input.active, model: input.model });
}

export async function listPlaybooks(ctx: Ctx) {
  assertCan(ctx, 'ai.read');
  return db.aIPlaybook.findMany({ where: { organizationId: ctx.orgId }, orderBy: { order: 'asc' } });
}

export async function updatePlaybook(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, 'ai.configure');
  const input = playbookInput.parse(raw);
  await db.aIPlaybook.updateMany({ where: { id, organizationId: ctx.orgId }, data: input });
  await audit(ctx, 'ai.configured', { type: 'AIPlaybook', id }, { name: input.name, active: input.active });
}

export async function getAISettings(ctx: Ctx) {
  assertCan(ctx, 'ai.read');
  return (await getOrgSettings(ctx.orgId)).ai;
}

export async function updateAISettings(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'ai.configure');
  const parsed = aiSettingsInput.parse(raw);
  const input = { ...parsed, memory: parsed.memory ?? (await getOrgSettings(ctx.orgId)).ai.memory };
  await updateOrgSettings(ctx.orgId, { ai: input });
  await audit(ctx, 'ai.configured', { type: 'AISettings' }, { handoff: input.handoff, knowledge: input.knowledge, memory: input.memory });
}

export async function listExecutions(ctx: Ctx, opts: { status?: string; take?: number } = {}) {
  assertCan(ctx, 'ai.read');
  return db.aIExecution.findMany({
    where: { organizationId: ctx.orgId, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { startedAt: 'desc' },
    take: opts.take ?? 50,
    include: { feedback: true },
  });
}

/**
 * AI TRACE — reconstrói o caminho de UMA execução a partir do que o Maestro gravou:
 * mensagem → Maestro → memória/contexto → RAG → agente → regras → supervisor → resposta.
 */
export async function getExecutionTrace(ctx: Ctx, id: string) {
  assertCan(ctx, 'ai.read');
  const e = await db.aIExecution.findFirst({ where: { id, organizationId: ctx.orgId }, include: { feedback: { orderBy: { createdAt: 'desc' } } } });
  if (!e) throw NotFound('Execução');
  type Src = { documentId: string; chunkId: string; title: string; relevance: number };
  const input = (e.input ?? {}) as { text?: string | null; isFirstTurn?: boolean; missing?: string[] };
  const output = (e.output ?? {}) as {
    draft?: string;
    final?: string;
    intent?: string;
    extracted?: Record<string, unknown>;
    wantsHuman?: boolean;
    knowledgeGap?: boolean;
    handoffReason?: string | null;
    score?: number;
    confidenceReason?: string;
    fallback?: boolean;
    sources?: Src[];
  };
  const verdict = (e.supervisorVerdict ?? {}) as { action?: string; violations?: { check: string; rule: string; excerpt?: string }[] };
  const docs = output.sources?.length
    ? await db.knowledgeDocument.findMany({ where: { organizationId: ctx.orgId, id: { in: output.sources.map((s) => s.documentId) } }, select: { id: true, currentVersion: true, status: true } })
    : [];
  const lead = e.leadId ? await db.lead.findFirst({ where: { id: e.leadId, organizationId: ctx.orgId }, select: { id: true, name: true } }) : null;
  return {
    execution: e,
    lead,
    steps: [
      { key: 'USER', title: 'Mensagem do cliente', data: { texto: input.text ?? '(início de conversa, sem mensagem)', primeiroContato: !!input.isFirstTurn } },
      { key: 'MAESTRO', title: 'Maestro', data: { agente: e.agentKey, playbook: e.playbookKey, provider: e.provider, modelo: e.model, versaoPrompt: e.promptVersion } },
      { key: 'MEMORY', title: 'Memória e contexto', data: { camposFaltando: input.missing ?? [], extraidoDestaMensagem: output.extracted ?? {} } },
      {
        key: 'RAG',
        title: 'Knowledge Base (RAG)',
        data: {
          fontes: (output.sources ?? []).map((s) => ({ ...s, versao: docs.find((d) => d.id === s.documentId)?.currentVersion ?? null, status: docs.find((d) => d.id === s.documentId)?.status ?? 'removido' })),
          semResposta: !!output.knowledgeGap,
        },
      },
      { key: 'AGENT', title: 'Agente (rascunho)', data: { rascunho: output.draft ?? null, intencao: output.intent ?? null, pediuHumano: !!output.wantsHuman, fallback: !!output.fallback } },
      { key: 'RULES', title: 'Regras de negócio', data: { handoff: output.handoffReason ?? null, scoreDepois: output.score ?? null } },
      { key: 'SUPERVISOR', title: 'AI Sales Supervisor', data: { veredito: verdict.action ?? null, violacoes: verdict.violations ?? [] } },
      {
        key: 'RESPONSE',
        title: 'Resposta final',
        data: { texto: output.final ?? null, confianca: e.confidence, risco: e.riskLevel, exigeHumano: e.requiresHuman, motivo: output.confidenceReason ?? null, latenciaMs: e.latencyMs, tokens: e.tokensInput != null ? { entrada: e.tokensInput, saida: e.tokensOutput } : null, erro: e.error },
      },
    ],
  };
}

export const feedbackInput = z.object({ rating: z.enum(['GOOD', 'BAD', 'INCORRECT', 'NEEDS_REVIEW']), comment: z.string().max(1000).optional(), messageId: z.string().optional() });

export async function addFeedback(ctx: Ctx, executionId: string, raw: unknown) {
  assertCan(ctx, 'ai.feedback');
  const input = feedbackInput.parse(raw);
  const exec = await db.aIExecution.findFirst({ where: { id: executionId, organizationId: ctx.orgId } });
  if (!exec) throw NotFound('Execução');
  return db.aIFeedback.create({ data: { organizationId: ctx.orgId, executionId, ...input, userId: ctx.userId } });
}
