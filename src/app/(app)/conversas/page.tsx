import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getConversation, inboxNumbers, listConversations } from '@/modules/conversations/conversation.service';
import { isAppError } from '@/lib/errors';
import { Inbox } from './inbox';
import { listConsultants } from '@/modules/consultants/consultant.service';
import { conversationState } from '@/modules/conversations/conversation.service';

export const metadata = { title: 'Inbox' };

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('conversation.read');
  const sp = await searchParams;
  const [list, numbers] = await Promise.all([listConversations(ctx, { mode: sp.mode, q: sp.q, numberId: sp.n, take: 80 }), inboxNumbers(ctx)]);
  const selectedId = sp.c;
  let selected = null;
  if (selectedId) {
    try {
      selected = await getConversation(ctx, selectedId);
    } catch (e) {
      if (!isAppError(e)) throw e;
    }
  }
  const consultants = can(ctx, 'lead.assign') ? await listConsultants(ctx) : [];
  return (
    <Inbox
      mode={sp.mode ?? ''}
      numberId={sp.n ?? ''}
      numbers={numbers.map((n) => ({ id: n.id, label: `${n.consultant ? `${n.consultant.name} · ` : ''}${n.name}`, down: n.status !== 'CONNECTED' || n.paused }))}
      perms={{ reply: can(ctx, 'conversation.reply'), handoff: can(ctx, 'conversation.handoff'), feedback: can(ctx, 'ai.feedback'), transfer: can(ctx, 'lead.assign') }}
      consultants={consultants.map((c) => ({ id: c.id, label: `${c.name} · ${c.pj.code} (${c.openLeads}/${c.maxOpenLeads})` }))}
      list={list.map((c) => ({
        id: c.id,
        name: c.lead.name,
        score: c.lead.score,
        temperature: c.lead.temperature,
        mode: c.mode,
        channel: c.channel,
        last: c.messages[0]?.content ?? '',
        number: c.number ? { name: c.number.name, down: c.number.status !== 'CONNECTED' || c.number.paused } : null,
        lastAt: c.lastMessageAt.toISOString(),
      }))}
      selected={
        selected && {
          id: selected.id,
          mode: selected.mode,
          state: conversationState(selected),
          channel: selected.channel,
          number: numbers.find((n) => n.id === selected.whatsappNumberId)?.name ?? null,
          currentAgent: selected.currentAgent,
          messages: selected.messages.map((m) => ({ id: m.id, direction: m.direction, senderType: m.senderType, senderName: m.senderName, agentKey: m.agentKey, content: m.content, status: m.status, aiExecutionId: m.aiExecutionId, createdAt: m.createdAt.toISOString() })),
          summary: selected.summaries[0]?.content ?? null,
          lead: {
            id: selected.lead.id,
            name: selected.lead.name,
            phone: selected.lead.phone,
            score: selected.lead.score,
            temperature: selected.lead.temperature,
            product: selected.lead.product,
            value: selected.lead.desiredValue,
            city: selected.lead.city,
            source: selected.lead.source,
            status: selected.lead.status,
            optOut: selected.lead.optOut,
            objections: selected.lead.memory?.objections ?? [],
            consultant: selected.lead.consultant ? `${selected.lead.consultant.name} · ${selected.lead.consultant.pj.code}` : null,
            opportunity: selected.lead.opportunities[0] ? { id: selected.lead.opportunities[0].id, stage: selected.lead.opportunities[0].stage.name, value: selected.lead.opportunities[0].value } : null,
          },
        }
      }
    />
  );
}
