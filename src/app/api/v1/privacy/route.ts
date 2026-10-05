import { authed } from '@/lib/api';
import { privacyOverview } from '@/modules/privacy/privacy.service';

/** GET /api/v1/privacy — consentimentos, opt-outs, solicitações e eventos de privacidade. */
export const GET = authed({ permission: 'privacy.read' }, async ({ ctx }) => privacyOverview(ctx));
