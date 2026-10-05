import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, roleScope, SYSTEM_ROLES } from '@/modules/roles/permissions';
import { can, systemCtx, type Ctx } from '@/modules/auth/context';
import { leadScope } from '@/modules/leads/scope';
import { canTransition, TRANSITIONS } from '@/modules/leads/state-machine';

const ctxFor = (role: keyof typeof SYSTEM_ROLES, extra: Partial<Ctx> = {}): Ctx => ({
  orgId: 'org1',
  userId: 'u1',
  userName: 'U',
  roleKey: role,
  scope: roleScope(role),
  permissions: new Set(SYSTEM_ROLES[role].permissions),
  pjId: 'pj1',
  consultantId: 'c1',
  via: 'session',
  ...extra,
});

describe('RBAC', () => {
  it('perfis têm permissões granulares coerentes', () => {
    expect(can(ctxFor('SUPER_ADMIN'), 'role.manage')).toBe(true);
    expect(can(ctxFor('CONSULTANT'), 'lead.read')).toBe(true);
    expect(can(ctxFor('CONSULTANT'), 'lead.assign')).toBe(false);
    expect(can(ctxFor('CONSULTANT'), 'analytics.read')).toBe(false);
    expect(can(ctxFor('MARKETING'), 'campaign.create')).toBe(true);
    expect(can(ctxFor('MARKETING'), 'opportunity.update')).toBe(false);
    expect(can(ctxFor('AI_ADMIN'), 'ai.configure')).toBe(true);
    expect(can(ctxFor('AI_ADMIN'), 'lead.assign')).toBe(false);
    expect(can(ctxFor('PJ_MANAGER'), 'lead.assign')).toBe(true);
    expect(can(ctxFor('MANAGER'), 'lead.delete')).toBe(false);
  });

  it('auditor é somente leitura', () => {
    const a = ctxFor('AUDITOR');
    expect(SYSTEM_ROLES.AUDITOR.permissions.every((p) => p.endsWith('.read'))).toBe(true);
    expect(can(a, 'audit.read')).toBe(true);
    expect(can(a, 'lead.update')).toBe(false);
  });

  it('contexto de sistema tem curinga, mas continua preso ao tenant', () => {
    const s = systemCtx('org9');
    expect(ALL_PERMISSIONS.every((p) => can(s, p))).toBe(true);
    expect(leadScope(s)).toMatchObject({ organizationId: 'org9' });
  });

  it('escopo de dados: organização, PJ e próprios leads', () => {
    expect(leadScope(ctxFor('MANAGER'))).toEqual({ organizationId: 'org1', deletedAt: null });
    expect(leadScope(ctxFor('PJ_MANAGER'))).toEqual({ organizationId: 'org1', deletedAt: null, pjId: 'pj1' });
    expect(leadScope(ctxFor('CONSULTANT'))).toEqual({ organizationId: 'org1', deletedAt: null, consultantId: 'c1' });
    // sem vínculo → não enxerga nada (nunca "tudo")
    expect(leadScope(ctxFor('CONSULTANT', { consultantId: null }))).toMatchObject({ consultantId: '__none__' });
  });
});

describe('Máquina de estados do lead', () => {
  it('transições válidas e inválidas', () => {
    expect(canTransition('NEW', 'QUALIFIED')).toBe(true);
    expect(canTransition('QUALIFIED', 'ASSIGNED')).toBe(true);
    expect(canTransition('OPPORTUNITY', 'CONVERTED')).toBe(true);
    expect(canTransition('CONVERTED', 'NEW')).toBe(false);
    expect(canTransition('NEW', 'CONVERTED')).toBe(false);
    expect(canTransition('BLOCKED', 'NEW')).toBe(true);
    expect(TRANSITIONS.CONVERTED).toEqual([]);
  });
});
