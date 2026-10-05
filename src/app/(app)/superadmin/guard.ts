import { redirect } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';

/** Páginas do Super Admin: só a equipe que mantém a plataforma (nem o Admin do cliente). */
export async function requireSuperAdmin() {
  const ctx = await requireCtx();
  if (ctx.roleKey !== 'SUPER_ADMIN') redirect('/sem-acesso');
  return ctx;
}
