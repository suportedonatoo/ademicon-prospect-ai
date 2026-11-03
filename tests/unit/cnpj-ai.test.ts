import { afterEach, describe, expect, it, vi } from 'vitest';
import { CnpjAiProvider, cnpjAiReport } from '@/modules/integrations/company-registry/company-registry.provider';
import full from '../fixtures/cnpj-ai-full.json';

// Resposta no formato do exemplo oficial (cnpj.ai/static/api-v2-exemplo-full.json).
const sample = {
  dados: {
    estabelecimento: { nome_fantasia: 'PAO DOURADO', situacao_cadastral: '02', cnae_fiscal_principal: '4721102', uf: 'RS', ddd1: '51', telefone1: '33334444', correio_eletronico: 'Contato@PaoDourado.com.br', descricoes: { situacao_cadastral: 'Ativa', municipio: 'PORTO ALEGRE', cnae_fiscal_principal: 'Padaria e confeitaria' } },
    empresa: { razao_social: 'PADARIA PAO DOURADO LTDA', porte_empresa: '01', descricoes: { porte_empresa: 'ME' }, socios: { itens: [{ nome_socio_razao_social: 'JOAO DA SILVA', descricoes: { qualificacao_socio: 'Sócio-Administrador' } }] } },
  },
  meta: {},
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('cnpj.ai', () => {
  it('consulta com a chave no cabeçalho e traduz os campos', async () => {
    const fetchMock = vi.fn(async () => reply(200, sample));
    vi.stubGlobal('fetch', fetchMock);
    const r = await new CnpjAiProvider('chave-teste').lookupCnpj('11.111.111/0001-91');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cnpj.ai/v2/estabelecimentos/11111111000191/full');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer chave-teste');
    expect(r).toEqual({
      legalName: 'PADARIA PAO DOURADO LTDA',
      tradeName: 'PAO DOURADO',
      cnae: '4721102 · Padaria e confeitaria',
      size: 'ME',
      situation: 'ATIVA',
      city: 'PORTO ALEGRE',
      uf: 'RS',
      phone: '5133334444',
      email: 'contato@paodourado.com.br',
      partners: [{ name: 'JOAO DA SILVA', role: 'Sócio-Administrador' }],
    });
  });

  it('ficha completa (exemplo oficial do /full): cadastro, sócios e registros públicos', () => {
    const r = cnpjAiReport(full as Parameters<typeof cnpjAiReport>[0])!;
    expect(r).toMatchObject({ cnpj: '11111111000191', unit: 'Matriz', capital: 100000, legalNature: 'Sociedade Empresária Limitada', startDate: '2015-06-10', baseMonth: '2026-07', phones: ['(51) 33334444'] });
    expect(r.address).toBe('RUA DAS FLORES, 100, CENTRO — PORTO ALEGRE/RS · CEP 90000000');
    expect(r.partners[0]).toEqual({ name: 'JOAO DA SILVA', type: 'Pessoa Física', role: 'Sócio-Administrador', age: '31 a 40 anos', since: '2015-06-10' });
    expect(r.sources).toHaveLength(14);
    expect(r.sources.find((s) => s.name === 'CEIS')).toMatchObject({ group: 'Sanções, impedimentos e acordos', org: 'CGU', status: 'encontrado', total: 1 });
    expect(r.sources.find((s) => s.name === 'CEPIM')).toMatchObject({ status: 'sem_ocorrencia', total: 0 });
  });

  it('CNPJ inexistente → null; chave recusada aparece no teste de conexão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(404, { erro: { mensagem: 'não encontrado' } })));
    expect(await new CnpjAiProvider('k').lookupCnpj('11111111000191')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => reply(401, { erro: { mensagem: 'unauthorized' } })));
    expect((await new CnpjAiProvider('k').healthCheck()).detail).toMatch(/chave do cnpj.ai inválida/);
  });

  it('cota estourada (429) → o consultor recebe a resposta pela BrasilAPI', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(429, { erro: { mensagem: 'limite' } }))
      .mockResolvedValueOnce(reply(200, { razao_social: 'PADARIA PAO DOURADO LTDA', descricao_situacao_cadastral: 'ATIVA' }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await new CnpjAiProvider('k').lookupCnpj('11111111000191');
    expect(String(fetchMock.mock.calls[1][0])).toContain('brasilapi.com.br');
    expect(r?.legalName).toBe('PADARIA PAO DOURADO LTDA');
  });
});

describe('cnpj.ai · rede societária', () => {
  const empresa = (razao: string, socios: { nome: string; tipo: '1' | '2'; doc: string }[]) =>
    reply(200, { dados: { empresa: { razao_social: razao, socios: { total: socios.length, itens: socios.map((s) => ({ nome_socio_razao_social: s.nome, identificador_socio: s.tipo, cpf_cnpj_socio: s.doc, faixa_etaria: '4', descricoes: { qualificacao_socio: 'Sócio' } })) } } } });

  it('sobe pelos sócios que são empresas, até 2 níveis', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(empresa('ALFA LTDA', [{ nome: 'JOAO', tipo: '2', doc: '***123456**' }, { nome: 'HOLDING BETA SA', tipo: '1', doc: '22222222000100' }]))
      .mockResolvedValueOnce(empresa('HOLDING BETA SA', [{ nome: 'MARIA', tipo: '2', doc: '***654321**' }, { nome: 'GAMA PARTICIPACOES', tipo: '1', doc: '33333333000100' }]));
    vi.stubGlobal('fetch', fetchMock);
    const net = (await new CnpjAiProvider('k').network('11.111.111/0001-91'))!;
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(['https://api.cnpj.ai/v2/empresas/11111111/basic?limite=50', 'https://api.cnpj.ai/v2/empresas/22222222/basic?limite=50']);
    expect(net.nodes.map((n) => [n.label, n.kind, n.level])).toEqual([
      ['ALFA LTDA', 'empresa', 0],
      ['JOAO', 'pessoa', 1],
      ['HOLDING BETA SA', 'empresa', 1],
      ['MARIA', 'pessoa', 2],
      ['GAMA PARTICIPACOES', 'empresa', 2],
    ]);
    expect(net.edges).toContainEqual({ from: 'pj:22222222', to: 'pj:11111111', role: 'Sócio' });
    expect(net.queries).toBe(2);
    expect(net.truncated).toBe(true); // GAMA é empresa sócia no último nível e não foi aberta
  });
});
