'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Avatar, Badge, KV, buttonClass, cx } from '@/components/ui';
import { ModeBadge, ScoreBadge, TempBadge } from '@/components/badges';
import { brl, timeAgo } from '@/lib/format';
import { formatPhone, firstName } from '@/lib/normalize';
import { productLabel, sourceLabel } from '@/modules/leads/catalog';
import { Modal, inputClass } from '@/components/client';
import { CopilotPanel, SendToPhoneButton } from '@/components/v2-client';
import { NBA_ACTIONS } from '@/modules/lead-intelligence/nba-engine';

type Item = { id: string; name: string; score: number; temperature: string; mode: string; channel: string; last: string; lastAt: string; number: { name: string; down: boolean } | null };
type NumberOpt = { id: string; label: string; down: boolean };
type Msg = { id: string; direction: string; senderType: string; senderName: string | null; agentKey: string | null; content: string; status: string; aiExecutionId: string | null; createdAt: string };
type Selected = {
  id: string;
  mode: string;
  state: 'BOT_ACTIVE' | 'HUMAN_ACTIVE' | 'PAUSED' | 'CLOSED';
  channel: string;
  number: string | null;
  currentAgent: string | null;
  messages: Msg[];
  summary: string | null;
  lead: { id: string; name: string; phone: string | null; score: number; temperature: string; product: string | null; value: number | null; city: string | null; source: string; status: string; optOut: boolean; objections: string[]; consultant: string | null; opportunity: { id: string; stage: string; value: number } | null };
};

const AGENT = { PROSPECT: 'Prospect Agent', QUALIFICATION: 'Qualification Agent', CAMPAIGN: 'Campanha' } as Record<string, string>;
const STATE: Record<Selected['state'], [string, string]> = { BOT_ACTIVE: ['IA ativa', 'text-violet-600'], HUMAN_ACTIVE: ['Consultor ativo', 'text-ok'], PAUSED: ['IA pausada', 'text-warn'], CLOSED: ['Encerrada', 'text-muted'] };

type Battlecard = {
  lead: { name: string; temperature: string; score: number; objective: string | null; desiredValue: number | null; product: string | null };
  intent: { label: string; evidence: string; confidence: number } | null;
  objections: string[];
  signals: { type: string; label: string }[];
  nextBestAction: { action: string; reason: string; priority: string } | null;
  talkingPoints: { text: string; source: string }[];
  method: string;
};

