import type { Prisma } from '@prisma/client';
import type { Ctx } from '../auth/context';

// Isolamento de dados: todo acesso a leads/oportunidades/conversas passa por estes filtros.
// 1) tenant (organizationId) SEMPRE; 2) escopo do perfil (ORG / PJ / OWN).

export function leadScope(ctx: Ctx): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { organizationId: ctx.orgId, deletedAt: null };
  if (ctx.scope === 'PJ') return { ...base, pjId: ctx.pjId ?? '__none__' };
  if (ctx.scope === 'OWN') return { ...base, consultantId: ctx.consultantId ?? '__none__' };
  return base;
}

export function opportunityScope(ctx: Ctx): Prisma.OpportunityWhereInput {
  const base: Prisma.OpportunityWhereInput = { organizationId: ctx.orgId };
  if (ctx.scope === 'PJ') return { ...base, pjId: ctx.pjId ?? '__none__' };
  if (ctx.scope === 'OWN') return { ...base, consultantId: ctx.consultantId ?? '__none__' };
  return base;
}

export function conversationScope(ctx: Ctx): Prisma.ConversationWhereInput {
  const base: Prisma.ConversationWhereInput = { organizationId: ctx.orgId };
  if (ctx.scope === 'ORG') return base;
  return { ...base, lead: leadScope(ctx) };
}

export function taskScope(ctx: Ctx): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { organizationId: ctx.orgId };
  if (ctx.scope === 'PJ') return { ...base, OR: [{ lead: { pjId: ctx.pjId ?? '__none__' } }, { assigneeUserId: ctx.userId }] };
  if (ctx.scope === 'OWN') return { ...base, OR: [{ consultantId: ctx.consultantId ?? '__none__' }, { assigneeUserId: ctx.userId }] };
  return base;
}
