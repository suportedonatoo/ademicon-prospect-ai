import { authed } from '@/lib/api';
import { listRolesWithPermissions } from '@/modules/users/user.service';

/** GET /api/v1/roles — perfis, escopo de dados e matriz de permissões. */
export const GET = authed({ permission: 'role.read' }, async ({ ctx }) => listRolesWithPermissions(ctx));
