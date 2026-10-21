import { env } from '@/lib/env';
import type { CompanyRecord, CompanySearchFilters, CompanySearchProvider } from '../types';
import { int, pick, rng } from '../mock-random';

/**
 * BUSCA DE EMPRESAS POR FILTRO (CNAE + cidade + data de abertura) — fonte do Agente Pesquisador.
 * A base pública da Receita (BrasilAPI) só consulta um CNPJ conhecido; listar empresas por filtro exige
 * um serviço licenciado (ex.: Casa dos Dados). Enquanto a chave não chega, roda o provider de EXEMPLO.
 */

/** Casa dos Dados — PLACEHOLDER: o contrato da API só entra com a documentação oficial e a chave do plano. */
export class CasaDosDadosProvider implements CompanySearchProvider {
  key = 'company_search';
  name = 'Casa dos Dados';
  category = 'registry' as const;
  mode = 'placeholder' as const;
  async healthCheck() {
    return { ok: false, mode: this.mode, detail: 'Aguardando a chave do plano e a documentação oficial da API.' };
  }
  async searchCompanies(): Promise<CompanyRecord[]> {
    throw new Error('Casa dos Dados ainda não configurada: falta a chave do plano e a documentação oficial da API.');
  }
}

// ── Exemplo: empresas FICTÍCIAS no mesmo formato que a fonte paga devolve (para ver o agente funcionando) ──
const ACTIVITIES: [string, string, string][] = [
  ['4930-2/02', 'Transporte rodoviário de carga intermunicipal', 'Transportes'],
  ['4930-2/01', 'Transporte rodoviário de carga municipal', 'Logística'],
  ['4120-4/00', 'Construção de edifícios', 'Construtora'],
  ['4399-1/03', 'Obras de alvenaria', 'Engenharia'],
  ['8630-5/04', 'Atividade odontológica', 'Odonto'],
  ['8630-5/03', 'Atividade médica ambulatorial restrita a consultas', 'Clínica'],
  ['8640-2/02', 'Laboratórios clínicos', 'Laboratório'],
  ['4744-0/05', 'Comércio varejista de materiais de construção', 'Materiais'],
  ['4639-7/01', 'Comércio atacadista de produtos alimentícios', 'Distribuidora'],
  ['0161-0/03', 'Serviço de preparação de terreno, cultivo e colheita', 'Agro'],
  ['7711-0/00', 'Locação de automóveis sem condutor', 'Locadora'],
  ['8599-6/01', 'Formação de condutores', 'Autoescola'],
  ['6911-7/01', 'Serviços advocatícios', 'Advocacia'],
  ['6920-6/01', 'Atividades de contabilidade', 'Contabilidade'],
  ['5611-2/01', 'Restaurantes e similares', 'Restaurante'],
  ['9602-5/01', 'Cabeleireiros, manicure e pedicure', 'Studio'],
  ['4781-4/00', 'Comércio varejista de artigos do vestuário', 'Moda'],
  ['8011-1/01', 'Atividades de vigilância e segurança privada', 'Segurança'],
];
const NAMES = ['Horizonte', 'Aliança', 'Pioneira', 'Vale Verde', 'Serra Azul', 'Bandeirantes', 'Planalto', 'Litoral', 'Ipê', 'Jequitibá', 'Aurora', 'Monte Claro', 'Rio Novo', 'Estrela Guia', 'Cedro', 'Primavera'];
const FIRST = ['Carlos', 'Mariana', 'José', 'Fernanda', 'Ricardo', 'Patrícia', 'Eduardo', 'Juliana', 'Marcos', 'Renata', 'Paulo', 'Camila', 'André', 'Luciana'];
const LAST = ['Almeida', 'Ferreira', 'Rocha', 'Barbosa', 'Moreira', 'Carvalho', 'Teixeira', 'Gomes', 'Martins', 'Ribeiro', 'Lopes', 'Cardoso'];
const BAIRROS = ['Centro', 'Vila Nova', 'Jardim América', 'Distrito Industrial', 'Boa Vista', 'Santa Cruz', 'Parque das Flores'];
const DDD: Record<string, string> = { SP: '11', RJ: '21', MG: '31', PR: '41', SC: '48', RS: '51', DF: '61', GO: '62', BA: '71', PE: '81', CE: '85' };

export class SampleCompanySearchProvider implements CompanySearchProvider {
  key = 'company_search';
  name = 'Exemplo (empresas fictícias)';
  category = 'registry' as const;
  mode = 'mock' as const;
  async healthCheck() {
    return { ok: true, mode: this.mode, detail: 'Empresas FICTÍCIAS no formato da fonte paga — só para teste e demonstração.' };
  }
  async searchCompanies(f: CompanySearchFilters): Promise<CompanyRecord[]> {
    const page = f.page ?? 1;
    const r = rng(`company-search:${f.city}:${f.uf}:${page}`);
    const ddd = DDD[f.uf] ?? '11';
    return Array.from({ length: f.limit ?? 50 }, (_, i) => {
      const [cnae, description, prefix] = pick(r, ACTIVITIES);
      const nPartners = int(r, 0, 3);
      const capital = pick(r, [5_000, 20_000, 50_000, 100_000, 250_000, 500_000, 1_200_000, 3_000_000]);
      const years = int(r, 0, 25);
      // MEI/ME com capital baixo e algumas inativas, para o filtro do agente ter o que descartar.
      const size = capital >= 1_000_000 ? 'DEMAIS' : capital >= 250_000 ? 'EMPRESA DE PEQUENO PORTE' : capital <= 5_000 ? 'MEI' : 'MICRO EMPRESA';
      const seq = (page - 1) * (f.limit ?? 50) + i;
      return {
        // Prefixo 99 + sequência: CNPJ claramente fictício (não passa no dígito verificador).
        cnpj: `99${String(int(r, 100000, 999999))}${String(seq).padStart(4, '0')}00`,
        legalName: `${prefix} ${pick(r, NAMES)} ${pick(r, ['Ltda', 'Eireli', 'S.A.', 'ME'])}`,
        tradeName: r() < 0.6 ? `${prefix} ${pick(r, NAMES)}` : undefined,
        cnae,
        cnaeDescription: description,
        openedAt: new Date(Date.UTC(2026 - years, int(r, 0, 11), int(r, 1, 28))).toISOString().slice(0, 10),
        shareCapital: capital,
        size,
        situation: r() < 0.93 ? 'ATIVA' : 'BAIXADA',
        city: f.city,
        uf: f.uf,
        neighborhood: pick(r, BAIRROS),
        // Celular: DDD + 9 + 8 dígitos; fixo: DDD + 3 + 7 dígitos.
        phone: r() < 0.85 ? (r() < 0.6 ? `${ddd}9${String(int(r, 10000000, 99999999))}` : `${ddd}3${String(int(r, 1000000, 9999999))}`) : undefined,
        email: r() < 0.5 ? `contato@exemplo-${seq}.invalid` : undefined,
        partners: Array.from({ length: nPartners }, (_, k) => ({ name: `${pick(r, FIRST)} ${pick(r, LAST)}`, role: k === 0 ? 'Sócio-Administrador' : 'Sócio' })),
        sourceRef: `sample:${f.uf}:${f.city}:${seq}`,
      };
    });
  }
}

/** casadosdados com chave → placeholder (aguardando contrato); senão, exemplo. */
export function createCompanySearchProvider(): CompanySearchProvider {
  return env.COMPANY_SEARCH_PROVIDER === 'casadosdados' && env.COMPANY_SEARCH_API_KEY ? new CasaDosDadosProvider() : new SampleCompanySearchProvider();
}
