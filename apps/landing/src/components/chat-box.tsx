'use client';

import { useEffect, useRef, useState } from 'react';
import { getSessionKey, post } from './session';

type Msg = { id: string; from: 'me' | 'bot' | 'human'; name?: string | null; text: string };

/**
 * Chat do card do simulador.
 * - mode="visitor": BOT 1 — visitante anônimo ("Simular apenas" → FRIO). Sem dados pessoais.
 * - mode="lead":    BOT 2 — lead com interesse (MORNO/QUENTE), conversa real que chega ao consultor.
 */
export function ChatBox({
  mode,
  site,
  token,
  product,
  pjName,
  onInterest,
}: {
  mode: 'visitor' | 'lead';
  site: string;
  token?: string;
  product?: string;
  pjName: string;
  onInterest?: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(() =>
    mode === 'visitor'
      ? [{ id: 'hello', from: 'bot', text: `Oi! Sou o assistente virtual da ${pjName}. Posso tirar dúvidas sobre consórcio — como funciona, lance, contemplação. Não precisa se identificar.` }]
      : []
  );
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [interest, setInterest] = useState(false);
  const [human, setHuman] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  // Bot 2: abre a conversa (o Maestro envia a saudação do Qualification Agent).
  useEffect(() => {
    if (mode !== 'lead' || !token || opened.current) return;
    opened.current = true;
    setBusy(true);
    post<{ mode: string; messages: Msg[] }>('/api/lead-chat', { site, token })
      .then((d) => {
        setMsgs(d.messages);
        setHuman(d.mode === 'HUMAN');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, [mode, site, token]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    setError('');
    setBusy(true);
    const mine: Msg = { id: `me-${Date.now()}`, from: 'me', text: t };
    setMsgs((m) => [...m, mine]);
    try {
      if (mode === 'visitor') {
        const history = msgs.filter((m) => m.id !== 'hello').slice(-10).map((m) => ({ role: m.from === 'me' ? 'visitor' : 'bot', text: m.text }));
        const r = await post<{ reply: string; suggestInterest: boolean }>('/api/visitor-chat', { site, sessionKey: getSessionKey() ?? undefined, message: t, product, history });
        setMsgs((m) => [...m, { id: `bot-${Date.now()}`, from: 'bot', text: r.reply }]);
        if (r.suggestInterest) setInterest(true);
      } else {
        const d = await post<{ mode: string; messages: Msg[] }>('/api/lead-chat', { site, token, text: t });
        setMsgs(d.messages);
        setHuman(d.mode === 'HUMAN');
      }
    } catch (err) {
      setError((err as Error).message);
      setMsgs((m) => m.filter((x) => x.id !== mine.id));
      setText(t);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-canvas px-3 py-2 text-xs">
        <b className="text-ink">{mode === 'visitor' ? 'Tire suas dúvidas' : human ? 'Consultor da unidade' : 'Assistente virtual'}</b>
        <span className="text-muted">{mode === 'visitor' ? 'anônimo · assistente virtual' : human ? 'atendimento humano' : 'a unidade acompanha esta conversa'}</span>
      </div>
      <div className="h-56 overflow-y-auto px-3 py-2 space-y-2 bg-white" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={m.from === 'me' ? 'flex justify-end' : 'flex'}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13.5px] leading-snug ${m.from === 'me' ? 'bg-brand-500 text-white rounded-br-md' : m.from === 'human' ? 'bg-ok-50 border border-emerald-200 rounded-bl-md' : 'bg-canvas rounded-bl-md'}`}>
              {m.from === 'human' && m.name && <div className="text-[10.5px] opacity-70">{m.name}</div>}
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-muted">digitando…</div>}
        <div ref={end} />
      </div>
      {interest && onInterest && (
        <button type="button" onClick={onInterest} className="w-full bg-brand-50 text-brand-700 text-sm font-bold py-2 hover:bg-brand-100">
          Simulação com interesse →
        </button>
      )}
      {error && (
        <p className="px-3 py-1 text-xs text-bad" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={send} className="flex gap-2 border-t border-line p-2">
        <input
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder={mode === 'visitor' ? 'Ex.: como funciona o lance?' : 'Escreva sua mensagem'}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          aria-label="Mensagem"
        />
        <button disabled={busy || !text.trim()} className="rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold px-3">
          Enviar
        </button>
      </form>
    </div>
  );
}
