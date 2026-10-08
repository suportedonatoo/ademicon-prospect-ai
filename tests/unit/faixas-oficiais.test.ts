import { describe, expect, it } from 'vitest';
import { ADEMICON_OFFICIAL_RANGES, withOfficialRanges } from '@/modules/simulators/ademicon-official';
import { installmentRange, simulate, simulateByInstallment, validateInstallment, validateValue, type SimulatorProductConfig } from '@/modules/simulators/simulation-engine';

const base: SimulatorProductConfig[] = [
  { key: 'IMOVEL', label: 'Imóvel', termOptions: [120, 180, 200], minValue: 80000, maxValue: 2000000 },
  { key: 'MOTO', label: 'Moto', termOptions: [36, 50, 60], minValue: 10000, maxValue: 120000 },
  { key: 'OUTRO', label: 'Outro', termOptions: [12], minValue: 1000, maxValue: 5000 },
];
const [imovel, moto, outro] = withOfficialRanges(base);

describe('faixas oficiais da Ademicon no simulador', () => {
  it('aplica crédito e parcela oficiais por tipo; produto sem faixa oficial fica igual', () => {
    expect(imovel).toMatchObject({ label: 'Imóveis', minValue: 80000, maxValue: 1273442.29, officialInstallmentMin: 269.84, officialInstallmentMax: 8581.72 });
    expect(moto).toMatchObject({ minValue: 15627, maxValue: 31254, officialInstallmentMin: 541.44, officialInstallmentMax: 1082.88 });
    expect(outro).toEqual(base[2]);
    expect(Object.keys(ADEMICON_OFFICIAL_RANGES).sort()).toEqual(['BENS_MOVEIS', 'IMOVEL', 'MOTO', 'SERVICOS', 'VEICULO']);
  });

  it('por crédito: devolve só as faixas oficiais — nenhuma tabela de parcela estimada', () => {
    const r = simulate(imovel, 300000, false, 'Simulação ilustrativa.');
    expect(r.options).toEqual([]);
    expect(r.officialRange).toMatchObject({ creditMin: 80000, creditMax: 1273442.29, installmentMin: 269.84, installmentMax: 8581.72 });
    expect(r.value).toBe(300000);
    expect(r.disclaimer).toContain('consultadas em 07/10/2026');
  });

  it('por parcela: aceita a faixa oficial inteira e não inventa carta de crédito', () => {
    expect(installmentRange(imovel, false)).toEqual({ min: 269.84, max: 8581.72 });
    expect(validateInstallment(imovel, 269.84, false)).toBeNull();
    expect(validateInstallment(imovel, 269.83, false)).toMatch(/entre/);
    const r = simulateByInstallment(imovel, 1500, false, 'x');
    expect(r).toMatchObject({ mode: 'PARCELA', value: 0, installmentTarget: 1500, options: [] });
    expect(r.officialRange?.installmentMax).toBe(8581.72);
  });

  it('valida o crédito pelos limites oficiais', () => {
    expect(validateValue(moto, 15627)).toBeNull();
    expect(validateValue(moto, 40000)).toMatch(/máximo/);
    expect(validateValue(imovel, 2000000)).toMatch(/máximo/);
  });

  it('sem faixa oficial o comportamento antigo continua (divisão simples identificada)', () => {
    const r = simulate(outro, 3000, false, 'x');
    expect(r.officialRange).toBeUndefined();
    expect(r.options[0]).toMatchObject({ termMonths: 12, basis: 'DIVISAO_SIMPLES' });
  });
});
