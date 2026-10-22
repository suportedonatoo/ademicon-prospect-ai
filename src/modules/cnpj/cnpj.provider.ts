import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { BusinessResult, CompanyRegistryProvider } from '../integrations/types';
import { cleanCnpj, isValidCnpj } from './cnpj-id';
import { FAIXA_ETARIA, PORTE, SITUACAO } from './layout';
import { LIVE } from './ddl';

// CONSULTA DE CNPJ em camadas, atrás de uma interface só:
//   memória (milissegundos) → base local da Receita (schema "cnpj") → cache da BrasilAPI (30 dias) → BrasilAPI.
// Enquanto a importação mensal não existir no banco, tudo cai na BrasilAPI com cache.

export type CnpjRecord = NonNullable<Awaited<ReturnType<CompanyRegistryProvider['lookupCnpj']>>> & {
  cnpj: string;
  matriz?: boolean;
  /** De onde veio: base local (com o mês) ou BrasilAPI. */
  source: string;
};

export interface CnpjProvider {
  name: string;
  lookup(cnpj: string): Promise<CnpjRecord | null>;
}

/** 4930202 → 4930-2/02 */
export const formatCnae = (c: string | null | undefined) => (c && /^\d{7}$/.test(c) ? `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}` : (c ?? ''));

type Row = {
  cnpj: string;
  matriz: boolean | null;
  nome_fantasia: string | null;
  situacao: string | null;
  data_inicio: Date | null;
  cnae_principal: string | null;
  cnae_desc: string | null;
  tipo_logradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  uf: string | null;
  municipio_nome: string | null;
  telefone1: string | null;
  telefone2: string | null;
  email: string | null;
  razao_social: string | null;
  capital_social: string | null;
  porte: string | null;
  natureza_juridica: string | null;
  natureza_desc: string | null;
  opcao_simples: boolean | null;
  opcao_mei: boolean | null;
  secundarios: { code: string; description: string | null }[] | null;
  socios: { nome: string; documento: string | null; qual: string | null; entrada: string | null; faixa: string | null; tipo: string | null }[] | null;
};

const LOOKUP_SQL = `
  SELECT e.cnpj, e.matriz, e.nome_fantasia, e.situacao, e.data_inicio, e.cnae_principal, c.descricao AS cnae_desc,
    e.tipo_logradouro, e.logradouro, e.numero, e.complemento, e.bairro, e.cep, e.uf, m.descricao AS municipio_nome,
    e.telefone1, e.telefone2, e.email, em.razao_social, em.capital_social::text AS capital_social, em.porte,
    em.natureza_juridica, n.descricao AS natureza_desc, s.opcao_simples, s.opcao_mei,
    (SELECT json_agg(json_build_object('code', x, 'description', c2.descricao)) FROM unnest(e.cnaes_secundarios) x LEFT JOIN ${LIVE}.cnae c2 ON c2.codigo = x) AS secundarios,
    (SELECT json_agg(json_build_object('nome', so.nome, 'documento', so.documento, 'qual', q.descricao, 'entrada', so.data_entrada, 'faixa', so.faixa_etaria, 'tipo', so.tipo) ORDER BY so.data_entrada)
       FROM ${LIVE}.socio so LEFT JOIN ${LIVE}.qualificacao q ON q.codigo = so.qualificacao WHERE so.cnpj_basico = e.cnpj_basico) AS socios
  FROM ${LIVE}.estabelecimento e
  LEFT JOIN ${LIVE}.empresa em ON em.cnpj_basico = e.cnpj_basico
  LEFT JOIN ${LIVE}.simples s ON s.cnpj_basico = e.cnpj_basico
  LEFT JOIN ${LIVE}.cnae c ON c.codigo = e.cnae_principal
  LEFT JOIN ${LIVE}.municipio m ON m.codigo = e.municipio
  LEFT JOIN ${LIVE}.natureza n ON n.codigo = em.natureza_juridica
  WHERE e.cnpj = $1`;

/** A base já foi importada? Quando sim, fica guardado (a troca de mês não apaga o schema "cnpj"). */
let ready = false;
async function baseReady() {
  if (ready) return true;
  const r = await db.$queryRawUnsafe<{ ok: boolean }[]>(`SELECT to_regclass('${LIVE}.estabelecimento') IS NOT NULL AND to_regclass('${LIVE}.meta') IS NOT NULL AS ok`);
  return (ready = !!r[0]?.ok);
}

const isMissingTable = (e: unknown) => /42P01|does not exist|não existe/.test(String((e as { code?: string })?.code ?? '') + String((e as Error)?.message ?? ''));

