// AI COST OBSERVABILITY — custo estimado por execução a partir dos tokens informados pelo provider.
// Tabela: preços públicos da API Anthropic (US$/1M tokens, tabela de 2026-09-25). Pode ser sobrescrita por
// AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK. Modelo desconhecido ou provider sem tokens → custo null.

const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** Custo em micro-dólares (US$ × 1.000.000), ou null quando não há base para estimar. */
export function estimateCostMicros(model: string | null | undefined, inputTokens?: number | null, outputTokens?: number | null): number | null {
  if (inputTokens == null || outputTokens == null || !model) return null;
  const envIn = Number(process.env.AI_PRICE_INPUT_PER_MTOK);
  const envOut = Number(process.env.AI_PRICE_OUTPUT_PER_MTOK);
  const p = envIn > 0 && envOut > 0 ? { input: envIn, output: envOut } : PRICES[model];
  if (!p) return null;
  return Math.round(inputTokens * p.input + outputTokens * p.output); // tokens × US$/1M = micro-dólares
}
