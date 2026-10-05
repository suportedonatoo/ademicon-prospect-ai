import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listRolesWithPermissions } from '@/modules/users/user.service';
import { Card, Notice, PageHeader } from '@/components/ui';
import { PermissionMatrix } from './matrix';

export const metadata = { title: 'Permissões' };

const SCOPE = { ORG: 'Organização', PJ: 'Própria PJ', OWN: 'Próprios leads' } as const;

export default async function PermissionsPage() {
  const ctx = await requireCtx('role.read');
  const { roles, catalog } = await listRolesWithPermissions(ctx);
  return (
    <>
      <PageHeader title="Permissões" crumb="Admin" subtitle="RBAC granular: cada ação exige uma permissão (ex.: lead.assign). Além da permissão, o escopo do perfil limita quais registros o usuário enxerga." />
      <Notice tone="blue">Alterações têm efeito imediato na próxima requisição e ficam registradas na auditoria (permission.changed). O perfil Super Admin sempre tem acesso total.</Notice>
      <Card className="mt-4" pad={false}>
        <PermissionMatrix
          canManage={can(ctx, 'role.manage')}
          roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, scope: SCOPE[r.scope as keyof typeof SCOPE], users: r._count.users, keys: r.keys }))}
          catalog={catalog}
        />
      </Card>
    </>
  );
}
