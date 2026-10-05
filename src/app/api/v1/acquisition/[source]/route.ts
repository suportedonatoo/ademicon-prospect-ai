import { authed, body } from '@/lib/api';
import { acquire } from '@/modules/leads/acquisition-engine';

/** POST /api/v1/acquisition/:source — entrada pelo AcquisitionEngine com o payload nativo da fonte
 *  (ex.: GOOGLE_ADS/META recebem { full_name, phone_number, email, city, lead_id, campaign }). */
export const POST = authed<{ source: string }>({ permission: 'lead.create', rate: 120, idempotent: true }, async ({ req, ctx, params }) => acquire(ctx, params.source.toUpperCase(), await body(req)));
