import { authed, body } from '@/lib/api';
import { listSimulators, saveSimulator } from '@/modules/simulators/simulator.service';

export const GET = authed({ permission: 'simulator.read' }, async ({ ctx }) => listSimulators(ctx));
export const POST = authed({ permission: 'simulator.configure' }, async ({ req, ctx }) => saveSimulator(ctx, await body(req)));
