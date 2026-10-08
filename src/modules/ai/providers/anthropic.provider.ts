import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { logger } from '@/lib/logger';
import * as z from 'zod/v4';
import { productLabel } from '@/modules/leads/catalog';
import { brl } from '@/lib/format';
import { MockAIProvider } from './mock.provider';
import type { AgentTurnInput, AgentTurnOutput, AIProvider, IdeasInput, SummaryInput } from './types';
import { IDEAS_SYSTEM, ideasUserPrompt, parseIdeas, templateIdeas } from './ideas';

// Provider real (Claude). Saída estruturada validada por schema.
// Em qualquer falha (rede, recusa, parse), cai para o MockAIProvider — a conversa nunca quebra —
// e o motivo vai para o log (ai.fallback), para a falha não passar despercebida.
// Recusa por política: fallback do lado do servidor ("default") tenta outro modelo dentro da mesma chamada.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Haiku 4.5 (o mais barato) não aceita `effort` nem o fallback do servidor e não "pensa" por padrão:
 * vai pela API comum, com histórico mais curto. Os demais (Opus/Sonnet) usam effort baixo + fallback.
 */
const isHaiku = (model: string) => model.startsWith('claude-haiku');

export const TurnSchema = z.object({
  reply: z.string(),
  extracted: z.object({
    product: z.enum(['IMOVEL', 'VEICULO', 'MOTO', 'SERVICOS', 'BENS_MOVEIS']).nullable(),
    objective: z.string().nullable(),
    value: z.number().nullable(),
    city: z.string().nullable(),
    uf: z.string().nullable(),
    term: z.string().nullable(),
    objections: z.array(z.string()),
    preferredChannel: z.enum(['WHATSAPP', 'PHONE', 'EMAIL']).nullable(),
  }),
  intent: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  wantsHuman: z.boolean(),
  optOut: z.boolean(),
  isQuestion: z.boolean(),
  knowledgeGap: z.boolean(),
  usedKnowledgeIds: z.array(z.string()),
});

export function systemPrompt(i: AgentTurnInput): string {
  const facts = [
    i.lead.name && `Nome: ${i.lead.name}`,
    i.lead.product && `Produto: ${productLabel(i.lead.product)}`,
    i.lead.objective && `Objetivo: ${i.lead.objective}`,
    i.lead.value && `Valor desejado: ${brl(i.lead.value)}`,
    i.lead.city && `Cidade: ${i.lead.city}${i.lead.uf ? `/${i.lead.uf}` : ''}`,
    i.lead.term && `Prazo: ${i.lead.term}`,
    i.lead.objections?.length && `Objeções: ${i.lead.objections.join(', ')}`,
    i.lead.source && `Origem: ${i.lead.source}`,
    i.lead.summary && `Resumo anterior: ${i.lead.summary}`,
  ].filter(Boolean);

  const knowledge = i.knowledge.length
    ? i.knowledge.map((k) => `<trecho id="${k.chunkId}" titulo="${k.title}" relevancia="${k.score.toFixed(2)}">\n${k.content}\n</trecho>`).join('\n')
    : '(nenhum trecho relevante encontrado)';

  return `${i.instructions}

Você conversa por WhatsApp em português do Brasil em nome da equipe comercial.
Estilo: ${i.personality.style} Formalidade: ${i.personality.formality}. Objetividade: ${i.personality.objectivity}. Emojis: ${i.personality.emojis ? 'com moderação' : 'não use'}.
Você é um assistente automatizado e deve assumir isso com naturalidade quando for o primeiro contato ou quando perguntarem. Texto de apresentação: "${i.disclosure}"
Nunca finja ser humano. Não use menus numerados ("digite 1").

Regras inegociáveis:
- Informações factuais (taxas, prazos, regras, valores, parcelas, condições) SOMENTE se estiverem nos trechos da Knowledge Base abaixo. Se não estiverem, diga que um consultor confirmará e marque knowledgeGap=true.
- Nunca prometa aprovação, contemplação, data de contemplação, valores de parcela ou taxas que não estejam na Knowledge Base.
- Não aborde: ${i.forbiddenTopics.join(', ')}.
- Nunca pergunte algo que já sabemos (fatos abaixo). Faça no máximo UMA pergunta por mensagem.
- Mensagens curtas (até 3 frases).
- Se a pessoa pedir para parar de receber mensagens, confirme e marque optOut=true.
- Se a pessoa pedir um humano/consultor, marque wantsHuman=true.
${i.playbook ? `\nPlaybook ativo: ${i.playbook.name}\nObjetivo: ${i.playbook.objective}\nRegras: ${i.playbook.rules.join(' | ')}\nPróxima ação: ${i.playbook.nextAction}` : ''}

Fatos conhecidos do lead:
${facts.length ? facts.join('\n') : '(nenhum)'}

Informações que ainda faltam (pergunte a mais importante, se fizer sentido): ${i.missingSlots.join(', ') || 'nenhuma'}

Knowledge Base autorizada:
${knowledge}

Em "extracted", preencha apenas o que a pessoa disse NESTA mensagem (null quando não houver). Em usedKnowledgeIds, liste os ids dos trechos usados.`;
}

