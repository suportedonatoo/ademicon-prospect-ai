import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { BusinessResult, BusinessSearchFilters, CompanyNetwork, CompanyRegistryProvider, CompanyReport } from '../types';
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
      qsa?: { nome_socio?: string; qualificacao_socio?: string }[];
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
      // Quadro societário (dado público da Receita): quem decide na empresa.
      partners: (b.qsa ?? []).filter((q) => q.nome_socio).map((q) => ({ name: q.nome_socio!, role: q.qualificacao_socio || undefined })),
    };
  }

  async search(): Promise<BusinessResult[]> {
    throw new Error('A base pública da Receita não permite buscar empresas por cidade/atividade. Use Google Maps ou Bing Maps e consulte o CNPJ de cada empresa.');
  }
}

/**
 * cnpj.ai — API de desenvolvedor (v2), dados da Receita Federal. Chave em Super Admin → Consulta de CNPJ.
 * Cota da conta: 60 consultas por minuto (todas as chaves somadas; erro também conta).
 * Se o cnpj.ai falhar (fora do ar, cota, chave recusada), a consulta cai na BrasilAPI para o consultor não ficar
 * sem resposta; a chave recusada aparece no "Testar conexão" da aba do Super Admin.
 */
export class CnpjAiProvider implements CompanyRegistryProvider {
  key = 'company_registry';
  name = 'cnpj.ai (Receita Federal)';
  category = 'registry' as const;
  mode = 'real' as const;
  private backup = new RealCompanyRegistryProvider();

  constructor(private apiKey: string) {}

  async healthCheck() {
    try {
      const r = await this.fetchCnpj('00000000000191'); // Banco do Brasil (CNPJ público)
      return { ok: !!r, mode: this.mode, detail: r ? `Chave válida · consulta OK (${r.legalName})` : 'Sem resposta' };
    } catch (e) {
      return { ok: false, mode: this.mode, detail: (e as Error).message };
    }
  }

  async lookupCnpj(cnpj: string) {
    try {
      return await this.fetchCnpj(cnpj);
    } catch (e) {
      logger.warn('cnpj_ai.fallback', { error: (e as Error).message });
      return this.backup.lookupCnpj(cnpj);
    }
  }

