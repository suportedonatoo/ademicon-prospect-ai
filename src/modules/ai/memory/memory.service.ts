import { db } from '@/lib/db';
import type { ExtractedSlots, LeadFacts } from '../providers/types';

// Conversation Memory — memória ESTRUTURADA e mínima (somente o que é útil e permitido).
// Não guardamos conversas inteiras como "memória": apenas slots de negócio, objeções,
// preferências de contato, intenção e um resumo.

export async function getMemory(orgId: string, leadId: string) {
  return db.leadMemory.findFirst({ where: { organizationId: orgId, leadId } });
}

export async function mergeMemory(orgId: string, leadId: string, slots: ExtractedSlots & { intent?: string; summary?: string }) {
  // Controles de memória da organização: desligada → nada é guardado; só os campos permitidos.
  const { getOrgSettings } = await import('../../organizations/settings');
  const mem = (await getOrgSettings(orgId)).ai.memory;
  if (!mem.enabled) return null;
  const allowed = new Set<string>(mem.fields);
  const s = Object.fromEntries(Object.entries(slots).filter(([k]) => allowed.has(k === 'preferredChannel' ? 'preferences' : k))) as typeof slots;
  slots = s;
  const current = await getMemory(orgId, leadId);
  const keep = <T,>(field: string, v: T | null) => (allowed.has(field) ? v : null); // campo não permitido é apagado
  const objections = allowed.has('objections') ? Array.from(new Set([...(current?.objections ?? []), ...(slots.objections ?? [])])).slice(0, 10) : [];
  const preferences = allowed.has('preferences') ? { ...((current?.preferences as object) ?? {}), ...(slots.preferredChannel ? { preferredChannel: slots.preferredChannel } : {}) } : {};
  const data = {
    product: keep('product', slots.product ?? current?.product ?? null),
    objective: keep('objective', slots.objective ?? current?.objective ?? null),
    value: keep('value', slots.value ?? current?.value ?? null),
    city: keep('city', slots.city ?? current?.city ?? null),
    term: keep('term', slots.term ?? current?.term ?? null),
    objections,
    preferences,
    intent: keep('intent', slots.intent ?? current?.intent ?? null),
    summary: keep('summary', slots.summary ?? current?.summary ?? null),
  };
  return db.leadMemory.upsert({
    where: { leadId },
    create: { organizationId: orgId, leadId, ...data },
    update: data,
  });
}

type LeadRow = { name: string; product: string | null; objective: string | null; desiredValue: number | null; city: string | null; uf: string | null; term: string | null; score: number; temperature: string; source: string; intent: string | null; aiSummary: string | null; preferredChannel: string | null };

/** Nomes provisórios de cadastro (não são o nome real da pessoa — não usar na conversa). */
export const PLACEHOLDER_NAMES = ['Contato WhatsApp', 'Visitante do simulador', 'Titular anonimizado'];

/** Fatos consolidados (lead + memória) entregues aos agentes. */
export function buildLeadFacts(lead: LeadRow, memory: Awaited<ReturnType<typeof getMemory>>): LeadFacts & { preferredChannel?: string | null } {
  return {
    name: PLACEHOLDER_NAMES.some((p) => p.toLowerCase() === lead.name.toLowerCase()) ? null : lead.name,
    product: memory?.product ?? lead.product,
    objective: memory?.objective ?? lead.objective,
    value: memory?.value ?? lead.desiredValue,
    city: memory?.city ?? lead.city,
    uf: lead.uf,
    term: memory?.term ?? lead.term,
    objections: memory?.objections ?? [],
    score: lead.score,
    temperature: lead.temperature,
    source: lead.source,
    intent: memory?.intent ?? lead.intent,
    summary: memory?.summary ?? lead.aiSummary,
    preferredChannel: ((memory?.preferences as { preferredChannel?: string }) ?? {}).preferredChannel ?? lead.preferredChannel,
  };
}

export const PROSPECT_SLOTS = ['product', 'objective', 'value', 'city'] as const;
export const QUALIFICATION_SLOTS = ['product', 'value', 'city', 'objective', 'term', 'preferredChannel'] as const;

/** Nunca repetir perguntas: devolve apenas os slots ainda desconhecidos. */
export function missingSlots(facts: ReturnType<typeof buildLeadFacts>, agent: 'PROSPECT' | 'QUALIFICATION'): string[] {
  const slots = agent === 'PROSPECT' ? PROSPECT_SLOTS : QUALIFICATION_SLOTS;
  return slots.filter((s) => {
    const v = (facts as Record<string, unknown>)[s];
    return v == null || v === '';
  });
}

/** Retenção (§99): apaga memórias sem atualização há mais de retentionDays dias (ou todas, se a memória estiver desligada). */
export async function purgeExpiredMemory(orgId: string) {
  const { getOrgSettings } = await import('../../organizations/settings');
  const mem = (await getOrgSettings(orgId)).ai.memory;
  const where = mem.enabled ? { organizationId: orgId, updatedAt: { lt: new Date(Date.now() - mem.retentionDays * 86400_000) } } : { organizationId: orgId };
  return (await db.leadMemory.deleteMany({ where })).count;
}
