import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import { enqueue } from '@/lib/queue';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { chunkText, getEmbeddingProvider, toVectorLiteral, tokenize } from './embeddings';
import type { KnowledgeSnippet } from '../ai/providers/types';

export const KNOWLEDGE_CATEGORIES = {
  PRODUTOS: 'Produtos',
  CONSORCIO: 'Consórcio',
  CREDITO: 'Crédito',
  SEGUROS: 'Seguros',
  FAQ: 'FAQ',
  PROCESSOS: 'Processos',
  ATENDIMENTO: 'Atendimento',
  COMERCIAL: 'Comercial',
  OBJECOES: 'Objeções',
  POLITICAS: 'Políticas',
} as const;

/** Ciclo de vida do documento. Só PUBLISHED (vigente) alimenta a IA. ACTIVE = legado da V1 (tratado como PUBLISHED). */
export const KNOWLEDGE_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'EXPIRED', 'ARCHIVED'] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];
const TRANSITIONS: Record<KnowledgeStatus, KnowledgeStatus[]> = {
  DRAFT: ['REVIEW', 'PUBLISHED', 'ARCHIVED'],
  REVIEW: ['DRAFT', 'APPROVED', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
  PUBLISHED: ['DRAFT', 'ARCHIVED', 'EXPIRED'],
  EXPIRED: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};
export const normalizeKnowledgeStatus = (s: string): KnowledgeStatus => (s === 'ACTIVE' ? 'PUBLISHED' : (s as KnowledgeStatus));
export function canTransitionKnowledge(from: string, to: string) {
  const f = normalizeKnowledgeStatus(from);
  const t = normalizeKnowledgeStatus(to);
  return f === t || (TRANSITIONS[f] ?? []).includes(t);
}

export const documentInput = z.object({
  title: z.string().min(3).max(200),
  categoryKey: z.string(),
  source: z.string().min(2).max(300),
  ownerName: z.string().min(2).max(120),
  product: z.string().nullable().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  priority: z.coerce.number().int().min(0).max(10).default(0),
  content: z.string().min(20),
  changeNote: z.string().max(300).optional(),
});

export async function ensureCategories(orgId: string) {
  await db.knowledgeCategory.createMany({
    data: Object.entries(KNOWLEDGE_CATEGORIES).map(([key, name]) => ({ organizationId: orgId, key, name })),
    skipDuplicates: true,
  });
}

export async function listDocuments(ctx: Ctx, opts: { status?: string; categoryKey?: string; q?: string } = {}) {
  assertCan(ctx, 'knowledge.read');
  return db.knowledgeDocument.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.categoryKey ? { category: { key: opts.categoryKey } } : {}),
      ...(opts.q ? { title: { contains: opts.q, mode: 'insensitive' } } : {}),
    },
    include: { category: true, _count: { select: { chunks: true, versions: true } } },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  });
}

export async function getDocument(ctx: Ctx, id: string) {
  assertCan(ctx, 'knowledge.read');
  const doc = await db.knowledgeDocument.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { category: true, versions: { orderBy: { version: 'desc' } }, _count: { select: { chunks: true } } },
  });
  if (!doc) throw NotFound('Documento');
  return doc;
}

export async function createDocument(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'knowledge.manage');
  const input = documentInput.parse(raw);
  await ensureCategories(ctx.orgId);
  const category = await db.knowledgeCategory.findFirstOrThrow({ where: { organizationId: ctx.orgId, key: input.categoryKey } });
  const doc = await db.knowledgeDocument.create({
    data: {
      organizationId: ctx.orgId,
      categoryId: category.id,
      title: input.title,
      source: input.source,
      ownerName: input.ownerName,
      product: input.product || null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      priority: input.priority,
      status: 'DRAFT',
      currentVersion: 1,
      versions: { create: { organizationId: ctx.orgId, version: 1, content: input.content, changeNote: input.changeNote ?? 'Versão inicial', createdById: ctx.userId } },
    },
  });
  await audit(ctx, 'knowledge.changed', { type: 'KnowledgeDocument', id: doc.id }, { action: 'created', title: doc.title });
  return doc;
}

