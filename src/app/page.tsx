import { redirect } from 'next/navigation';
import { getCtx } from '@/modules/auth/session';
import { homeFor } from '@/components/nav';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const ctx = await getCtx();
  redirect(ctx ? homeFor(ctx.roleKey, ctx.permissions) : '/login');
}
