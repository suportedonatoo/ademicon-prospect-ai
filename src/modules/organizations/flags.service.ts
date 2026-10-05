import { db } from '@/lib/db';
import { BadRequest } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';

// FEATURE FLAGS por organização. Padrão: tudo ligado no ambiente de demonstração; em produção
// cada organização liga o que contratou. A tela e a API respeitam a flag (não só a UI).

export const FEATURE_FLAGS = {
  AI_COPILOT: 'Copilot do consultor (resumo, sugestão, objeção, próxima ação)',
  AI_REACTIVATION: 'Reativação inteligente de leads',
  CAMPAIGN_INTELLIGENCE: 'Campaign / Revenue Intelligence',
  ADVANCED_ATTRIBUTION: 'Atribuição avançada (modelos multi-toque)',
  BUSINESS_PROSPECTING: 'Prospecção de empresas',
  AI_INSIGHTS: 'AI Insights',
  ADVANCED_ROUTING: 'Roteamento avançado (capacidade e horário)',
  WEB_PUSH: 'Notificações push (celular / navegador)',
  BROWSER_EXTENSION: 'Extensão de navegador',
  EXPERIMENTS: 'Experimentos A/B',
} as const;
export type FlagKey = keyof typeof FEATURE_FLAGS;

const DEFAULT_ON: FlagKey[] = Object.keys(FEATURE_FLAGS) as FlagKey[];

export async function isEnabled(orgId: string, key: FlagKey): Promise<boolean> {
  const f = await db.featureFlag.findUnique({ where: { organizationId_key: { organizationId: orgId, key } } });
  return f ? f.enabled : DEFAULT_ON.includes(key);
}

export async function assertFlag(orgId: string, key: FlagKey) {
  if (!(await isEnabled(orgId, key))) throw BadRequest(`Recurso desativado para esta organização: ${FEATURE_FLAGS[key]}.`);
}

export async function listFlags(ctx: Ctx) {
  const rows = await db.featureFlag.findMany({ where: { organizationId: ctx.orgId } });
  return (Object.keys(FEATURE_FLAGS) as FlagKey[]).map((key) => {
    const r = rows.find((x) => x.key === key);
    return { key, label: FEATURE_FLAGS[key], enabled: r ? r.enabled : DEFAULT_ON.includes(key), updatedAt: r?.updatedAt ?? null };
  });
}

export async function setFlag(ctx: Ctx, key: string, enabled: boolean) {
  assertCan(ctx, 'settings.manage');
  if (!(key in FEATURE_FLAGS)) throw BadRequest('Flag inexistente.');
  const before = await isEnabled(ctx.orgId, key as FlagKey);
  await db.featureFlag.upsert({ where: { organizationId_key: { organizationId: ctx.orgId, key } }, create: { organizationId: ctx.orgId, key, enabled, updatedById: ctx.userId }, update: { enabled, updatedById: ctx.userId } });
  await db.configHistory.create({ data: { organizationId: ctx.orgId, area: 'flags', before: { [key]: before }, after: { [key]: enabled }, actorId: ctx.userId, actorName: ctx.userName } });
  await audit(ctx, 'flag.changed', { type: 'FeatureFlag', id: key }, { before, after: enabled });
  return listFlags(ctx);
}
