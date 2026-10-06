import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { Unauthorized } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { roleScope } from '../roles/permissions';
import type { Ctx } from './context';
import { audit } from '../audit/audit.service';

export const SESSION_TTL_HOURS = 12;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Monta o contexto de um usuário a partir do banco (permissões vêm do perfil). */
export async function buildUserCtx(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<Ctx | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user || user.status !== 'ACTIVE') return null;
  return {
    orgId: user.organizationId,
    userId: user.id,
    userName: user.name,
    roleKey: user.role.key,
    scope: roleScope(user.role.key),
    permissions: new Set(user.role.permissions.map((rp) => rp.permission.key)),
    pjId: user.pjId,
    consultantId: user.consultantId,
    via: 'session',
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}

export async function login(email: string, password: string, meta: { ip?: string | null; userAgent?: string | null }) {
  await rateLimit(`login:${meta.ip || 'unknown'}`, 10, 300);
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = user && user.status === 'ACTIVE' && (await verifyPassword(password, user.passwordHash));
  if (!ok) {
    if (user) {
      await audit(
        { orgId: user.organizationId, userId: user.id, userName: user.name, roleKey: '', scope: 'OWN', permissions: new Set(), pjId: null, consultantId: null, via: 'session', ...meta },
        'auth.login_failed'
      );
    }
    throw Unauthorized('E-mail ou senha inválidos.');
  }
  const token = crypto.randomBytes(32).toString('base64url');
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600_000),
      ip: meta.ip ?? undefined,
      userAgent: meta.userAgent?.slice(0, 250) ?? undefined,
    },
  });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const ctx = (await buildUserCtx(user.id, meta))!;
  await audit(ctx, 'auth.login');
  return { token, ctx };
}

export async function ctxFromSessionToken(token: string | undefined | null, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.expiresAt < new Date()) return null;
  return buildUserCtx(session.userId, meta);
}

export async function logout(token: string | undefined | null) {
  if (!token) return;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session) return;
  const ctx = await buildUserCtx(session.userId);
  await db.session.delete({ where: { id: session.id } });
  if (ctx) await audit(ctx, 'auth.logout');
}

// ─── Chaves de API (integrações externas) ───

export async function createApiKey(ctx: Ctx, name: string, permissions: string[]) {
  const raw = `pk_${crypto.randomBytes(24).toString('base64url')}`;
  const key = await db.apiKey.create({
    data: { organizationId: ctx.orgId, name, prefix: raw.slice(0, 10), keyHash: sha256(raw), permissions, createdById: ctx.userId },
  });
  await audit(ctx, 'apikey.changed', { type: 'ApiKey', id: key.id }, { action: 'created', name, permissions });
  return { key, secret: raw }; // o segredo é exibido uma única vez
}

export async function ctxFromApiKey(raw: string, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<Ctx | null> {
  if (!raw.startsWith('pk_')) return null;
  const key = await db.apiKey.findUnique({ where: { keyHash: sha256(raw) } });
  if (!key || key.revokedAt) return null;
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return {
    orgId: key.organizationId,
    userId: null,
    userName: `API: ${key.name}`,
    roleKey: 'API_KEY',
    scope: 'ORG',
    permissions: new Set(key.permissions),
    pjId: null,
    consultantId: null,
    via: 'apikey',
    ...meta,
  };
}

/** Troca da própria senha. Confere a atual e encerra as outras sessões (a sessão em uso continua). */
export async function changePassword(ctx: Ctx, input: { current: string; next: string }, currentToken?: string | null) {
  if (!ctx.userId) throw Unauthorized('Entre na sua conta para trocar a senha.');
  await rateLimit(`password:${ctx.userId}`, 8, 15 * 60);
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!(await verifyPassword(input.current, user.passwordHash))) throw Unauthorized('A senha atual não confere.');
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.next) } });
  await db.session.deleteMany({ where: { userId: user.id, ...(currentToken ? { NOT: { tokenHash: sha256(currentToken) } } : {}) } });
  await audit(ctx, 'user.changed', { type: 'User', id: user.id }, { action: 'password_changed' });
}
