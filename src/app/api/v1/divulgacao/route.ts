import { authed } from '@/lib/api';
import { myOutreach } from '@/modules/outreach/outreach.service';

/** GET /api/v1/divulgacao — kit do dia, canais e indicações do consultor logado (com leads e vendas de cada link). */
export const GET = authed({}, async ({ ctx }) => myOutreach(ctx));
