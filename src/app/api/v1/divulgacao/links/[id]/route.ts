import { authed } from '@/lib/api';
import { archiveTrackedLink } from '@/modules/outreach/outreach.service';

/** DELETE /api/v1/divulgacao/links/:id — arquiva o link (os leads que vieram por ele mantêm a origem). */
export const DELETE = authed<{ id: string }>({}, async ({ ctx, params }) => archiveTrackedLink(ctx, params.id));
