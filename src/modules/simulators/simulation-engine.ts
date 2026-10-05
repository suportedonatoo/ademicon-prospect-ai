// Cálculo do simulador — PURO e transparente.
// Princípio de não-fabricação: sem parâmetros oficiais (taxa de administração, fundo de reserva)
// configurados e verificados, mostramos apenas a divisão simples do crédito pelo prazo,
// claramente identificada. Nada de taxas inventadas.

export interface SimulatorProductConfig {
  key: string;
  label: string;
  termOptions: number[]; // prazos em meses
  minValue: number;
  maxValue: number;
  adminFeePct?: number | null; // taxa de administração TOTAL no prazo (%), somente se oficial
  reserveFundPct?: number | null; // fundo de reserva (%), somente se oficial
}

export interface SimulationResult {
  product: string;
  /** CREDITO: o cliente informou a carta de crédito · PARCELA: informou quanto quer pagar por mês */
  mode: 'CREDITO' | 'PARCELA';
  value: number;
  installmentTarget?: number;
  options: { termMonths: number; installment: number; credit: number; basis: 'PARAMETROS_OFICIAIS' | 'DIVISAO_SIMPLES' }[];
  parametersApplied: { adminFeePct: number | null; reserveFundPct: number | null };
  disclaimer: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function costFactor(cfg: SimulatorProductConfig, verified: boolean) {
  const hasOfficial = verified && cfg.adminFeePct != null;
  return { hasOfficial, factor: hasOfficial ? 1 + (Number(cfg.adminFeePct) + Number(cfg.reserveFundPct ?? 0)) / 100 : 1 };
}

function finishDisclaimer(hasOfficial: boolean, disclaimer: string) {
  return hasOfficial
    ? disclaimer
    : `${disclaimer} Valores exibidos correspondem apenas à divisão do crédito pelo prazo, SEM taxa de administração, fundo de reserva, seguros ou correções — as condições oficiais são apresentadas pelo consultor.`;
}

/** Simulação por CRÉDITO: parcela = crédito × fator ÷ prazo. */
export function simulate(cfg: SimulatorProductConfig, value: number, verified: boolean, disclaimer: string): SimulationResult {
  const { hasOfficial, factor } = costFactor(cfg, verified);
  return {
    product: cfg.key,
    mode: 'CREDITO',
    value,
    options: cfg.termOptions.map((termMonths) => ({
      termMonths,
      installment: round2((value * factor) / termMonths),
      credit: value,
      basis: hasOfficial ? 'PARAMETROS_OFICIAIS' : 'DIVISAO_SIMPLES',
    })),
    parametersApplied: { adminFeePct: hasOfficial ? Number(cfg.adminFeePct) : null, reserveFundPct: hasOfficial ? Number(cfg.reserveFundPct ?? 0) : null },
    disclaimer: finishDisclaimer(hasOfficial, disclaimer),
  };
}

/** Faixa de parcela possível para o produto (menor crédito no maior prazo … maior crédito no menor prazo). */
export function installmentRange(cfg: SimulatorProductConfig, verified: boolean) {
  const { factor } = costFactor(cfg, verified);
  const terms = cfg.termOptions.length ? cfg.termOptions : [1];
  return { min: round2((cfg.minValue * factor) / Math.max(...terms)), max: round2((cfg.maxValue * factor) / Math.min(...terms)) };
}

/**
 * Simulação por PARCELA: o cliente diz quanto quer pagar por mês e vê a carta de crédito
 * possível em cada prazo (crédito = parcela × prazo ÷ fator). Prazos cujo crédito sai da faixa
 * do produto são omitidos. `value` = crédito do prazo intermediário (referência do lead).
 */
export function simulateByInstallment(cfg: SimulatorProductConfig, installment: number, verified: boolean, disclaimer: string): SimulationResult {
  const { hasOfficial, factor } = costFactor(cfg, verified);
  const options = cfg.termOptions
    .map((termMonths) => ({ termMonths, installment: round2(installment), credit: Math.round((installment * termMonths) / factor), basis: (hasOfficial ? 'PARAMETROS_OFICIAIS' : 'DIVISAO_SIMPLES') as SimulationResult['options'][number]['basis'] }))
    .filter((o) => o.credit >= cfg.minValue && o.credit <= cfg.maxValue);
  const reference = options[Math.floor((options.length - 1) / 2)]?.credit ?? 0;
  return {
    product: cfg.key,
    mode: 'PARCELA',
    value: reference,
    installmentTarget: round2(installment),
    options,
    parametersApplied: { adminFeePct: hasOfficial ? Number(cfg.adminFeePct) : null, reserveFundPct: hasOfficial ? Number(cfg.reserveFundPct ?? 0) : null },
    disclaimer: finishDisclaimer(hasOfficial, disclaimer),
  };
}

export function validateInstallment(cfg: SimulatorProductConfig, installment: number, verified: boolean): string | null {
  const r = installmentRange(cfg, verified);
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (!Number.isFinite(installment) || installment <= 0) return 'Informe o valor da parcela.';
  if (installment < r.min || installment > r.max) return `Para ${cfg.label}, a parcela deve ficar entre ${brl(r.min)} e ${brl(r.max)}.`;
  return null;
}

export function validateValue(cfg: SimulatorProductConfig, value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return 'Informe o valor desejado.';
  if (value < cfg.minValue) return `Valor mínimo para ${cfg.label}: R$ ${cfg.minValue.toLocaleString('pt-BR')}.`;
  if (value > cfg.maxValue) return `Valor máximo para ${cfg.label}: R$ ${cfg.maxValue.toLocaleString('pt-BR')}.`;
  return null;
}
