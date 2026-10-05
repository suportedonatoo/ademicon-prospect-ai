import { body, publicRoute } from '@/lib/api';
import { runPublicSimulation } from '@/modules/simulators/simulator.service';

/** POST /api/v1/public/simulations — SimulationCreated → LeadCreated → LeadScored → LeadRouted. */
export const POST = publicRoute({ rate: 10, key: 'simulation' }, async ({ req, meta }) => runPublicSimulation(await body(req), meta));
