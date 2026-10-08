import type { SimulatorProductConfig } from './simulation-engine';

/**
 * FAIXAS OFICIAIS do simulador público da Ademicon (https://www.ademicon.com.br/#simulador).
 * Lidas no 1º passo do simulador, que mostra mínimo e máximo de crédito e de parcela de cada tipo
 * ANTES de pedir dados pessoais. Nada estimado. Prazo, taxa de administração e a parcela exata de
 * cada crédito só existem na tabela oficial de planos (unidade licenciada) — não estão aqui.
 * As faixas mudam com o tempo: colete de novo e atualize OFFICIAL_COLLECTED_AT.
 */
export const OFFICIAL_SOURCE = 'Simulador público da Ademicon (ademicon.com.br)';
export const OFFICIAL_COLLECTED_AT = '2026-10-07';

export const ADEMICON_OFFICIAL_RANGES: Record<string, { label: string; creditMin: number; creditMax: number; installmentMin: number; installmentMax: number }> = {
  IMOVEL: { label: 'Imóveis', creditMin: 80000, creditMax: 1273442.29, installmentMin: 269.84, installmentMax: 8581.72 },
  VEICULO: { label: 'Veículos', creditMin: 40000, creditMax: 252900, installmentMin: 278.88, installmentMax: 1469.35 },
  MOTO: { label: 'Motos', creditMin: 15627, creditMax: 31254, installmentMin: 541.44, installmentMax: 1082.88 },
  SERVICOS: { label: 'Serviços', creditMin: 15000, creditMax: 33382.71, installmentMin: 305.69, installmentMax: 5174.32 },
  BENS_MOVEIS: { label: 'Outros bens móveis', creditMin: 102180, creditMax: 204360, installmentMin: 1067.88, installmentMax: 2135.78 },
};

/** Aplica as faixas oficiais aos produtos do simulador (por chave). Produtos sem faixa oficial ficam como estão. */
export function withOfficialRanges(products: SimulatorProductConfig[]): SimulatorProductConfig[] {
  return products.map((p) => {
    const o = ADEMICON_OFFICIAL_RANGES[p.key];
    if (!o) return p;
    return {
      ...p,
      label: o.label,
      minValue: o.creditMin,
      maxValue: o.creditMax,
      officialInstallmentMin: o.installmentMin,
      officialInstallmentMax: o.installmentMax,
      officialSource: OFFICIAL_SOURCE,
      officialCollectedAt: OFFICIAL_COLLECTED_AT,
    };
  });
}
