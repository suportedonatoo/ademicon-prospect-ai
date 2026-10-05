// Modelos de atribuição multi-toque (puros, sem banco — testados em tests/unit).
// Cada conversão distribui 100% do crédito entre os toques (canais) da jornada do lead.

export const ATTRIBUTION_MODELS = {
  FIRST_TOUCH: 'Primeiro toque',
  LAST_TOUCH: 'Último toque',
  LINEAR: 'Linear',
  POSITION_BASED: 'Baseado em posição (40/20/40)',
  TIME_DECAY: 'Decaimento no tempo (meia-vida 7 dias)',
} as const;
export type AttributionModel = keyof typeof ATTRIBUTION_MODELS;
export const isAttributionModel = (m: unknown): m is AttributionModel => typeof m === 'string' && m in ATTRIBUTION_MODELS;

export interface Touch {
  channel: string;
  at: Date;
}

/**
 * Crédito por canal para UMA conversão (soma = 1).
 * - FIRST/LAST_TOUCH: 100% no primeiro/último toque.
 * - LINEAR: partes iguais.
 * - POSITION_BASED: 40% primeiro, 40% último, 20% dividido entre os do meio (1 toque = 100%; 2 = 50/50).
 * - TIME_DECAY: peso 2^(−dias até a conversão / meia-vida), normalizado.
 */
export function creditFor(touches: Touch[], model: AttributionModel, conversionAt: Date, halfLifeDays = 7): Map<string, number> {
  const t = [...touches].sort((a, b) => a.at.getTime() - b.at.getTime());
  const credit = new Map<string, number>();
  const add = (ch: string, v: number) => credit.set(ch, (credit.get(ch) ?? 0) + v);
  if (!t.length) return credit;
  const n = t.length;

  switch (model) {
    case 'FIRST_TOUCH':
      add(t[0].channel, 1);
      break;
    case 'LAST_TOUCH':
      add(t[n - 1].channel, 1);
      break;
    case 'LINEAR':
      for (const x of t) add(x.channel, 1 / n);
      break;
    case 'POSITION_BASED':
      if (n === 1) add(t[0].channel, 1);
      else if (n === 2) {
        add(t[0].channel, 0.5);
        add(t[1].channel, 0.5);
      } else {
        add(t[0].channel, 0.4);
        add(t[n - 1].channel, 0.4);
        for (const x of t.slice(1, -1)) add(x.channel, 0.2 / (n - 2));
      }
      break;
    case 'TIME_DECAY': {
      const w = t.map((x) => Math.pow(2, -Math.max(0, conversionAt.getTime() - x.at.getTime()) / (halfLifeDays * 86400_000)));
      const sum = w.reduce((a, b) => a + b, 0);
      t.forEach((x, i) => add(x.channel, w[i] / sum));
      break;
    }
  }
  return credit;
}

/** Remove toques repetidos do mesmo canal no mesmo minuto (ex.: sessão + registro de origem simultâneos). */
export function dedupeTouches(touches: Touch[]): Touch[] {
  const seen = new Set<string>();
  return [...touches]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .filter((x) => {
      const k = `${x.channel}|${Math.floor(x.at.getTime() / 60_000)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
