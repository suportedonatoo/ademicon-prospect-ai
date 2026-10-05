import { env } from '@/lib/env';
import type { BusinessResult, BusinessSearchFilters, CompanyRegistryProvider } from '../types';
import { int, pick, rng } from '../mock-random';

/**
 * CADASTRO NACIONAL DE EMPRESAS — consulta de CNPJ na BrasilAPI (dados públicos da Receita Federal,
 * gratuita, sem chave). COMPANY_REGISTRY_API_URL permite apontar para outro serviço compatível.
 * Busca por filtros (cidade + atividade) não existe em base pública: use Google Maps/Bing Maps e
 * enriqueça pelo CNPJ.
 */
export class RealCompanyRegistryProvider implements CompanyRegistryProvider {
  key = 'company_registry';
  name = 'Cadastro Nacional de Empresas (BrasilAPI / Receita)';
  category = 'registry' as const;
  mode = 'real' as const;
  private get base() {
    return (env.COMPANY_REGISTRY_API_URL || 'https://brasilapi.com.br/api/cnpj/v1').replace(/\/$/, '');
  }

  async healthCheck() {
    try {
      const r = await this.lookupCnpj('00000000000191'); // Banco do Brasil (CNPJ público)
      return { ok: !!r, mode: this.mode, detail: r ? `Consulta OK (${r.legalName})` : 'Sem resposta' };
    } catch (e) {
      return { ok: false, mode: this.mode, detail: (e as Error).message };
    }
  }

  async lookupCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return null;
    const res = await fetch(`${this.base}/${digits}`, {
      // A BrasilAPI (atrás de CDN) recusa requisições sem User-Agent (403).
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ProspectAI/1.0)', accept: 'application/json', ...(env.COMPANY_REGISTRY_API_KEY ? { authorization: `Bearer ${env.COMPANY_REGISTRY_API_KEY}` } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return null;
    const b = (await res.json().catch(() => ({}))) as {
      razao_social?: string;
      nome_fantasia?: string;
      cnae_fiscal?: number | string;
      cnae_fiscal_descricao?: string;
      porte?: string;
      descricao_situacao_cadastral?: string;
      municipio?: string;
      uf?: string;
      ddd_telefone_1?: string;
      email?: string | null;
      message?: string;
    };
    if (!res.ok) throw new Error(`Consulta de CNPJ: ${b.message ?? res.status}`);
    return {
      legalName: b.razao_social ?? '',
      tradeName: b.nome_fantasia || undefined,
      cnae: b.cnae_fiscal ? `${b.cnae_fiscal}${b.cnae_fiscal_descricao ? ` · ${b.cnae_fiscal_descricao}` : ''}` : undefined,
      size: b.porte || undefined,
      situation: b.descricao_situacao_cadastral || undefined,
      city: b.municipio || undefined,
      uf: b.uf || undefined,
      phone: b.ddd_telefone_1 || undefined,
      email: b.email || undefined,
    };
  }

  async search(): Promise<BusinessResult[]> {
    throw new Error('A base pública da Receita não permite buscar empresas por cidade/atividade. Use Google Maps ou Bing Maps e consulte o CNPJ de cada empresa.');
  }
}

const CNAES = [
  ['4120-4/00', 'Construção de edifícios'],
  ['4511-1/01', 'Comércio de automóveis'],
  ['8630-5/03', 'Atividade médica ambulatorial'],
  ['6911-7/01', 'Serviços advocatícios'],
  ['5611-2/01', 'Restaurantes'],
  ['4744-0/01', 'Comércio de ferragens'],
];

export class MockCompanyRegistryProvider implements CompanyRegistryProvider {
  key = 'company_registry';
  name = 'Cadastro empresarial (mock)';
  category = 'registry' as const;
  mode = 'mock' as const;
  async healthCheck() {
    return { ok: true, mode: this.mode, detail: 'Dados fictícios de demonstração.' };
  }
  async lookupCnpj(cnpj: string) {
    const r = rng(`cnpj:${cnpj}`);
    const [cnae] = pick(r, CNAES);
    return { legalName: `Empresa Demonstração ${cnpj.slice(0, 4)} Ltda`, cnae, size: pick(r, ['ME', 'EPP', 'Demais']), situation: 'ATIVA' };
  }
  async search(f: BusinessSearchFilters): Promise<BusinessResult[]> {
    const r = rng(`registry:${f.cnae ?? f.category}:${f.city}`);
    return Array.from({ length: Math.min(f.limit ?? 15, int(r, 6, 15)) }, (_, i) => {
      const [cnae, desc] = f.cnae ? [f.cnae, f.category] : pick(r, CNAES);
      return {
        name: `${desc.split(' ')[0]} ${pick(r, ['Alfa', 'Beta', 'Delta', 'Ômega', 'Prime', 'Master'])} ${pick(r, ['Ltda', 'ME', 'EIRELI', 'S.A.'])}`,
        category: desc,
        cnae,
        city: f.city,
        uf: f.uf,
        cnpj: String(int(r, 10, 99)) + String(int(r, 100000, 999999)) + '0001' + String(int(r, 10, 99)),
        size: f.size || pick(r, ['ME', 'EPP', 'Demais']),
        situation: f.situation || 'ATIVA',
        sourceRef: `registry-mock-${i}`,
      };
    });
  }
}

/** Real por padrão (BrasilAPI é pública); simulado só em testes ou se COMPANY_REGISTRY_PROVIDER=mock. */
export function createCompanyRegistryProvider(): CompanyRegistryProvider {
  return env.APP_ENV === 'test' || env.COMPANY_REGISTRY_PROVIDER === 'mock' ? new MockCompanyRegistryProvider() : new RealCompanyRegistryProvider();
}