export async function updateDocument(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, 'knowledge.manage');
  const input = documentInput.parse(raw);
  const doc = await getDocument(ctx, id);
  const category = await db.knowledgeCategory.findFirstOrThrow({ where: { organizationId: ctx.orgId, key: input.categoryKey } });
  const latest = doc.versions[0];
  const contentChanged = latest?.content !== input.content;
  const nextVersion = contentChanged ? doc.currentVersion + 1 : doc.currentVersion;
  await db.knowledgeDocument.update({
    where: { id },
    data: {
      title: input.title,
      categoryId: category.id,
      source: input.source,
      ownerName: input.ownerName,
      product: input.product || null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      priority: input.priority,
      currentVersion: nextVersion,
      ...(contentChanged
        ? { versions: { create: { organizationId: ctx.orgId, version: nextVersion, content: input.content, changeNote: input.changeNote ?? 'Atualização', createdById: ctx.userId } } }
        : {}),
    },
  });
  await audit(ctx, 'knowledge.changed', { type: 'KnowledgeDocument', id }, { action: 'updated', version: nextVersion });
  if (normalizeKnowledgeStatus(doc.status) === 'PUBLISHED' && contentChanged) await enqueue('knowledge.index', { orgId: ctx.orgId, documentId: id });
  return getDocument(ctx, id);
}

export async function setDocumentStatus(ctx: Ctx, id: string, rawStatus: string) {
  assertCan(ctx, 'knowledge.manage');
  const status = normalizeKnowledgeStatus(rawStatus);
  if (!KNOWLEDGE_STATUSES.includes(status)) throw BadRequest('Status inválido.');
  const doc = await getDocument(ctx, id);
  if (!canTransitionKnowledge(doc.status, status)) throw BadRequest(`Transição não permitida: ${normalizeKnowledgeStatus(doc.status)} → ${status}.`);
  await db.knowledgeDocument.update({ where: { id }, data: { status } });
  // Só o que está PUBLICADO fica no índice do RAG.
  if (status === 'PUBLISHED') await enqueue('knowledge.index', { orgId: ctx.orgId, documentId: id });
  else await db.knowledgeChunk.deleteMany({ where: { documentId: id } });
  await audit(ctx, 'knowledge.changed', { type: 'KnowledgeDocument', id }, { action: 'status', from: doc.status, status });
}

/** Job diário: documentos publicados com validade vencida passam a EXPIRED e saem do RAG. */
export async function expireKnowledge(orgId: string) {
  const expired = await db.knowledgeDocument.findMany({ where: { organizationId: orgId, status: { in: ['PUBLISHED', 'ACTIVE'] }, validUntil: { lt: new Date() } }, select: { id: true } });
  if (!expired.length) return { expired: 0 };
  const ids = expired.map((d) => d.id);
  await db.$transaction([db.knowledgeDocument.updateMany({ where: { id: { in: ids } }, data: { status: 'EXPIRED' } }), db.knowledgeChunk.deleteMany({ where: { documentId: { in: ids } } })]);
  return { expired: ids.length };
}

/** Pipeline RAG: DOCUMENTO → CHUNKING → EMBEDDING → VECTOR STORAGE. */
export async function indexDocument(orgId: string, documentId: string) {
  const doc = await db.knowledgeDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!doc || !doc.versions[0]) return { chunks: 0 };
  const chunks = chunkText(doc.versions[0].content);
  // O título entra no embedding (melhora a busca), mas não no texto do trecho entregue ao agente.
  const vectors = await getEmbeddingProvider().embed(chunks.map((c) => `${doc.title}\n${c}`));
  await db.$transaction(async (tx) => {
    await tx.knowledgeChunk.deleteMany({ where: { documentId } });
    for (let i = 0; i < chunks.length; i++) {
      await tx.$executeRaw`
        INSERT INTO "KnowledgeChunk" ("id","organizationId","documentId","version","index","content","tokens","embedding","createdAt")
        VALUES (${`kc_${documentId}_${i}_${Date.now()}`}, ${orgId}, ${documentId}, ${doc.currentVersion}, ${i}, ${chunks[i]}, ${tokenize(chunks[i]).length}, ${toVectorLiteral(vectors[i])}::vector, now())`;
    }
  });
  return { chunks: chunks.length };
}

/** Termos da pergunta para a busca textual (OR), apenas letras/dígitos — sem sintaxe de tsquery injetável. */
export function lexicalQuery(query: string): string | null {
  const terms = Array.from(new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])).slice(0, 24);
  return terms.length ? terms.join(' | ') : null;
}

// Palavras que não dizem o ASSUNTO da pergunta (não contam para casar com o título).
const TITLE_STOP = new Set(
  'como funciona funcionam qual quais quanto quantos quando onde porque por que posso pode podem fazer isso esse essa este esta para sobre voce tem ter uma uns umas com mais meu minha minhas meus consorcio quero queria gostaria saber entender preciso tenho vou ser sao seria'.split(' ')
);
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const subjectTerms = (t: string) => Array.from(new Set(fold(t).match(/[a-z0-9]{3,}/g) ?? [])).filter((w) => !TITLE_STOP.has(w));