/** Mês e UFs da base carregada (null = base ainda não importada). */
export async function snapshotInfo(): Promise<{ month: string; ufs: string; counts: Record<string, number> } | null> {
  if (!(await baseReady())) return null;
  try {
    const rows = await db.$queryRawUnsafe<{ chave: string; valor: string }[]>(`SELECT chave, valor FROM ${LIVE}.meta`);
    const m = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
    return m.mes ? { month: m.mes, ufs: m.ufs ?? '', counts: JSON.parse(m.contagens ?? '{}') } : null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

export class LocalCnpjProvider implements CnpjProvider {
  name = 'Base CNPJ da Receita (local)';
  async lookup(cnpj: string): Promise<CnpjRecord | null> {
    if (!(await baseReady())) return null; // base ainda não importada
    let rows: Row[];
    try {
      rows = await db.$queryRawUnsafe<Row[]>(LOOKUP_SQL, cnpj);
    } catch (e) {
      if (isMissingTable(e)) return null; // base ainda não importada
      throw e;
    }
    const r = rows[0];
    if (!r) return null;
    return {
      cnpj: r.cnpj,
      matriz: r.matriz ?? undefined,
      legalName: r.razao_social ?? '',
      tradeName: r.nome_fantasia ?? undefined,
      cnae: r.cnae_principal ? `${formatCnae(r.cnae_principal)}${r.cnae_desc ? ` · ${r.cnae_desc}` : ''}` : undefined,
      size: r.porte ? PORTE[r.porte] : undefined,
      situation: r.situacao ? (SITUACAO[r.situacao] ?? r.situacao) : undefined,
      city: r.municipio_nome ?? undefined,
      uf: r.uf ?? undefined,
      phone: r.telefone1 ?? undefined,
      phone2: r.telefone2 ?? undefined,
      email: r.email ?? undefined,
      openedAt: r.data_inicio ? r.data_inicio.toISOString().slice(0, 10) : undefined,
      shareCapital: r.capital_social != null ? Number(r.capital_social) : undefined,
      legalNature: r.natureza_juridica ? `${r.natureza_juridica}${r.natureza_desc ? ` - ${r.natureza_desc}` : ''}` : undefined,
      address: [r.tipo_logradouro, r.logradouro, r.numero, r.complemento].filter(Boolean).join(' ') || undefined,
      neighborhood: r.bairro ?? undefined,
      cep: r.cep ?? undefined,
      simples: r.opcao_simples,
      mei: r.opcao_mei,
      secondaryCnaes: (r.secundarios ?? []).filter((c) => c.code).map((c) => ({ code: formatCnae(c.code), description: c.description ?? undefined })),
      // CPF do sócio já vem mascarado da Receita (***123456**): é guardado e mostrado assim.
      partners: (r.socios ?? []).filter((s) => s.nome).map((s) => ({ name: s.nome, role: s.qual ?? undefined, since: s.entrada ?? undefined, ageRange: s.faixa ? FAIXA_ETARIA[s.faixa] : undefined, document: s.documento ?? undefined })),
      source: this.name,
    };
  }
}

/** BrasilAPI com cache no banco (30 dias). */
export class CachedBrasilApiProvider implements CnpjProvider {
  name = 'BrasilAPI (cache)';
  static TTL_MS = 30 * 24 * 3600_000;
  constructor(private api: Pick<CompanyRegistryProvider, 'lookupCnpj'>) {}
  async lookup(cnpj: string): Promise<CnpjRecord | null> {
    const hit = await db.cnpjCache.findUnique({ where: { cnpj } });
    if (hit && Date.now() - hit.fetchedAt.getTime() < CachedBrasilApiProvider.TTL_MS) return hit.data as unknown as CnpjRecord;
    const r = await this.api.lookupCnpj(cnpj);
    if (!r) return null;
    const rec: CnpjRecord = { ...r, cnpj, source: 'BrasilAPI' };
    await db.cnpjCache.upsert({ where: { cnpj }, create: { cnpj, data: rec as object }, update: { data: rec as object, fetchedAt: new Date() } });
    return rec;
  }
}

/** Cache em memória do processo: consulta repetida responde sem ir ao banco. */
class MemoryCache {
  private map = new Map<string, { at: number; value: CnpjRecord | null }>();
  constructor(private max = 5000, private ttlMs = 10 * 60_000) {}
  get(k: string) {
    const v = this.map.get(k);
    if (!v || Date.now() - v.at > this.ttlMs) return undefined;
    this.map.delete(k);
    this.map.set(k, v); // mais recente no fim (LRU)
    return v.value;
  }
  set(k: string, value: CnpjRecord | null) {
    this.map.set(k, { at: Date.now(), value });
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
  clear() {
    this.map.clear();
  }
}

/**
 * Provider único de CNPJ do sistema (implementa o contrato antigo, então "Consultar CNPJ", o Agente
 * Pesquisador e a ficha da empresa passam a usar a base local sem mudar nada).
 */
export class LayeredCnpjProvider implements CompanyRegistryProvider, CnpjProvider {
  key = 'company_registry';
  name = 'Base CNPJ (Receita) + BrasilAPI';
  category = 'registry' as const;
  mode = 'real' as const;
  readonly memory = new MemoryCache();
  constructor(private layers: CnpjProvider[]) {}

  async healthCheck() {
    const snap = await snapshotInfo().catch(() => null);
    return {
      ok: true,
      mode: this.mode,
      detail: snap ? `Base local ${snap.month} (${snap.ufs || 'Brasil'}, ${snap.counts.estabelecimento ?? 0} estabelecimentos) + BrasilAPI` : 'Base local ainda não importada: consultas pela BrasilAPI com cache',
    };
  }

  async lookup(raw: string): Promise<CnpjRecord | null> {
    const cnpj = cleanCnpj(raw);
    if (!isValidCnpj(cnpj)) return null;
    const mem = this.memory.get(cnpj);
    if (mem !== undefined) return mem;
    for (const layer of this.layers) {
      try {
        const r = await layer.lookup(cnpj);
        if (r) {
          this.memory.set(cnpj, r);
          return r;
        }
      } catch (e) {
        logger.warn('cnpj.layer_failed', { layer: layer.name, error: String((e as Error).message ?? e).slice(0, 200) });
      }
    }
    return null;
  }

  lookupCnpj(cnpj: string) {
    return this.lookup(cnpj);
  }

  async search(): Promise<BusinessResult[]> {
    throw new Error('Busca por cidade/atividade na base CNPJ chega com o casamento Google → CNPJ (Fase 2). Use o Google Maps.');
  }
}
