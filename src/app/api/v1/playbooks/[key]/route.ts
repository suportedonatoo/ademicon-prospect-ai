import { authed, query } from '@/lib/api';
import { getPlaybookVersion } from '@/modules/playbooks/playbook.service';

export const GET = authed<{ key: string }>({ permission: 'ai.read' }, async ({ req, ctx, params }) => getPlaybookVersion(ctx, params.key, query(req).version ? Number(query(req).version) : undefined));
