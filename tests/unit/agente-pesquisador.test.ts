import { describe, expect, it } from 'vitest';
import { analyzeCompany, learnedAdjust, segmentOf, templatePitch } from '@/modules/business-prospecting/research';
import { parsePitch } from '@/modules/ai/providers/pitch';
import { SampleCompanySearchProvider } from '@/modules/integrations/company-search/company-search.provider';
import type { CompanyRecord } from '@/modules/integrations/types';

const now = new Date('2026-10-21T10:00:00Z');
const transportadora: CompanyRecord = {
  cnpj: '12345678000190',
  legalName: 'Transportes Horizonte Ltda',
  cnae: '4930-2/02',
  cnaeDescription: 'Transporte rodoviário de carga intermunicipal',
  openedAt: '2018-03-10',
  shareCapital: 500_000,
  size: 'EMPRESA DE PEQUENO PORTE',
  situation: 'ATIVA',
  city: 'Jundiaí',
  uf: 'SP',
  phone: '11987654321',
  partners: [
    { name: 'MARCOS ALMEIDA', role: 'Sócio' },
    { name: 'FERNANDA ROCHA', role: 'Sócio-Administrador' },
  ],
  sourceRef: 'teste:1',
};

describe('Agente Pesquisador — análise', () => {
  it('transportadora consolidada, com decisor e celular, tira nota alta e explica o porquê', () => {
    const r = analyzeCompany(transportadora, now);
    expect(r.score).toBe(35 + 20 + 15 + 15 + 10);
    expect(r.product).toBe('VEICULO');
    expect(r.decisionMaker).toEqual({ name: 'FERNANDA ROCHA', role: 'Sócio-Administrador' }); // o administrador, não o primeiro sócio
    expect(r.reasons.join(' ')).toMatch(/frota/);
    expect(r.reasons.join(' ')).toMatch(/Capital social de R\$\s?500\.000/);
    expect(r.message).toContain('Fernanda');
    expect(r.sample).toBe(false);
  });

  it('empresa inativa ou sem contato fica com nota 0', () => {
    expect(analyzeCompany({ ...transportadora, situation: 'BAIXADA' }, now).score).toBe(0);
    expect(analyzeCompany({ ...transportadora, phone: undefined, email: undefined }, now).score).toBe(0);
  });

  it('MEI de segmento sem motivo claro fica bem abaixo da nota mínima', () => {
    const r = analyzeCompany({ ...transportadora, cnae: '9602-5/01', size: 'MEI', shareCapital: 5_000, partners: [], phone: '1133334444' }, now);
    expect(r.score).toBeLessThan(40);
    expect(r.decisionMaker).toBeNull();
  });

  it('segmentos: o prefixo mais específico vem antes do genérico', () => {
    expect(segmentOf('8599-6/01')?.label).toBe('Autoescola');
    expect(segmentOf('8513-9/00')?.label).toBe('Educação');
    expect(segmentOf('4744-0/05')?.label).toBe('Materiais de construção');
  });

  it('aprende com a equipe: precisa de amostra mínima e ajusta de −10 a +10', () => {
    expect(learnedAdjust({ positive: 4, total: 4 })).toBe(0);
    expect(learnedAdjust({ positive: 8, total: 10 })).toBe(10);
    expect(learnedAdjust({ positive: 4, total: 10 })).toBe(3);
    expect(learnedAdjust({ positive: 0, total: 10 })).toBe(-7); // Math.round(-7,5) = -7
    const up = analyzeCompany(transportadora, now, { positive: 6, total: 10 });
    expect(up.reasons.at(-1)).toMatch(/bom retorno da equipe \(6 de 10/);
  });

  it('o texto padrão não cita taxa, parcela nem promessa', () => {
    const t = templatePitch(transportadora, { segment: 'Transporte rodoviário', product: 'VEICULO', decisionMaker: null });
    expect(`${t.approach} ${t.message}`).not.toMatch(/garant|%|taxa|parcela de/i);
    expect(t.approach).toMatch(/Pergunte quem cuida/);
  });
});

describe('Agente Pesquisador — texto da IA', () => {
  it('aceita JSON (com ou sem ```) e recusa promessa, taxa ou formato inválido', () => {
    const ok = { approach: 'Peça para falar com a Fernanda, sócia-administradora.', message: 'Olá, Fernanda! Atendo transportadoras da região. Posso te mandar uma simulação?' };
    expect(parsePitch('```json\n' + JSON.stringify(ok) + '\n```')).toEqual(ok);
    expect(parsePitch(JSON.stringify({ ...ok, message: 'Contemplação garantida em 3 meses, Fernanda!' }))).toBeNull();
    expect(parsePitch(JSON.stringify({ ...ok, message: 'Fernanda, taxa de 12% ao ano, quer saber mais?' }))).toBeNull();
    expect(parsePitch('não sei')).toBeNull();
  });
});

describe('Fonte de exemplo', () => {
  it('é determinística, paginada e tem CNPJ claramente fictício', async () => {
    const p = new SampleCompanySearchProvider();
    const a = await p.searchCompanies({ city: 'Jundiaí', uf: 'SP', page: 1, limit: 20 });
    const b = await p.searchCompanies({ city: 'Jundiaí', uf: 'SP', page: 1, limit: 20 });
    const c = await p.searchCompanies({ city: 'Jundiaí', uf: 'SP', page: 2, limit: 20 });
    expect(a).toEqual(b);
    expect(new Set([...a, ...c].map((x) => x.cnpj)).size).toBe(40);
    expect(a.every((x) => x.cnpj.startsWith('99') && x.cnpj.length === 14 && x.sourceRef.startsWith('sample:'))).toBe(true);
    expect(analyzeCompany(a[0], now).sample).toBe(true);
  });
});

describe('Fonte de exemplo — telefones', () => {
  it('celular com 11 dígitos e fixo com 10', async () => {
    const all = await new SampleCompanySearchProvider().searchCompanies({ city: 'Campinas', uf: 'SP', limit: 50 });
    const phones = all.map((x) => x.phone).filter((x): x is string => !!x);
    expect(phones.length).toBeGreaterThan(20);
    for (const p of phones) expect(p[2] === '9' ? p.length === 11 : p.length === 10 && p[2] === '3').toBe(true);
  });
});
