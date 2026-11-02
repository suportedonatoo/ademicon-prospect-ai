import { afterEach, describe, expect, it, vi } from 'vitest';
import { CnpjAiProvider } from '@/modules/integrations/company-registry/company-registry.provider';

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
    expect(url).toBe('https://api.cnpj.ai/v2/estabelecimentos/11111111000191/basic');
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
