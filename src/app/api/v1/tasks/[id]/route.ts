import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { setTaskStatus } from '@/modules/tasks/task.service';

/** PATCH /api/v1/tasks/:id — { status: OPEN | DONE | CANCELED } */
export const PATCH = authed<{ id: string }>({ permission: 'task.update' }, async ({ req, ctx, params }) => {
  const { status } = z.object({ status: z.enum(['OPEN', 'DONE', 'CANCELED']) }).parse(await body(req));
  return setTaskStatus(ctx, params.id, status);
});
