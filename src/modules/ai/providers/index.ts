import { env } from '@/lib/env';
import { AnthropicAIProvider } from './anthropic.provider';
import { GEMINI_DEFAULT_MODEL, GeminiAIProvider } from './gemini.provider';
import { MockAIProvider } from './mock.provider';
import type { AIProvider } from './types';

let instance: AIProvider | null = null;

/** Seleciona o provider pela configuração. Sem chave → Mock (a aplicação funciona igual). */
export function getAIProvider(): AIProvider {
  if (instance) return instance;
  if (env.AI_PROVIDER === 'anthropic' && env.AI_API_KEY) instance = new AnthropicAIProvider(env.AI_API_KEY, env.AI_MODEL);
  // Modelo salvo de outro provedor (ex.: claude-…) não existe no Gemini: cai no padrão gratuito.
  else if (env.AI_PROVIDER === 'gemini' && env.AI_API_KEY) instance = new GeminiAIProvider(env.AI_API_KEY, env.AI_MODEL.startsWith('gemini') ? env.AI_MODEL : GEMINI_DEFAULT_MODEL);
  else instance = new MockAIProvider();
  return instance;
}

export type { AIProvider } from './types';

/** Credenciais trocadas no painel do Super Admin: a próxima chamada recria o provider. */
export function resetAIProvider() {
  instance = null;
}
