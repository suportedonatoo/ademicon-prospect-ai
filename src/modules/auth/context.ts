import type { DataScope, PermissionKey } from '../roles/permissions';
import { Forbidden } from '@/lib/errors';

/**
 * Contexto de execução de toda operação de domínio.
 * Carrega a organização (tenant), o ator e suas permissões/escopo.
 * Nenhum serviço acessa dados sem um Ctx.
 */
export interface Ctx {
  orgId: string;
  userId: string | null;
  userName: string;
  roleKey: string;
  scope: DataScope;
  permissions: Set<string>;
  pjId: string | null;
  consultantId: string | null;
  via: 'session' | 'apikey' | 'system' | 'public' | 'device';
  /** Dispositivo (extensão) que autenticou a requisição, quando via = 'device'. */
  deviceId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export function can(ctx: Ctx, permission: PermissionKey): boolean {
  return ctx.permissions.has('*') || ctx.permissions.has(permission);
}

export function assertCan(ctx: Ctx, permission: PermissionKey): void {
  if (!can(ctx, permission)) throw Forbidden(`Permissão necessária: ${permission}`);
}

/** Contexto de sistema (jobs, webhooks, automações) — acesso total restrito à organização. */
export function systemCtx(orgId: string, label = 'Sistema'): Ctx {
  return {
    orgId,
    userId: null,
    userName: label,
    roleKey: 'SYSTEM',
    scope: 'ORG',
    permissions: new Set(['*']),
    pjId: null,
    consultantId: null,
    via: 'system',
  };
}

/** Contexto público (landing pages, simulador) — só pode criar leads/simulações. */
export function publicCtx(orgId: string, ip?: string | null, userAgent?: string | null): Ctx {
  return {
    orgId,
    userId: null,
    userName: 'Visitante',
    roleKey: 'PUBLIC',
    scope: 'ORG',
    permissions: new Set(['lead.create', 'simulator.read', 'landing.read']),
    pjId: null,
    consultantId: null,
    via: 'public',
    ip,
    userAgent,
  };
}
