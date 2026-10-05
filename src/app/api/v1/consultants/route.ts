import { authed, body, query } from '@/lib/api';
import { listConsultants, saveConsultant } from '@/modules/consultants/consultant.service';

export const GET = authed({ permission: 'consultant.read' }, async ({ req, ctx }) => listConsultants(ctx, query(req)));
export const POST = authed({ permission: 'consultant.manage' }, async ({ req, ctx }) => saveConsultant(ctx, await body(req)));
