import { describe, expect, it } from 'vitest';
import { PLAN_TABLE, planCredit, planInstallment } from '@/modules/simulators/plan-table';
import { installmentRange, simulate, simulateByInstallment, validateValue } from '@/modules/simulators/simulation-engine';

// Conferência da especificação (valores do AVA PRO; diferenças de centavos são arredondamento do sistema).
describe('Tabela de planos do simulador', () => {
  it.each([
    ['IMOVEL', 150000, false, 642.27],
    ['IMOVEL', 150000, true, 711.94],
    ['VEICULO', 40000, false, 516.44],
    ['MOTO', 15000, false, 320.5],
    ['SERVICOS', 15000, false, 372.6],
    ['BENS_MOVEIS', 102180, false, 1215.94],
  ] as const)('%s · R$ %d · seguro=%s → R$ %d', (key, credit, seguro, esperado) => {
    expect(planInstallment(PLAN_TABLE[key], credit, seguro)).toBe(esperado);
  });

  it('simulador usa a tabela: prazo, parcela, seguro, faixa e inverso pela parcela', () => {
    const cfg = { key: 'IMOVEL', label: 'Imóveis', termOptions: [120, 180], minValue: 1, maxValue: 9e9 };
    const r = simulate(cfg, 150000, false, 'x');
    expect(r.options).toEqual([{ termMonths: 220, installment: 642.27, credit: 150000, basis: 'PARAMETROS_OFICIAIS', installmentWithInsurance: 711.94 }]);
    expect(r.disclaimer).toMatch(/Simulação de referência/);
    expect(validateValue(cfg, 1_200_000)).toMatch(/máximo/);
    expect(installmentRange(cfg, false)).toEqual({ min: planInstallment(PLAN_TABLE.IMOVEL, 80000), max: planInstallment(PLAN_TABLE.IMOVEL, 1100000) });
    const byParcela = simulateByInstallment(cfg, 642.27, false, 'x');
    expect(byParcela.value).toBe(planCredit(PLAN_TABLE.IMOVEL, 642.27));
    expect(byParcela.value % PLAN_TABLE.IMOVEL.passo).toBe(0);
  });
});