  private async fetchCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return null;
    const res = await fetch(`https://api.cnpj.ai/v2/estabelecimentos/${digits}/full`, {
      headers: { authorization: `Bearer ${this.apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return null;
    const b = (await res.json().catch(() => ({}))) as CnpjAiBody;
    if (!res.ok) {
      const why = res.status === 401 ? 'chave do cnpj.ai inválida ou revogada' : res.status === 429 ? 'limite de 60 consultas por minuto do cnpj.ai atingido' : (b.erro?.mensagem ?? `HTTP ${res.status}`);
      throw new Error(`cnpj.ai: ${why}`);
    }
    const est = b.dados?.estabelecimento ?? {};
    const emp = b.dados?.empresa ?? {};
    const phone = est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : undefined;
    return {
      legalName: emp.razao_social ?? '',
      tradeName: est.nome_fantasia || undefined,
      cnae: est.cnae_fiscal_principal ? `${est.cnae_fiscal_principal}${est.descricoes?.cnae_fiscal_principal ? ` · ${est.descricoes.cnae_fiscal_principal}` : ''}` : undefined,
      size: emp.descricoes?.porte_empresa || emp.porte_empresa || undefined,
      situation: (est.descricoes?.situacao_cadastral ?? est.situacao_cadastral)?.toUpperCase() || undefined,
      city: est.descricoes?.municipio || undefined,
      uf: est.uf || undefined,
      phone,
      email: est.correio_eletronico?.toLowerCase() || undefined,
      partners: (emp.socios?.itens ?? []).filter((s) => s.nome_socio_razao_social).map((s) => ({ name: s.nome_socio_razao_social!, role: s.descricoes?.qualificacao_socio || undefined })),
      report: await withCnaeNames(cnpjAiReport(b)),
    };
  }

  /**
   * Rede societária pela API oficial: sócios da empresa e, quando o sócio é outra empresa, os sócios dela
   * (até `depth` níveis, no máximo `maxQueries` consultas, cada uma conta na cota). A API não diz em quais
   * outras empresas uma pessoa é sócia, então a rede só "sobe" pelos sócios.
   */
  async network(cnpj: string, depth = 2, maxQueries = 10): Promise<CompanyNetwork | null> {
    const root = cnpj.replace(/\D/g, '').slice(0, 8);
    if (root.length !== 8) return null;
    const nodes = new Map<string, CompanyNetwork['nodes'][number]>();
    const edges: CompanyNetwork['edges'] = [];
    const queue: { raiz: string; level: number }[] = [{ raiz: root, level: 0 }];
    let queries = 0;
    let truncated = false;
    while (queue.length) {
      const { raiz, level } = queue.shift()!;
      if (queries >= maxQueries) {
        truncated = true;
        break;
      }
      queries++;
      const res = await fetch(`https://api.cnpj.ai/v2/empresas/${raiz}/basic?limite=50`, {
        headers: { authorization: `Bearer ${this.apiKey}`, accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404 && level > 0) continue;
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(res.status === 429 ? 'cnpj.ai: limite de 60 consultas por minuto atingido; tente em 1 minuto' : `cnpj.ai: HTTP ${res.status}`);
      const emp = ((await res.json()) as CnpjAiBody).dados?.empresa ?? {};
      const id = `pj:${raiz}`;
      const node = nodes.get(id) ?? { id, label: '', kind: 'empresa' as const, level, cnpj: raiz };
      node.label = emp.razao_social || node.label || raiz;
      nodes.set(id, node);
      if ((emp.socios?.total ?? 0) > (emp.socios?.itens?.length ?? 0)) truncated = true;
      for (const s of emp.socios?.itens ?? []) {
        const doc = (s.cpf_cnpj_socio ?? '').replace(/\D/g, '');
        // Receita: 1 = pessoa jurídica (documento é o CNPJ inteiro), 2 = pessoa física (CPF mascarado), 3 = estrangeiro.
        const pj = s.identificador_socio === '1' && doc.length === 14;
        const pid = pj ? `pj:${doc.slice(0, 8)}` : `pf:${s.cpf_cnpj_socio ?? ''}:${s.nome_socio_razao_social ?? ''}`;
        if (!nodes.has(pid)) {
          nodes.set(pid, {
            id: pid,
            label: s.nome_socio_razao_social ?? '—',
            kind: pj ? 'empresa' : s.identificador_socio === '3' ? 'estrangeiro' : 'pessoa',
            level: level + 1,
            ...(pj ? { cnpj: doc } : { age: AGE[Number(s.faixa_etaria)] || undefined }),
          });
          // Empresa sócia no último nível não é aberta: a rede continua além do que aparece.
          if (pj && level + 1 < depth) queue.push({ raiz: doc.slice(0, 8), level: level + 1 });
          else if (pj) truncated = true;
        }
        edges.push({ from: pid, to: id, role: s.descricoes?.qualificacao_socio });
      }
    }
    return { nodes: [...nodes.values()], edges, queries, truncated: truncated || queue.length > 0 };
  }

  async search(): Promise<BusinessResult[]> {
    throw new Error('O cnpj.ai consulta um CNPJ por vez; não busca empresas por cidade/atividade. Use Google Maps e consulte o CNPJ de cada empresa.');
  }
}

type Str = string | null;
type CnpjAiBody = {
  dados?: {
    estabelecimento?: {
      cnpj?: string;
      nome_fantasia?: Str;
      situacao_cadastral?: Str;
      data_situacao_cadastral?: Str;
      data_inicio_atividade?: Str;
      cnae_fiscal_principal?: Str;
      cnae_fiscal_secundaria?: Str;
      tipo_logradouro?: Str;
      logradouro?: Str;
      numero?: Str;
      complemento?: Str;
      bairro?: Str;
      cep?: Str;
      uf?: Str;
      ddd1?: Str;
      telefone1?: Str;
      ddd2?: Str;
      telefone2?: Str;
      correio_eletronico?: Str;
      descricoes?: Record<string, string>;
    };
    empresa?: {
      razao_social?: Str;
      porte_empresa?: Str;
      capital_social?: number | null;
      descricoes?: Record<string, string>;
      simples?: { opcao_simples?: boolean | null; data_opcao_simples?: Str; opcao_mei?: boolean | null } | null;
      socios?: { total?: number | null; itens?: { nome_socio_razao_social?: Str; identificador_socio?: Str; cpf_cnpj_socio?: Str; data_entrada_sociedade?: Str; faixa_etaria?: Str; descricoes?: Record<string, string> }[] };
    };
    registros_publicos?: Record<string, Record<string, { status: CompanyReport['sources'][number]['status']; total?: number | null; competencia?: Str; carregada_em?: Str; itens?: Record<string, unknown>[]; proveniencia?: { fonte?: string } }>>;
  };
  meta?: { competencia_receita?: Str };
  erro?: { codigo?: string; mensagem?: string };
};

const SOURCE_GROUPS: Record<string, string> = {
  divida_ativa_uniao: 'Dívida ativa da União',
  sancoes_impedimentos_acordos: 'Sanções, impedimentos e acordos',
  trabalho_analogo_escravidao: 'Trabalho análogo à escravidão',
  habilitacao_aduaneira: 'Habilitação aduaneira',
  fiscalizacao_ambiental: 'Fiscalização ambiental',
  rntrc: 'Transportador rodoviário de cargas',
  contratos_publicos: 'Contratos públicos',
  financiamentos_bndes: 'Financiamentos do BNDES',
};
// Códigos de faixa etária do quadro societário da Receita.
const AGE = ['', '0 a 12 anos', '13 a 20 anos', '21 a 30 anos', '31 a 40 anos', '41 a 50 anos', '51 a 60 anos', '61 a 70 anos', '71 a 80 anos', 'mais de 80 anos'];
const phoneOf = (ddd?: Str, n?: Str) => (ddd && n ? `(${ddd}) ${n}` : undefined);

// Nome das atividades pela tabela oficial do IBGE (pública, sem chave). Os códigos se repetem muito: cache em memória.
const cnaeCache = new Map<string, string | null>();
async function cnaeName(code: string) {
  if (!cnaeCache.has(code)) {
    const r = await fetch(`https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/${code}`, { signal: AbortSignal.timeout(5_000) })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => undefined);
    if (r === undefined) return undefined; // IBGE fora do ar: tenta de novo na próxima consulta
    const desc = (r as { descricao?: string } | null)?.descricao?.toLowerCase();
    cnaeCache.set(code, desc ? desc[0].toUpperCase() + desc.slice(1) : null);
  }
  return cnaeCache.get(code) ?? undefined;
}

