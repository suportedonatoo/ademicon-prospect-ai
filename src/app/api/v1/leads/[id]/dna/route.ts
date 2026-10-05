import { authed } from '@/lib/api';
import { getLeadDNA } from '@/modules/lead-intelligence/intelligence-v2.service';

/** GET /api/v1/leads/:id/dna — Lead DNA (identidade, origem, interesse, sub-scores, intenção, sinais, objeções, NBA). */
export const GET = authed<{ id: string }>({ permission: 'lead.read' }, async ({ ctx, params }) => getLeadDNA(ctx, params.id));