export function Inbox({
  list,
  selected,
  mode,
  numberId = '',
  numbers = [],
  perms,
  consultants,
}: {
  list: Item[];
  selected: Selected | null;
  mode: string;
  numberId?: string;
  numbers?: NumberOpt[];
  perms: { reply: boolean; handoff: boolean; feedback: boolean; transfer: boolean };
  consultants: { id: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState('');
  const [asClient, setAsClient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rated, setRated] = useState<Record<string, string>>({});
  const [card, setCard] = useState<Battlecard | null>(null);
  const [panel, setPanel] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [target, setTarget] = useState(consultants[0]?.id ?? '');
  useEffect(() => {
    setCard(null);
    if (!selected) return;
    api<Battlecard>(`/conversations/${selected.id}/battlecard`).then(setCard).catch(() => undefined);
  }, [selected?.id, selected?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Rola só a lista de mensagens (não a página): o cabeçalho com os controles continua visível no celular.
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selected?.messages.length, selected?.id]);
  useEffect(() => {
    // Tempo real (SSE): nova mensagem / handoff → atualiza. O intervalo longo é só rede de segurança.
    let last = 0;
    const refresh = () => {
      if (Date.now() - last < 1500) return;
      last = Date.now();
      router.refresh();
    };
    window.addEventListener('rt:conversation', refresh);
    const t = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener('rt:conversation', refresh);
      clearInterval(t);
    };
  }, [router]);

  const go = (params: Record<string, string>) => {
    const q = new URLSearchParams({ ...(mode ? { mode } : {}), ...(numberId ? { n: numberId } : {}), ...params });
    router.push(`${pathname}?${q.toString()}`);
  };

  const send = async () => {
    if (!selected || !text.trim()) return;
    setBusy(true);
    try {
      await api(`/conversations/${selected.id}/messages`, { body: { text, simulateInbound: asClient } });
      setText('');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const control = async (action: string, msg: string, extra: Record<string, unknown> = {}) => {
    if (!selected) return;
    try {
      await api(`/conversations/${selected.id}/control`, { body: { action, ...extra } });
      toast(msg);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const act = async (path: string, msg: string) => {
    try {
      await api(path, { method: 'POST' });
      toast(msg);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="h-[calc(100vh-72px-56px)] grid gap-4 md:grid-cols-[320px_1fr] xl:grid-cols-[330px_1fr_330px]">
      {/* Lista */}
      <aside className={cx('bg-surface border border-line rounded-3xl overflow-hidden flex flex-col min-h-0', selected && 'hidden md:flex')}>
        <div className="p-5 pb-3 space-y-3">
          <div className="text-[17px] font-semibold">Conversas</div>
          <div className="flex flex-wrap gap-1.5 text-[13px]">
            {[
              ['', 'Todas'],
              ['AI', 'IA ativa'],
              ['HUMAN', 'Consultor ativo'],
            ].map(([k, l]) => (
              <button key={k} onClick={() => router.push(`${pathname}?${new URLSearchParams({ ...(k ? { mode: k } : {}), ...(numberId ? { n: numberId } : {}) })}`)} className={cx('px-3 py-1.5 rounded-full border', mode === k ? 'bg-ink text-white border-ink' : 'border-line text-ink-2')}>
                {l}
              </button>
            ))}
          </div>
          {numbers.length > 1 && (
            <select
              aria-label="Filtrar por número de WhatsApp"
              className={cx(inputClass, '!h-9 text-xs')}
              value={numberId}
              onChange={(e) => router.push(`${pathname}?${new URLSearchParams({ ...(mode ? { mode } : {}), ...(e.target.value ? { n: e.target.value } : {}) })}`)}
            >
              <option value="">Todos os números ({numbers.length})</option>
              {numbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                  {n.down ? ' · fora do ar' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <ul className="overflow-y-auto scroll-thin flex-1 px-3 pb-3">
          {list.map((c) => (
            <li key={c.id}>
              <button onClick={() => go({ c: c.id })} className={cx('w-full text-left px-2.5 py-3 flex gap-3 rounded-2xl hover:bg-slate-50', selected?.id === c.id && 'bg-slate-100')}>
                <Avatar name={c.name} size={36} tone={c.mode === 'HUMAN' ? 'green' : 'blue'} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <b className="text-[14.5px] font-medium truncate">{c.name}</b>
                    <span className="text-[11px] text-muted shrink-0">{timeAgo(c.lastAt)}</span>
                  </span>
                  <span className="block text-xs text-muted truncate">{c.last}</span>
                  <span className="flex items-center gap-1.5 mt-1">
                    <ScoreBadge score={c.score} temperature={c.temperature} size="sm" />
                    <span className={cx('text-[10.5px] font-semibold', c.mode === 'HUMAN' ? 'text-ok' : 'text-violet-600')}>{c.mode === 'HUMAN' ? 'CONSULTOR' : 'IA'}</span>
                    <span className={cx('text-[10.5px] truncate', c.number?.down ? 'text-warn' : 'text-faint')} title={c.number?.down ? 'Número fora do ar' : undefined}>
                      {c.channel === 'WEB' ? 'Web' : c.channel === 'INSTAGRAM' ? 'Instagram' : `WhatsApp${c.number ? ` · ${c.number.name}` : ''}`}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="p-6 text-sm text-muted text-center">Nenhuma conversa.</li>}
        </ul>
      </aside>

      {/* Chat */}
      <section className={cx('bg-surface border border-line rounded-3xl overflow-hidden flex flex-col min-h-0 min-w-0', !selected && 'hidden md:flex')}>
        {selected ? (
          <>
            <header className="px-5 pt-5 pb-3 flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
              <button className="md:hidden text-sm text-brand-600" onClick={() => router.push(pathname)}>
                ←
              </button>
              <Link href={`/leads/${selected.lead.id}`} className="text-[17px] font-semibold hover:text-brand-600 truncate">
                {selected.lead.name}
              </Link>
              <ModeBadge mode={selected.mode} />
              <span className={cx('text-[11px] font-semibold hidden sm:inline', STATE[selected.state][1])}>{STATE[selected.state][0]}</span>
              {selected.mode === 'AI' && selected.currentAgent && <span className="text-xs text-muted hidden lg:inline">{AGENT[selected.currentAgent]}</span>}
              {selected.number && <span className="text-xs text-muted hidden lg:inline">via {selected.number}</span>}
              <span className="ml-auto flex flex-wrap justify-end gap-1.5">
                {perms.handoff && selected.state === 'BOT_ACTIVE' && (
                  <button className={buttonClass('primary', 'sm')} onClick={() => act(`/conversations/${selected.id}/takeover`, 'Você assumiu a conversa. IA pausada.')}>
                    Assumir
                  </button>
                )}
                {perms.handoff && selected.state === 'BOT_ACTIVE' && (
                  <button className={buttonClass('secondary', 'sm')} onClick={() => control('pause', 'IA pausada.')}>
                    Pausar IA
                  </button>
                )}
                {perms.handoff && (selected.state === 'HUMAN_ACTIVE' || selected.state === 'PAUSED') && !selected.lead.optOut && (
                  <button className={buttonClass('secondary', 'sm')} onClick={() => control('resume', 'Conversa devolvida para a IA.')}>
                    Devolver à IA
                  </button>
                )}
                {perms.transfer && selected.state !== 'CLOSED' && consultants.length > 0 && (
                  <button className={buttonClass('secondary', 'sm')} onClick={() => setTransfer(true)}>
                    Transferir
                  </button>
                )}
                {perms.handoff && selected.state !== 'CLOSED' && (
                  <button className={buttonClass('ghost', 'sm')} onClick={() => confirm('Encerrar esta conversa?') && control('close', 'Conversa encerrada.')}>
                    Encerrar
                  </button>
                )}
                {perms.handoff && selected.state === 'CLOSED' && (
                  <button className={buttonClass('secondary', 'sm')} onClick={() => control('reopen', 'Conversa reaberta.')}>
                    Reabrir
                  </button>
                )}
                <span className="hidden sm:inline">
                  <SendToPhoneButton targetType="CONVERSATION" targetId={selected.id} />
                </span>
                <button className={buttonClass('secondary', 'sm') + ' xl:hidden'} onClick={() => setPanel(true)} aria-label="Abrir battlecard">
                  Battlecard
                </button>
              </span>
            </header>
            <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin p-4 mx-5 rounded-2xl space-y-2.5 bg-slate-100">
              {selected.messages.map((m) =>
                m.senderType === 'SYSTEM' ? (
                  <div key={m.id} className="text-center">
                    <span className="inline-block text-[11.5px] text-muted bg-white border border-line rounded-full px-3 py-1">{m.content}</span>
                  </div>
                ) : (
                  <div key={m.id} className={m.direction === 'INBOUND' ? 'flex' : 'flex justify-end'}>
                    <div className="max-w-[78%]">
                      <div className={cx('rounded-2xl px-4 py-2.5 text-[14px] leading-snug', m.direction === 'INBOUND' ? 'bg-white border border-line rounded-bl-md' : m.senderType === 'HUMAN' ? 'bg-ok-50 border border-emerald-200 rounded-br-md' : 'bg-ink text-white rounded-br-md')}>
                        <div className="text-[10.5px] opacity-70 mb-0.5">
                          {m.senderType === 'LEAD' ? firstName(selected.lead.name) : m.senderType === 'HUMAN' ? m.senderName ?? 'Consultor' : `IA · ${AGENT[m.agentKey ?? ''] ?? 'Agente'}`}
                        </div>
                        {m.content}
                      </div>
                      <div className={cx('flex items-center gap-2 mt-1 text-[10.5px] text-faint', m.direction !== 'INBOUND' && 'justify-end')}>
                        {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {m.direction === 'OUTBOUND' && <span>· {m.status}</span>}
                        {perms.feedback && m.aiExecutionId && (
                          <span className="flex gap-1">
                            {[
                              ['GOOD', '👍 Boa'],
                              ['BAD', '👎 Ruim'],
                              ['INCORRECT', 'Incorreta'],
                              ['NEEDS_REVIEW', 'Revisar'],
                            ].map(([r, l]) => (
                              <button
                                key={r}
                                className={cx('rounded px-1.5 py-0.5 border', rated[m.id] === r ? 'bg-ink text-white border-ink' : 'border-line hover:bg-white')}
                                onClick={async () => {
                                  try {
                                    await api(`/ai/executions/${m.aiExecutionId}/feedback`, { body: { rating: r, messageId: m.id } });
                                    setRated((x) => ({ ...x, [m.id]: r }));
                                    toast('Feedback registrado para melhoria dos agentes.');
                                  } catch (e) {
                                    toast((e as Error).message, 'error');
                                  }
                                }}
                              >
                                {l}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
              <div ref={endRef} />
            </div>
            {perms.reply && (
              <form
                className="px-5 py-4 space-y-2 shrink-0"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <div className="flex gap-2">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={4000}
                    placeholder={asClient ? 'Mensagem do CLIENTE (simulação do WhatsApp mock)…' : selected.mode === 'AI' ? 'Responder assume a conversa (IA será pausada)…' : 'Escreva sua resposta…'}
                    className={cx('flex-1 h-11 rounded-xl border px-3.5 text-sm focus:outline-none', asClient ? 'border-warn bg-warn-50' : 'border-line bg-white focus:border-brand-500')}
                  />
                  <button className={buttonClass(asClient ? 'secondary' : 'primary')} disabled={busy || !text.trim()}>
                    {busy ? '…' : asClient ? 'Simular' : 'Enviar'}
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={asClient} onChange={(e) => setAsClient(e.target.checked)} />
                  Simular mensagem do cliente (WhatsApp mock) — aciona o Maestro como se o lead tivesse escrito
                </label>
              </form>
            )}
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-sm text-muted">Selecione uma conversa.</div>
        )}
      </section>

      {selected && transfer && (
        <Modal open onClose={() => setTransfer(false)} title="Transferir conversa" footer={<button className={buttonClass('primary')} disabled={!target} onClick={async () => { await control('transfer', 'Conversa transferida.', { consultantId: target }); setTransfer(false); }}>Transferir</button>}>
          <p className="text-sm text-muted mb-3">O lead e a conversa passam para o consultor escolhido, que é notificado. A IA fica pausada.</p>
          <select className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Consultor de destino">
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Modal>
      )}

      {/* Painel do lead + Battlecard + Copilot */}
      {selected && panel && <div className="fixed inset-0 z-40 bg-slate-900/40 xl:hidden" onClick={() => setPanel(false)} />}
      {selected && (
        <aside className={cx('bg-surface border border-line xl:rounded-3xl overflow-y-auto scroll-thin p-5 space-y-4', panel ? 'fixed inset-y-0 right-0 z-50 w-[min(360px,100vw)] shadow-2xl xl:static xl:w-auto xl:shadow-none' : 'hidden xl:block')}>
          {panel && (
            <button className={buttonClass('ghost', 'sm') + ' xl:hidden'} onClick={() => setPanel(false)}>
              ← Voltar para a conversa
            </button>
          )}
          {card && (
            <section aria-label="Battlecard">
              <div className="text-[17px] font-semibold mb-3">Battlecard</div>
              <dl className="grid grid-cols-2 gap-3 text-sm [&_dt]:text-[11px] [&_dt]:uppercase [&_dt]:tracking-[0.08em] [&_dt]:text-faint">
                <div>
                  <dt className="text-muted">Objetivo</dt>
                  <dd className="font-medium">{card.lead.objective ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Interesse</dt>
                  <dd className="font-medium">{card.lead.desiredValue ? brl(card.lead.desiredValue) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Objeção</dt>
                  <dd className="font-medium">{card.objections[0] ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Intenção</dt>
                  <dd className="font-medium" title={card.intent?.evidence}>{card.intent?.label ?? '—'}</dd>
                </div>
              </dl>
              {card.nextBestAction && (
                <p className="text-xs mt-2">
                  <b>Agora:</b> {NBA_ACTIONS[card.nextBestAction.action as keyof typeof NBA_ACTIONS] ?? card.nextBestAction.action} — {card.nextBestAction.reason}
                </p>
              )}
              {card.talkingPoints.length > 0 && (
                <>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 mt-3 mb-1">IA sugere</div>
                  <ul className="space-y-1 text-xs">
                    {card.talkingPoints.map((t, i) => (
                      <li key={i}>
                        → {t.text} <span className="text-faint">({t.source})</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {card.signals.length > 0 && <p className="text-[11px] text-muted mt-2">Sinais: {card.signals.map((s) => s.label).join(' · ')}</p>}
            </section>
          )}
          {perms.reply && (
            <section aria-label="Copilot">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">AI Copilot</div>
              <CopilotPanel leadId={selected.lead.id} compact onUseReply={(t) => { setText(t); setPanel(false); }} />
            </section>
          )}
          <div className="flex items-center gap-3">
            <ScoreBadge score={selected.lead.score} temperature={selected.lead.temperature} />
            <div>
              <b className="block">{selected.lead.name}</b>
              <span className="text-xs text-muted">{formatPhone(selected.lead.phone)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <TempBadge temperature={selected.lead.temperature} />
            {selected.lead.optOut && <Badge tone="red">Opt-out</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <KV label="Produto">{productLabel(selected.lead.product)}</KV>
            <KV label="Valor">{selected.lead.value ? brl(selected.lead.value) : '—'}</KV>
            <KV label="Cidade">{selected.lead.city ?? '—'}</KV>
            <KV label="Origem">{sourceLabel(selected.lead.source)}</KV>
            <KV label="Consultor">{selected.lead.consultant ?? 'Não distribuído'}</KV>
            <KV label="Objeções">{selected.lead.objections.join(', ') || '—'}</KV>
          </dl>
          {selected.lead.opportunity ? (
            <Link href={`/oportunidades/${selected.lead.opportunity.id}`} className="block rounded-xl border border-line p-3 hover:border-brand-200">
              <div className="text-xs text-muted">Oportunidade</div>
              <div className="font-medium">
                {selected.lead.opportunity.stage} · {brl(selected.lead.opportunity.value)}
              </div>
            </Link>
          ) : (
            <p className="text-xs text-muted">Sem oportunidade.</p>
          )}
          {selected.summary && (
            <div className="rounded-xl bg-brand-50 border border-brand-100 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 mb-1">Resumo (IA)</div>
              <pre className="text-xs text-ink-2 whitespace-pre-wrap font-sans">{selected.summary}</pre>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