/** O cnpj.ai não manda o nome das atividades secundárias: completa pelo IBGE. */
export async function withCnaeNames(report?: CompanyReport) {
  if (!report) return report;
  report.otherActivities = await Promise.all(report.otherActivities.map(async (a) => ({ ...a, desc: a.desc ?? (await cnaeName(a.code)) })));
  return report;
}

/** Resposta /full do cnpj.ai → ficha do painel de Empresas. */
export function cnpjAiReport(b: CnpjAiBody): CompanyReport | undefined {
  const est = b.dados?.estabelecimento;
  const emp = b.dados?.empresa ?? {};
  if (!est?.cnpj) return undefined;
  const d = est.descricoes ?? {};
  // A Receita manda as secundárias como "4930201,4930202"; descrição quando o cnpj.ai trouxer (por código ou em lista).
  const codes = (est.cnae_fiscal_secundaria ?? '').split(/[,;\s]+/).filter(Boolean);
  const descs = (d.cnae_fiscal_secundaria ?? '').split(/\s*[;|]\s*/).filter(Boolean);
  const simples = emp.simples;
  return {
    cnpj: est.cnpj,
    unit: d.identificador_matriz_filial,
    situationSince: est.data_situacao_cadastral ?? undefined,
    startDate: est.data_inicio_atividade ?? undefined,
    legalNature: emp.descricoes?.natureza_juridica || undefined,
    capital: emp.capital_social ?? undefined,
    simples: simples ? { simples: simples.opcao_simples ?? null, simplesSince: simples.data_opcao_simples ?? undefined, mei: simples.opcao_mei ?? null } : undefined,
    baseMonth: b.meta?.competencia_receita ?? undefined,
    mainActivity: est.cnae_fiscal_principal ? { code: est.cnae_fiscal_principal, desc: d.cnae_fiscal_principal } : undefined,
    otherActivities: codes.map((code, i) => ({ code, desc: d[code] ?? (descs.length === codes.length ? descs[i] : undefined) })),
    address: [[est.tipo_logradouro, est.logradouro].filter(Boolean).join(' '), est.numero, est.complemento, est.bairro].filter(Boolean).join(', ') + (d.municipio ? ` — ${d.municipio}/${est.uf ?? ''}` : '') + (est.cep ? ` · CEP ${est.cep}` : '') || undefined,
    phones: [phoneOf(est.ddd1, est.telefone1), phoneOf(est.ddd2, est.telefone2)].filter((x): x is string => !!x),
    partners: (emp.socios?.itens ?? []).map((s) => ({
      name: s.nome_socio_razao_social ?? '—',
      type: s.descricoes?.identificador_socio,
      role: s.descricoes?.qualificacao_socio,
      age: AGE[Number(s.faixa_etaria)] || undefined,
      since: s.data_entrada_sociedade ?? undefined,
    })),
    partnersTotal: emp.socios?.total ?? emp.socios?.itens?.length ?? 0,
    sources: Object.entries(b.dados?.registros_publicos ?? {}).flatMap(([group, list]) =>
      Object.values(list).map((p) => {
        const [org, name] = (p.proveniencia?.fonte ?? '').split(' — ');
        return { group: SOURCE_GROUPS[group] ?? group, org: name ? org : '', name: name ?? org, status: p.status, total: p.total ?? p.itens?.length ?? 0, date: p.competencia ?? p.carregada_em ?? undefined, items: p.itens ?? [] };
      })
    ),
  };
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

/** cnpj.ai quando há chave; senão BrasilAPI (pública). Simulado só em testes ou se COMPANY_REGISTRY_PROVIDER=mock. */
export function createCompanyRegistryProvider(): CompanyRegistryProvider {
  if (env.APP_ENV === 'test' || env.COMPANY_REGISTRY_PROVIDER === 'mock') return new MockCompanyRegistryProvider();
  return env.CNPJ_AI_API_KEY ? new CnpjAiProvider(env.CNPJ_AI_API_KEY) : new RealCompanyRegistryProvider();
}
