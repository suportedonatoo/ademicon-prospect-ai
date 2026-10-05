import { authed, body, query } from '@/lib/api';
import { createTask, listTasks } from '@/modules/tasks/task.service';

/** GET /api/v1/tasks?status=OPEN&mine=1&overdue=1 */
export const GET = authed({ permission: 'task.read' }, async ({ req, ctx }) => {
  const q = query(req);
  return listTasks(ctx, { status: q.status, mine: q.mine === '1', overdue: q.overdue === '1' });
});

/** POST /api/v1/tasks — cria tarefa. */
export const POST = authed({ permission: 'task.create', idempotent: true }, async ({ req, ctx }) => createTask(ctx, await body(req)));
