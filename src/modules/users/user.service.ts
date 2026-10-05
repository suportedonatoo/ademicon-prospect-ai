import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, Conflict, Forbidden, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { hashPassword } from '../auth/auth.service';
import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES } from '../roles/permissions';

export const userInput = z.object({
  name: z.string().min(3).max(120),
  email: z.string().email(),
  roleKey: z.string(),
  pjId: z.string().nullable().optional(),
  consultantId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
});

export async function listUsers(ctx: Ctx) {
  assertCan(ctx, 'user.read');
  return db.user.findMany({
    where: { organizationId: ctx.orgId },
    include: { role: true, pj: { select: { code: true } }, consultant: { select: { name: true } } },
    orderBy: [{ role: { key: 'asc' } }, { name: 'asc' }],
  });
}

export async function saveUser(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'user.manage');
  const input = userInput.parse(raw);
  const role = await db.role.findFirst({ where: { organizationId: ctx.orgId, key: input.roleKey } });
  if (!role) throw BadRequest('Perfil inválido.');
  if (role.key === 'SUPER_ADMIN' && ctx.roleKey !== 'SUPER_ADMIN') throw Forbidden('Somente Super Admin pode conceder esse perfil.');
  if (role.key === 'PJ_MANAGER' && !input.pjId) throw BadRequest('Gestor de PJ precisa de uma PJ.');
  if (role.key === 'CONSULTANT' && !input.consultantId) throw BadRequest('Consultor precisa estar vinculado a um cadastro de consultor.');
  const data = { name: input.name, email: input.email.toLowerCase(), roleId: role.id, pjId: input.pjId || null, consultantId: input.consultantId || null, status: input.status };

  if (id) {
    const user = await db.user.update({ where: { id, organizationId: ctx.orgId }, data });
    if (input.status === 'DISABLED') await db.session.deleteMany({ where: { userId: id } });
    await audit(ctx, 'user.changed', { type: 'User', id }, { action: 'updated', role: role.key, status: input.status });
    return { user, tempPassword: null };
  }
  if (await db.user.findUnique({ where: { email: data.email } })) throw Conflict('E-mail já cadastrado.');
  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const user = await db.user.create({ data: { organizationId: ctx.orgId, ...data, passwordHash: await hashPassword(tempPassword) } });
  await audit(ctx, 'user.changed', { type: 'User', id: user.id }, { action: 'created', role: role.key });
  return { user, tempPassword };
}

export async function listRolesWithPermissions(ctx: Ctx) {
  assertCan(ctx, 'role.read');
  const roles = await db.role.findMany({ where: { organizationId: ctx.orgId }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { createdAt: 'asc' } });
  return {
    roles: roles.map((r) => ({ ...r, keys: r.permissions.map((p) => p.permission.key), scope: SYSTEM_ROLES[r.key as keyof typeof SYSTEM_ROLES]?.scope ?? 'OWN' })),
    catalog: ALL_PERMISSIONS.map((k) => ({ key: k, label: PERMISSIONS[k], module: k.split('.')[0] })),
  };
}

export async function setRolePermission(ctx: Ctx, roleId: string, permissionKey: string, granted: boolean) {
  assertCan(ctx, 'role.manage');
  const role = await db.role.findFirst({ where: { id: roleId, organizationId: ctx.orgId } });
  if (!role) throw NotFound('Perfil');
  if (role.key === 'SUPER_ADMIN') throw BadRequest('O perfil Super Admin sempre tem acesso total.');
  const permission = await db.permission.findUnique({ where: { key: permissionKey } });
  if (!permission) throw NotFound('Permissão');
  if (granted) await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId: permission.id } }, create: { roleId, permissionId: permission.id }, update: {} });
  else await db.rolePermission.deleteMany({ where: { roleId, permissionId: permission.id } });
  await audit(ctx, 'permission.changed', { type: 'Role', id: roleId }, { role: role.key, permission: permissionKey, granted });
}