const titleWords = (title: string) => new Set(fold(title).match(/[a-z0-9]{3,}/g) ?? []);

/**
 * Bônus por título: num FAQ o título costuma ser a própria pergunta ("Objeção: é golpe?"). Perguntas curtas
 * pontuam pouco na busca vetorial, então quando as palavras do assunto aparecem no título o trecho sobe.
 * Palavras raras entre os títulos candidatos pesam mais ("atrasar" vale mais que "parcela", que aparece em vários).
 */
export function titleBonus(query: string, title: string, candidateTitles: string[] = [title]) {
  const q = subjectTerms(query);
  if (!q.length) return 0;
  const sets = candidateTitles.map(titleWords);
  const weight = (w: string) => 1 / Math.max(1, sets.filter((t) => t.has(w)).length);
  const total = q.reduce((n, w) => n + weight(w), 0);
  const words = titleWords(title);
  return 0.3 * (q.filter((w) => words.has(w)).reduce((n, w) => n + weight(w), 0) / total);
}

/**
 * RETRIEVAL híbrido: similaridade vetorial (pgvector, cosseno) + busca textual em português
 * (to_tsvector/ts_rank do Postgres). Só documentos PUBLICADOS e dentro da vigência (validFrom/validUntil).
 * A combinação resolve perguntas longas, em que o embedding sozinho se dilui.
 */
export async function searchKnowledge(orgId: string, query: string, opts: { topK?: number; product?: string | null } = {}): Promise<KnowledgeSnippet[]> {
  if (!query.trim()) return [];
  const [vector] = await getEmbeddingProvider().embed([query]);
  const topK = opts.topK ?? 4;
  const lex = lexicalQuery(query) ?? 'zzzz';
  const rows = await db.$queryRaw<{ chunkId: string; documentId: string; title: string; content: string; similarity: number; lexical: number; priority: number; product: string | null; category: string }[]>`
    SELECT c."id" AS "chunkId", d."id" AS "documentId", d."title", c."content", d."priority", d."product", k."key" AS "category",
           1 - (c."embedding" <=> ${toVectorLiteral(vector)}::vector) AS "similarity",
           ts_rank_cd(to_tsvector('portuguese', d."title" || ' ' || c."content"), to_tsquery('portuguese', ${lex}), 32) AS "lexical"
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
    JOIN "KnowledgeCategory" k ON k."id" = d."categoryId"
    WHERE c."organizationId" = ${orgId}
      AND d."status" IN ('PUBLISHED', 'ACTIVE')
      AND (d."validFrom" IS NULL OR d."validFrom" <= now())
      AND (d."validUntil" IS NULL OR d."validUntil" > now())
      AND c."embedding" IS NOT NULL
    ORDER BY (1 - (c."embedding" <=> ${toVectorLiteral(vector)}::vector))
           + 1.5 * ts_rank_cd(to_tsvector('portuguese', d."title" || ' ' || c."content"), to_tsquery('portuguese', ${lex}), 32)
           + 3 * ts_rank_cd(to_tsvector('portuguese', d."title"), to_tsquery('portuguese', ${lex}), 32) DESC
    LIMIT ${topK * 5}`;
  const titles = Array.from(new Set(rows.map((r) => r.title)));
  return rows
    .map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      title: r.title,
      content: r.content,
      category: r.category,
      score:
        Math.max(0, Number(r.similarity)) +
        1.5 * Number(r.lexical) +
        titleBonus(query, r.title, titles) +
        r.priority * 0.01 +
        (opts.product && r.product === opts.product ? 0.03 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function listGaps(ctx: Ctx, status = 'OPEN') {
  assertCan(ctx, 'ai.read');
  return db.knowledgeGap.findMany({ where: { organizationId: ctx.orgId, status }, orderBy: { createdAt: 'desc' }, take: 200 });
}

export async function resolveGap(ctx: Ctx, id: string, status: 'RESOLVED' | 'IGNORED') {
  assertCan(ctx, 'knowledge.manage');
  await db.knowledgeGap.updateMany({ where: { id, organizationId: ctx.orgId }, data: { status } });
}

export type KnowledgeDocumentWithMeta = Prisma.PromiseReturnType<typeof listDocuments>[number];