export class AnthropicAIProvider implements AIProvider {
  name = 'anthropic' as const;
  private client: Anthropic;
  private fallback = new MockAIProvider();

  constructor(apiKey: string, public model: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  /** Confere de verdade a chave e o modelo (consulta gratuita à lista de modelos, sem gerar texto). */
  async healthCheck() {
    try {
      const info = await this.client.models.retrieve(this.model);
      return { ok: true, mode: 'real' as const, detail: `Conectado · ${info.display_name ?? this.model}` };
    } catch (e) {
      const status = e instanceof Anthropic.APIError ? e.status : undefined;
      const why = status === 401 ? 'chave inválida' : status === 404 ? `modelo "${this.model}" não encontrado` : String((e as Error).message ?? e);
      return { ok: false, mode: 'real' as const, detail: `Claude recusou: ${why}` };
    }
  }

  async generateTurn(i: AgentTurnInput): Promise<AgentTurnOutput> {
    const model = i.model || this.model;
    const messages: Anthropic.MessageParam[] = i.history.slice(isHaiku(model) ? -10 : -16).map((h) => ({
      role: h.role === 'lead' ? ('user' as const) : ('assistant' as const),
      content: h.role === 'human' ? `[consultor humano] ${h.content}` : h.content,
    }));
    messages.push({
      role: 'user',
      content: i.userMessage ?? '[Início de conversa: envie a primeira mensagem de contato, apresentando-se como assistente automatizado.]',
    });
    // A API exige alternância começando por "user": mescla turnos consecutivos do mesmo papel.
    const merged: Anthropic.MessageParam[] = [];
    for (const m of messages) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) last.content = `${last.content}\n${m.content}`;
      else merged.push({ ...m });
    }
    if (merged[0]?.role === 'assistant') merged.unshift({ role: 'user', content: '[histórico anterior]' });

    try {
      const response = isHaiku(model)
        ? await this.client.messages.parse({
            model,
            max_tokens: 1500,
            system: systemPrompt(i),
            messages: merged,
            output_config: { format: zodOutputFormat(TurnSchema) },
          })
        : // max_tokens folgado: o raciocínio do modelo também conta no limite (effort "low" mantém curto).
          await this.client.beta.messages.parse({
            model,
            max_tokens: 8000,
            system: systemPrompt(i),
            messages: merged,
            output_config: { effort: 'low', format: betaZodOutputFormat(TurnSchema) },
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
          });
      if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error(`stop_reason=${response.stop_reason}`);
      const o = response.parsed_output;
      return {
        ...o,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        modelUsed: response.model,
        extracted: Object.fromEntries(Object.entries(o.extracted).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))),
      };
    } catch (e) {
      // LLM FALLBACK: registra que quem respondeu foi o fallback determinístico — e por quê.
      logger.warn('ai.fallback', { model, error: String((e as Error)?.message ?? e).slice(0, 300) });
      return { ...(await this.fallback.generateTurn(i)), modelUsed: 'mock (fallback)', fallback: true };
    }
  }

  async ideas(input: IdeasInput): Promise<string[]> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: isHaiku(this.model) ? 1200 : 4000,
        ...(isHaiku(this.model) ? {} : { output_config: { effort: 'low' as const } }),
        system: IDEAS_SYSTEM,
        messages: [{ role: 'user', content: ideasUserPrompt(input) }],
      });
      const text = response.content.find((b) => b.type === 'text');
      const list = text && text.type === 'text' ? parseIdeas(text.text, input.message, input.count).filter((x) => !input.exclude?.includes(x)) : [];
      return list.length ? list : templateIdeas(input.count, input.exclude);
    } catch (e) {
      logger.warn('ai.ideas_fallback', { error: String((e as Error)?.message ?? e).slice(0, 300) });
      return templateIdeas(input.count, input.exclude);
    }
  }

  async summarize(input: SummaryInput): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: isHaiku(this.model) ? 1200 : 6000,
        ...(isHaiku(this.model) ? {} : { output_config: { effort: 'low' as const } }),
        system:
          'Gere um resumo de handoff para o consultor, em português, no formato de linhas "Campo: valor": Interesse, Valor informado, Cidade, Objetivo, Prazo, Intenção, Principal objeção, Origem, Próxima ação sugerida. Use apenas o que está no contexto; escreva "não informado" quando faltar.',
        messages: [
          {
            role: 'user',
            content: `Fatos: ${JSON.stringify(input.lead)}\n\nConversa:\n${input.history.map((h) => `${h.role}: ${h.content}`).join('\n')}`,
          },
        ],
      });
      const text = response.content.find((b) => b.type === 'text');
      return text && text.type === 'text' ? text.text : this.fallback.summarize(input);
    } catch (e) {
      logger.warn('ai.summary_fallback', { error: String((e as Error)?.message ?? e).slice(0, 300) });
      return this.fallback.summarize(input);
    }
  }
}
