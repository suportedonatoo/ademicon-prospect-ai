import { db, type Tx } from '@/lib/db';

// Deduplicação por identidades normalizadas.
// Prioridade de correspondência: PHONE → EMAIL → CNPJ → EXTERNAL.

export type IdentityType = 'PHONE' | 'EMAIL' | 'CNPJ' | 'EXTERNAL';
export const IDENTITY_PRIORITY: IdentityType[] = ['PHONE', 'EMAIL', 'CNPJ', 'EXTERNAL'];

export interface IdentityKey {
  type: IdentityType;
  value: string;
}

export function identityKeys(input: { phone?: string | null; email?: string | null; cnpj?: string | null; externalId?: string | null; source?: string }): IdentityKey[] {
  const keys: IdentityKey[] = [];
  if (input.phone) keys.push({ type: 'PHONE', value: input.phone });
  if (input.email) keys.push({ type: 'EMAIL', value: input.email });
  if (input.cnpj) keys.push({ type: 'CNPJ', value: input.cnpj });
  if (input.externalId) keys.push({ type: 'EXTERNAL', value: `${input.source ?? 'EXT'}:${input.externalId}` });
  return keys;
}

/** Procura um lead existente na organização seguindo a prioridade das identidades. */
export async function findDuplicate(orgId: string, keys: IdentityKey[], tx: Tx = db) {
  if (!keys.length) return null;
  const found = await tx.leadIdentity.findMany({
    where: { organizationId: orgId, OR: keys.map((k) => ({ type: k.type, value: k.value })) },
    select: { leadId: true, type: true },
  });
  for (const type of IDENTITY_PRIORITY) {
    const hit = found.find((f) => f.type === type);
    if (hit) return { leadId: hit.leadId, matchedBy: type };
  }
  return null;
}

// Campos de identidade: só preenchemos se estiverem vazios (não sobrescrevemos dados conhecidos).
const FILL_IF_EMPTY = ['name', 'phone', 'email', 'company', 'cnpj', 'city', 'uf'] as const;
// Campos de interesse: o dado mais recente vence (o cliente pode ter mudado de ideia).
const PREFER_INCOMING = ['product', 'objective', 'desiredValue', 'term', 'region'] as const;

type Mergeable = Partial<Record<(typeof FILL_IF_EMPTY)[number] | (typeof PREFER_INCOMING)[number], string | number | null>>;

/** Função pura: calcula o que muda no lead existente ao receber um novo registro. */
export function computeMerge(existing: Mergeable, incoming: Mergeable) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const data: Record<string, unknown> = {};
  for (const f of FILL_IF_EMPTY) {
    const inc = incoming[f];
    if ((existing[f] == null || existing[f] === '') && inc != null && inc !== '') {
      data[f] = inc;
      changes[f] = { from: existing[f] ?? null, to: inc };
    }
  }
  for (const f of PREFER_INCOMING) {
    const inc = incoming[f];
    if (inc != null && inc !== '' && inc !== existing[f]) {
      data[f] = inc;
      changes[f] = { from: existing[f] ?? null, to: inc };
    }
  }
  return { data, changes };
}

/** Registra as identidades de um lead (ignora as que já existem). */
export async function registerIdentities(orgId: string, leadId: string, keys: IdentityKey[], tx: Tx = db) {
  if (!keys.length) return;
  await tx.leadIdentity.createMany({
    data: keys.map((k) => ({ organizationId: orgId, leadId, type: k.type, value: k.value })),
    skipDuplicates: true,
  });
}
