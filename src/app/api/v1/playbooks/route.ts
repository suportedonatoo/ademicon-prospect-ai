import { authed, body } from '@/lib/api';
import { listPlaybooks, savePlaybookVersion } from '@/modules/playbooks/playbook.service';

/** GET /api/v1/playbooks — Playbooks comerciais (versões, status e execuções). */
export const GET = authed({ permission: 'ai.read' }, async ({ ctx }) => listPlaybooks(ctx));

/** POST /api/v1/playbooks — salva NOVA versão (rascunho) de um playbook. */
export const POST = authed({ permission: 'ai.configure' }, async ({ req, ctx }) => savePlaybookVersion(ctx, await body(req)));
