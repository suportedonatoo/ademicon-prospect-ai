/**
 * TABELA DE PLANOS do simulador da landing — fonte: "Simulador de parcelas · Especificação técnica"
 * (consultor Luiz Concheto, Ademicon Jundiaí), base Simulador Newcon (AVA PRO), grupos em
 * comercialização em outubro/2026. Valores de referência: mudam por grupo e com o reajuste anual.
 * Se a Ademicon mudar taxa, prazo ou faixa, atualize SÓ aqui (a landing recebe estes parâmetros).
 *
 *   parcela = crédito × (plano + taxa adm + fundo de reserva) ÷ prazo
 *   seguro prestamista (opcional) = crédito × (1 + taxa adm + fundo de reserva) × 0,00037396
 *
 * Imóveis: plano 70% — a redução vale só para o crédito (fundo comum); a taxa de administração é cheia.
 */
export interface PlanParams {
  /** taxa de administração total (fração) */
  ta: number;
  /** fundo de reserva (fração) */
  fr: number;
  prazo: number;
  /** 0,70 no plano 70% de imóveis; 1 = plano integral */
  plano: number;
  min: number;
  max: number;
  passo: number;
}

export const PLAN_SOURCE = 'Simulador Newcon (AVA PRO) · grupos em comercialização em out/2026';
export const INSURANCE_RATE = 0.00037396;

/** Chaves = produtos do simulador. */
export const PLAN_TABLE: Record<string, PlanParams> = {
  IMOVEL: { ta: 0.242, fr: 0, prazo: 220, plano: 0.7, min: 80000, max: 1100000, passo: 5000 },
  VEICULO: { ta: 0.152, fr: 0.01, prazo: 90, plano: 1, min: 40000, max: 180000, passo: 1000 },
  MOTO: { ta: 0.232, fr: 0.05, prazo: 60, plano: 1, min: 15000, max: 30000, passo: 1000 },
  SERVICOS: { ta: 0.232, fr: 0.01, prazo: 50, plano: 1, min: 15000, max: 30000, passo: 1000 },
  BENS_MOVEIS: { ta: 0.18, fr: 0.01, prazo: 100, plano: 1, min: 100000, max: 200000, passo: 5000 },
};

/** Texto obrigatório abaixo do simulador. */
export const PLAN_DISCLAIMER =
  'Simulação de referência. Valores sem seguro prestamista, sujeitos ao grupo escolhido e ao reajuste anual. No plano 70% de imóveis, a parcela é recalculada após a contemplação.';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parcela mensal (2 casas), com ou sem seguro prestamista. */
export function planInstallment(p: PlanParams, credit: number, withInsurance = false) {
  let v = (credit * (p.plano + p.ta + p.fr)) / p.prazo;
  if (withInsurance) v += credit * (1 + p.ta + p.fr) * INSURANCE_RATE;
  return round2(v);
}

/** Crédito para uma parcela desejada: inverso da fórmula, no passo da barra e dentro da faixa. */
export function planCredit(p: PlanParams, installment: number) {
  const raw = (installment * p.prazo) / (p.plano + p.ta + p.fr);
  return Math.min(p.max, Math.max(p.min, Math.floor(raw / p.passo) * p.passo));
}
