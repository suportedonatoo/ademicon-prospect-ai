import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listUsers } from '@/modules/users/user.service';
import { db } from '@/lib/db';
import { SYSTEM_ROLES } from '@/modules/roles/permissions';
import { Avatar, Badge, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { UserForm } from './user-form';

export const metadata = { title: 'Usuários' };

export default async function UsersPage() {
  const ctx = await requireCtx('user.read');
  const [users, pjs, consultants] = await Promise.all([
    listUsers(ctx),
    db.pJ.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, code: true, city: true }, orderBy: { code: 'asc' } }),
    db.consultant.findMany({ where: { organizationId: ctx.orgId, user: null }, select: { id: true, name: true } }),
  ]);
  const canManage = can(ctx, 'user.manage');
  const roles = Object.entries(SYSTEM_ROLES).map(([key, r]) => ({ key, name: r.name }));
  return (
    <>
      <PageHeader title="Usuários" crumb="Admin" subtitle="Cada usuário tem um perfil (RBAC) e um escopo de dados. Preparado para MFA, SSO, OAuth e SAML." actions={canManage && <UserForm roles={roles} pjs={pjs.map((p) => ({ id: p.id, name: `${p.code} · ${p.city}` }))} consultants={consultants} />} />
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Usuário</Th>
              <Th>Perfil</Th>
              <Th>Escopo</Th>
              <Th>Status</Th>
              <Th>MFA</Th>
              <Th>Último acesso</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} size={30} />
                    <span>
                      <b className="font-medium block">{u.name}</b>
                      <span className="text-xs text-muted">{u.email}</span>
                    </span>
                  </div>
                </Td>
                <Td>{SYSTEM_ROLES[u.role.key as keyof typeof SYSTEM_ROLES]?.name ?? u.role.name}</Td>
                <Td className="text-xs text-ink-2">{u.consultant ? `Consultor: ${u.consultant.name}` : u.pj ? `PJ ${u.pj.code}` : 'Organização'}</Td>
                <Td>
                  <Badge tone={u.status === 'ACTIVE' ? 'green' : 'gray'}>{u.status === 'ACTIVE' ? 'Ativo' : 'Desativado'}</Badge>
                </Td>
                <Td className="text-xs text-muted">{u.mfaEnabled ? 'Ativo' : 'Preparado'}</Td>
                <Td className="text-xs text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'nunca'}</Td>
                <Td className="text-right">
                  {canManage && u.id !== ctx.userId && (
                    <UserForm
                      id={u.id}
                      roles={roles}
                      pjs={pjs.map((p) => ({ id: p.id, name: `${p.code} · ${p.city}` }))}
                      consultants={u.consultantId ? [{ id: u.consultantId, name: u.consultant?.name ?? '' }, ...consultants] : consultants}
                      initial={{ name: u.name, email: u.email, roleKey: u.role.key, pjId: u.pjId ?? '', consultantId: u.consultantId ?? '', status: u.status as 'ACTIVE' | 'DISABLED' }}
                    />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
