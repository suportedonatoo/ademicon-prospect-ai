import { z } from 'zod';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Forbidden, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { getOrgSettings } from '../organizations/settings';
import { searchKnowledge } from '../knowledge-base/knowledge.service';
import { getAIProvider } from './providers';
import type { ChatTurn, LeadFacts } from './providers/types';
import { extractSlots } from './nlu';
import { missingSlots } from './memory/memory.service';
import { supervise } from './supervisor/supervisor';
import { aiProfileInput, consultantPersona, parseAiProfile } from './consultant-persona';
import { freeSlots, pickSuggestions, wantsMeeting } from '../calendar/scheduling.service';
import { formatWhen } from '../calendar/when';

/**
 * "TESTAR A IA" (Configurar IA): o consultor conversa com a própria IA usando o que está na tela,
 * antes de salvar. Mesma IA, mesmas regras e supervisor do atendimento real — nada é enviado a cliente
 * e nenhuma reunião é marcada.
 */

export const aiTestInput = z.object({
  profile: z.record(z.unknown()).default({}),
  message: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(['lead', 'assistant']), content: z.string().max(2000) })).max(20).default([]),
});

export async function testConsultantAi(ctx: Ctx, consultantId: string, raw: unknown) {
  if (consultantId !== ctx.consultantId && ctx.roleKey !== 'SUPER_ADMIN' && !ctx.permissions.has('consultant.manage')) throw Forbidden('Só o próprio consultor ou a gestão testam esta IA.');
  const i = aiTestInput.parse(raw);
  const c = await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId }, select: { id: true, name: true, aiProfile: true, googleCalendarTokenEnc: true } });
  if (!c) throw NotFound('Consultor');
  // Rascunho da tela por cima do que está salvo (validação igual à do salvar).
  const draft = aiProfileInput.parse({ ...parseAiProfile(c.aiProfile), ...i.profile, enabled: true });
  const settings = await getOrgSettings(ctx.orgId);
  const persona = consultantPersona(draft, c.name, { personality: settings.ai.personality, disclosure: settings.ai.rules.disclosure });
  const isFirstTurn = !i.history.some((h) => h.role === 'assistant');

  // Pedido de reunião: mostra o que o cliente receberia (horários livres de verdade), sem marcar nada.
  if (draft.scheduling?.enabled !== false && wantsMeeting(i.message)) {
    const slots = pickSuggestions(await freeSlots({ ...c, aiProfile: draft }));
    const intro = isFirstTurn ? `${persona.disclosure} ` : '';
    const first = c.name.split(' ')[0];
    return {
      reply: slots.length
        ? `${intro}Claro! Tenho estes horários com ${first}:\n${slots.map((d, n) => `${n + 1}) ${formatWhen(d, env.APP_TIMEZONE)}`).join('\n')}\nQual fica melhor para você?`
        : `${intro}Não encontrei horário livre com ${first} nos próximos dias. Vou pedir para ${first} te chamar.`,
      note: 'Agenda: com um cliente de verdade, quando ele escolher o horário a reunião é marcada e a confirmação sai na hora.',
    };
  }

  const ai = getAIProvider();
  const history: ChatTurn[] = i.history.map((h) => ({ role: h.role, content: h.content }));
  // Igual ao atendimento real: o que o "cliente" já contou na conversa vira dado conhecido
  // (a IA não pergunta de novo, e o supervisor aceita valores que o próprio cliente informou).
  const facts: LeadFacts = { name: null, objections: [] };
  for (const text of [...i.history.filter((h) => h.role === 'lead').map((h) => h.content), i.message]) {
    const s = extractSlots(text);
    for (const k of ['product', 'objective', 'value', 'city', 'uf', 'term'] as const) if (s[k] != null) (facts as Record<string, unknown>)[k] = s[k];
    if (s.objections?.length) facts.objections = [...new Set([...(facts.objections ?? []), ...s.objections])];
  }
  const knowledge = await searchKnowledge(ctx.orgId, [i.message, facts.product ? `${facts.product} consórcio` : ''].filter(Boolean).join(' '), { topK: settings.ai.knowledge.topK, product: facts.product });
  const out = await ai.generateTurn({
    agentKey: 'PROSPECT',
    instructions: persona.instructions,
    playbook: null,
    personality: persona.personality,
    disclosure: persona.disclosure,
    forbiddenTopics: settings.ai.rules.forbiddenTopics,
    isFirstTurn,
    lead: facts,
    missingSlots: missingSlots(facts, 'PROSPECT'),
    history,
    userMessage: i.message,
    knowledge,
    minRelevance: settings.ai.knowledge.minRelevance,
  });
  const verdict = supervise({ reply: out.reply, knowledge, lead: { ...facts, value: facts.value ?? out.extracted.value ?? null }, userMessage: i.message, forbiddenTopics: settings.ai.rules.forbiddenTopics, isFirstTurn, disclosure: persona.disclosure, maxChars: settings.ai.rules.maxMessageChars });
  return {
    reply: verdict.finalReply,
    note: ai.name.toLowerCase().includes('mock') ? 'IA em modo simulado (roteiro grátis): o jeito de falar treinado aqui só aparece com a IA real ligada (Gemini ou Claude).' : verdict.action === 'BLOCKED' ? 'O supervisor ajustou a resposta para cumprir as regras da empresa.' : null,
  };
}
