import { describe, expect, it } from 'vitest';
import { computeMerge, identityKeys, IDENTITY_PRIORITY } from '@/modules/leads/dedup';
import { isValidCnpj, normalizeCnpj, normalizeEmail, normalizePhone, parseMoney, splitCityUf } from '@/lib/normalize';

describe('Normalização', () => {
  it('telefones em formatos diferentes viram a mesma identidade', () => {
    const v = ['(11) 98888-7777', '11988887777', '+55 11 98888-7777', '5511988887777', '011988887777'].map(normalizePhone);
    expect(new Set(v)).toEqual(new Set(['5511988887777']));
    expect(normalizePhone('123')).toBeNull();
  });
  it('e-mail, CNPJ, cidade/UF e valores', () => {
    expect(normalizeEmail('  Maria@Exemplo.COM ')).toBe('maria@exemplo.com');
    expect(normalizeEmail('invalido')).toBeNull();
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-00')).toBe(false);
    expect(splitCityUf('jundiaí/sp')).toEqual({ city: 'Jundiaí', uf: 'SP' });
    expect(parseMoney('R$ 500.000,00')).toBe(500000);
    expect(parseMoney('500000')).toBe(500000);
  });
});

describe('Deduplicação', () => {
  it('prioridade: telefone → e-mail → CNPJ → externo', () => {
    expect(IDENTITY_PRIORITY).toEqual(['PHONE', 'EMAIL', 'CNPJ', 'EXTERNAL']);
    const keys = identityKeys({ phone: '5511988887777', email: 'a@b.com', cnpj: '11222333000181', externalId: 'X1', source: 'META' });
    expect(keys.map((k) => k.type)).toEqual(['PHONE', 'EMAIL', 'CNPJ', 'EXTERNAL']);
    expect(keys[3].value).toBe('META:X1');
  });

  it('merge preenche identidade vazia e atualiza interesse, sem apagar dados conhecidos', () => {
    const { data, changes } = computeMerge(
      { name: 'Maria', email: null, city: 'Jundiaí', product: 'VEICULO', desiredValue: 80000 },
      { name: 'Maria S.', email: 'maria@x.com', city: null, product: 'IMOVEL', desiredValue: null }
    );
    expect(data).toEqual({ email: 'maria@x.com', product: 'IMOVEL' });
    expect(changes.product).toEqual({ from: 'VEICULO', to: 'IMOVEL' });
    expect(data).not.toHaveProperty('name');
    expect(data).not.toHaveProperty('city');
  });
});
