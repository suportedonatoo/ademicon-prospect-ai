import { describe, expect, it } from 'vitest';
import { cleanCnpj, formatCnpjId, isValidCnpj, toCnpj } from '@/modules/cnpj/cnpj-id';
import { formatCnae } from '@/modules/cnpj/cnpj.provider';

describe('Validação de CNPJ', () => {
  it('numérico: dígito verificador', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('00000000000191')).toBe(true); // Banco do Brasil
    expect(isValidCnpj('11111111111111')).toBe(false); // repetido
    expect(isValidCnpj('1122233300018')).toBe(false); // 13 caracteres
  });

  it('alfanumérico (Receita, desde jul/2026): exemplo oficial 12.ABC.345/01DE-35', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12abc34501de35')).toBe(true); // minúsculas também
    expect(isValidCnpj('12ABC34501DE36')).toBe(false);
    expect(isValidCnpj('12ABC34501DEAB')).toBe(false); // verificadores são sempre números
  });

  it('limpa, formata e devolve null quando inválido', () => {
    expect(cleanCnpj(' 12.abc.345/01de-35 ')).toBe('12ABC34501DE35');
    expect(toCnpj('12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
    expect(toCnpj('123')).toBeNull();
    expect(formatCnpjId('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnae('4930202')).toBe('4930-2/02');
  });
});
