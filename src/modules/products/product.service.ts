import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { PRODUCTS } from '../leads/catalog';

// PRODUCT CATALOG (§92) — produtos por organização, sem alterar código para expandir.
// O `key` é o código estável gravado em leads/oportunidades/simuladores (ex.: IMOVEL).
// Nenhum dado comercial (taxa, prazo, preço) é assumido aqui: só nome, categoria e configuração.

export const productInput = z.object({
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Código: letras maiúsculas, números e _ (ex.: PESADOS).'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  categoryKey: z.string().trim().max(40).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  config: z.object({ simulatorEnabled: z.boolean().optional(), knowledgeTags: z.array(z.string().max(40)).max(20).optional() }).partial().default({}),
});

/** Garante o catálogo inicial da organização (produtos que já existiam no código). Idempotente. */
export async function ensureProductCatalog(orgId: string) {
  const cat = await db.productCategory.upsert({
    where: { organizationId_key: { organizationId: orgId, key: 'CONSORCIO' } },
    create: { organizationId: orgId, key: 'CONSORCIO', name: 'Consórcio' },
    update: {},
  });
  const entries = Object.entries(PRODUCTS);
  await db.product.createMany({
    data: entries.map(([key, name], i) => ({ organizationId: orgId, categoryId: cat.id, key, name, sortOrder: i + 1 })),
    skipDuplicates: true,
  });
}

export async function listProducts(ctx: Ctx, opts: { activeOnly?: boolean } = {}) {
  return db.product.findMany({
    where: { organizationId: ctx.orgId, ...(opts.activeOnly ? { status: 'ACTIVE' } : {}) },
    include: { category: { select: { key: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/** Códigos aceitos para a organização. Sem catálogo cadastrado, vale o catálogo padrão. */
export async function activeProductKeys(orgId: string): Promise<string[]> {
  const rows = await db.product.findMany({ where: { organizationId: orgId, status: 'ACTIVE' }, select: { key: true } });
  return rows.length ? rows.map((r) => r.key) : Object.keys(PRODUCTS);
}

export async function assertProduct(orgId: string, key: string | null | undefined) {
  if (!key) return;
  const keys = await activeProductKeys(orgId);
  if (!keys.includes(key)) throw BadRequest(`Produto "${key}" não existe ou está inativo no catálogo.`);
}

export async function saveProduct(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'settings.manage');
  const input = productInput.parse(raw);
  const category = input.categoryKey
    ? await db.productCategory.upsert({
        where: { organizationId_key: { organizationId: ctx.orgId, key: input.categoryKey.toUpperCase() } },
        create: { organizationId: ctx.orgId, key: input.categoryKey.toUpperCase(), name: input.categoryKey },
        update: {},
      })
    : null;
  const data = { name: input.name, description: input.description ?? null, status: input.status, sortOrder: input.sortOrder, config: input.config as object, categoryId: category?.id ?? null };
  if (id) {
    const current = await db.product.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!current) throw NotFound('Produto');
    // O código não muda depois de criado: leads e oportunidades já o referenciam.
    const product = await db.product.update({ where: { id }, data });
    await audit(ctx, 'settings.changed', { type: 'Product', id }, { action: 'updated', before: { name: current.name, status: current.status }, after: { name: data.name, status: data.status } });
    return product;
  }
  const exists = await db.product.findFirst({ where: { organizationId: ctx.orgId, key: input.key } });
  if (exists) throw BadRequest('Já existe um produto com este código.');
  const product = await db.product.create({ data: { organizationId: ctx.orgId, key: input.key, ...data } });
  await audit(ctx, 'settings.changed', { type: 'Product', id: product.id }, { action: 'created', key: input.key });
  return product;
}
