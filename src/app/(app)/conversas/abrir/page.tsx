import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCtx } from '@/modules/auth/session';
import { leadScope } from '@/modules/leads/scope';
import { getOrCreateConversation } from '@/modules/conversations/conversation.service';

/** "Chamar no Inbox": abre (ou cria) a conversa de WhatsApp do lead e leva o consultor até ela. */
export default async function OpenInbox({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('conversation.read');
  const id = (await searchParams).lead ?? '';
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id }, select: { id: true } });
  if (!lead) notFound();
  const { conversation } = await getOrCreateConversation(ctx.orgId, lead.id);
  redirect(`/conversas?c=${conversation.id}`);
}
