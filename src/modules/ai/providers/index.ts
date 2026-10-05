import { env } from '@/lib/env';
import { AnthropicAIProvider } from './anthropic.provider';
import { MockAIProvider } from './mock.provider';
import type { AIProvider } from './types';

let instance: AIProvider | null = null;

/** Seleciona o provider pela configuração. Sem chave → Mock (a aplicação funciona igual). */
export function getAIProvider(): AIProvider {
  if (instance) return instance;
  instance = env.AI_PROVIDER === 'anthropic' && env.AI_API_KEY ? new AnthropicAIProvider(env.AI_API_KEY, env.AI_MODEL) : new MockAIProvider();
  return instance;
}

export type { AIProvider } from './types';

/** Credenciais trocadas no painel do Super Admin: a próxima chamada recria o provider. */
export function resetAIProvider() {
  instance = null;
}
