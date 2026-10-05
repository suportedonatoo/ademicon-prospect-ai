import { authed, body } from '@/lib/api';
import { getSimulator, saveSimulator } from '@/modules/simulators/simulator.service';

export const GET = authed<{ id: string }>({ permission: 'simulator.read' }, async ({ ctx, params }) => getSimulator(ctx, params.id));
export const PATCH = authed<{ id: string }>({ permission: 'simulator.configure' }, async ({ req, ctx, params }) => saveSimulator(ctx, await body(req), params.id));
