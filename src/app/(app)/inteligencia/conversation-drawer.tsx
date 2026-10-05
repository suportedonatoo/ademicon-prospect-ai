'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass, cx } from '@/components/ui';
import { ModeBadge } from '@/components/badges';
import { firstName } from '@/lib/normalize';

type Msg = { id: string; direction: string; senderType: string; senderName: string | null; agentKey: string | null; content: string; createdAt: string };
type Conv = { id: string; mode: string; channel: string; messages: Msg[]; summaries: { content: string }[]; lead: { name: string } };

const AGENT: Record<string, string> = { PROSPECT: 'Prospect Agent', QUALIFICATION: 'Qualification Agent', CAMPAIGN: 'Campanha' };

/** Botão "Ver conversa" + painel lateral com o histórico e "Assumir conversa" (pausa a IA). */
export function ConversationButton({ conversationId, mode, canHandoff }: { conversationId: string; mode: string; canHandoff: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={buttonClass(mode === 'AI' ? 'secondary' : 'ghost', 'sm')} onClick={() => setOpen(true)}>
        Ver conversa
      </button>
      {open && <ConversationDrawer conversationId={conversationId} canHandoff={canHandoff} onClose={() => setOpen(false)} />}
    </>
  );
}

function ConversationDrawer({ conversationId, canHandoff, onClose }: { conversationId: string; canHandoff: boolean; onClose: () => void }) {
  const router = useRouter();
  const [conv, setConv] = useState<Conv | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setConv(await api<Conv>(`/conversations/${conversationId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [conv]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  async function takeOver() {
    setBusy(true);
    try {
      setConv(await api<Conv>(`/conversations/${conversationId}/takeover`, { method: 'POST' }));
      toast('Conversa assumida: a IA foi pausada e o consultor responde a partir de agora.');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const summary = conv?.summaries[0]?.content;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label="Conversa" className="animate-in h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        <header className="flex items-center justify-between gap-3 px-5 h-16 border-b border-line shrink-0">
          <div className="min-w-0">
            <b className="block truncate">{conv?.lead.name ?? 'Conversa'}</b>
            <span className="text-xs text-muted">{conv ? (conv.channel === 'WEB' ? 'Chat do site' : 'WhatsApp') : 'Carregando…'}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {conv && <ModeBadge mode={conv.mode} />}
            <button onClick={onClose} className="size-8 rounded-lg hover:bg-slate-100 text-muted" aria-label="Fechar">
              ✕
            </button>
          </div>
        </header>

        {summary && (
          <details className="border-b border-line px-5 py-3 text-sm shrink-0">
            <summary className="cursor-pointer font-medium">Resumo da IA</summary>
            <p className="mt-2 whitespace-pre-line text-ink-2 text-[13px]">{summary}</p>
          </details>
        )}

        <div className="flex-1 overflow-y-auto scroll-thin p-4 space-y-2.5 bg-slate-50">
          {error && <p className="text-sm text-bad">{error}</p>}
          {!conv && !error && <p className="text-sm text-muted">Carregando conversa…</p>}
          {conv?.messages.length === 0 && <p className="text-sm text-muted">Nenhuma mensagem ainda.</p>}
          {conv?.messages.map((m) =>
            m.senderType === 'SYSTEM' ? (
              <div key={m.id} className="text-center">
                <span className="inline-block text-[11.5px] text-muted bg-white border border-line rounded-full px-3 py-1">{m.content}</span>
              </div>
            ) : (
              <div key={m.id} className={m.direction === 'INBOUND' ? 'flex' : 'flex justify-end'}>
                <div className="max-w-[85%]">
                  <div
                    className={cx(
                      'rounded-2xl px-3.5 py-2 text-[14px] leading-snug',
                      m.direction === 'INBOUND' ? 'bg-white border border-line rounded-bl-md' : m.senderType === 'HUMAN' ? 'bg-ok-50 border border-emerald-200 rounded-br-md' : 'bg-ink text-white rounded-br-md'
                    )}
                  >
                    <div className="text-[10.5px] opacity-70 mb-0.5">
                      {m.senderType === 'LEAD' ? firstName(conv.lead.name) : m.senderType === 'HUMAN' ? (m.senderName ?? 'Consultor') : `IA · ${AGENT[m.agentKey ?? ''] ?? 'Agente'}`}
                    </div>
                    {m.content}
                  </div>
                  <div className={cx('mt-1 text-[10.5px] text-faint', m.direction !== 'INBOUND' && 'text-right')}>
                    {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            )
          )}
          <div ref={end} />
        </div>

        <footer className="border-t border-line p-4 space-y-2 shrink-0">
          {conv?.mode === 'AI' && canHandoff && (
            <>
              <button disabled={busy} onClick={takeOver} className={cx(buttonClass('primary'), 'w-full justify-center')}>
                {busy ? 'Assumindo…' : 'Assumir conversa (pausar IA)'}
              </button>
              <p className="text-xs text-muted text-center">A IA para de responder e o consultor continua o atendimento.</p>
            </>
          )}
          {conv?.mode === 'HUMAN' && <p className="text-xs text-muted text-center">Conversa com consultor ativo — a IA está pausada.</p>}
          <Link href={`/conversas?c=${conversationId}`} className={cx(buttonClass('secondary'), 'w-full justify-center')}>
            Abrir no Inbox para responder
          </Link>
        </footer>
      </aside>
    </div>
  );
}
