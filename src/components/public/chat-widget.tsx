'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

type Msg = { id: string; from: 'me' | 'bot' | 'human'; name: string | null; text: string; at: string };

/** Chat público (canal WEB) — responsivo, tela cheia no celular. */
export function ChatWidget({ token, onClose }: { token: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [mode, setMode] = useState('AI');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return; // evita abrir (e saudar) duas vezes
    opened.current = true;
    api<{ mode: string; messages: Msg[] }>('/public/chat', { body: { token } })
      .then((r) => {
        setMessages(r.messages);
        setMode(r.mode);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [token]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, from: 'me', name: null, text: t, at: new Date().toISOString() }]);
    setBusy(true);
    try {
      const r = await api<{ mode: string; messages: Msg[] }>('/public/chat', { body: { token, text: t } });
      setMessages(r.messages);
      setMode(r.mode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 sm:w-[380px] sm:h-[600px] sm:max-h-[calc(100vh-40px)] bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200" role="dialog" aria-label="Chat">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#131c17] text-white">
        <span className="grid place-items-center size-9 rounded-full bg-[#131c17] font-bold text-sm">AI</span>
        <div className="leading-tight flex-1">
          <b className="text-sm">{mode === 'HUMAN' ? 'Consultor' : 'Assistente virtual'}</b>
          <div className="text-[11px] text-slate-300">{mode === 'HUMAN' ? 'Atendimento humano' : 'Atendimento automatizado · um consultor pode assumir'}</div>
        </div>
        <button onClick={onClose} className="size-8 rounded-lg hover:bg-white/10" aria-label="Fechar chat">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={m.from === 'me' ? 'flex justify-end' : 'flex'}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${m.from === 'me' ? 'bg-[#131c17] text-white rounded-br-md' : m.from === 'human' ? 'bg-emerald-50 border border-emerald-200 rounded-bl-md' : 'bg-white border border-slate-200 rounded-bl-md'}`}>
              {m.from === 'human' && <div className="text-[11px] font-semibold text-emerald-700">{m.name ?? 'Consultor'}</div>}
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex">
            <div className="rounded-2xl bg-white border border-slate-200 px-3.5 py-2.5 text-slate-400 text-sm">digitando…</div>
          </div>
        )}
        {error && <div className="text-xs text-red-600 text-center">{error}</div>}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 p-3 border-t border-slate-200 bg-white"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Escreva sua mensagem…" className="flex-1 h-10 rounded-full border border-slate-300 px-4 text-[15px] focus:outline-none focus:border-[#2f9e5b]" aria-label="Mensagem" />
        <button className="size-10 rounded-full bg-[#131c17] text-white disabled:opacity-50" disabled={busy || !text.trim()} aria-label="Enviar">
          ➤
        </button>
      </form>
    </div>
  );
}
