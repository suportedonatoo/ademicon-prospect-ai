'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

const EXAMPLES = [
  'Sou um consultor extrovertido e animado, gosto de chamar o cliente pelo nome.',
  'Gosto de marcar uma reunião rápida por vídeo logo no começo, para entender o objetivo do cliente.',
  'Falo de forma simples e direta, sem termos técnicos.',
  'Sempre pergunto o que o cliente quer conquistar (casa, carro, investimento) antes de falar de valores.',
  'Trabalho muito com imóveis e cartas de crédito altas.',
  'Atendo brasileiros que moram fora; pergunto o país e o melhor fuso para conversar.',
];

type Turn = { role: 'lead' | 'assistant'; content: string };

/** Treinar a IA: texto livre de como o consultor trabalha + conversa de teste. */
export function TrainingForm({ consultantId, initial, readOnly }: { consultantId: string; initial: string; readOnly?: boolean }) {
  const router = useRouter();
  const [training, setTraining] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<Turn[]>([]);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/consultants/${consultantId}/ai-profile`, { method: 'PUT', body: { training: training.trim() || null } });
      toast('Treinamento salvo. A IA já usa nos próximos atendimentos.');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = msg.trim();
    if (!text) return;
    setMsg('');
    const history = [...chat];
    setChat([...history, { role: 'lead', content: text }]);
    setThinking(true);
    try {
      const r = await api<{ reply: string; note: string | null }>(`/consultants/${consultantId}/ai-test`, { body: { profile: { training: training.trim() || null }, message: text, history } });
      setChat((c) => [...c, { role: 'assistant', content: r.reply }]);
      setNote(r.note);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <fieldset disabled={readOnly || busy} className="grid gap-3 content-start">
        <Field label="Como você trabalha" hint="Escreva como se estivesse explicando para um assistente novo: seu jeito, o que você gosta de fazer, o que evitar. Até 2.000 caracteres.">
          <textarea className={inputClass + ' !h-56 py-2.5'} maxLength={2000} value={training} onChange={(e) => setTraining(e.target.value)} placeholder="Ex.: Sou um corretor extrovertido, gosto de agendar reuniões por vídeo logo no começo…" />
        </Field>
        <div>
          <div className="text-xs text-muted mb-1.5">Ideias (clique para adicionar):</div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="text-left text-xs rounded-full border border-line bg-white px-3 py-1.5 hover:border-brand-200" onClick={() => setTraining((t) => (t.trim() ? `${t.trim()}\n${ex}` : ex).slice(0, 2000))}>
                + {ex}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">As regras da empresa continuam valendo: a IA sempre diz que é assistente virtual, não promete contemplação e não inventa valores. O supervisor confere cada resposta.</p>
        {!readOnly && (
          <div>
            <button type="button" className={buttonClass('primary')} onClick={save}>
              Salvar treinamento
            </button>
          </div>
        )}
      </fieldset>

      <div className="rounded-2xl border border-line bg-canvas p-3 flex flex-col min-h-80">
        <div className="text-sm font-medium px-1">Testar a IA</div>
        <p className="text-xs text-muted px-1">Fale como se fosse um cliente. Usa o texto ao lado, mesmo antes de salvar. Nada é enviado a ninguém.</p>
        <div className="flex-1 overflow-y-auto space-y-2 my-3 max-h-80 px-1">
          {!chat.length && <p className="text-xs text-faint">Ex.: &quot;Oi, quero entender como funciona o consórcio de imóvel&quot; ou &quot;dá pra gente conversar amanhã?&quot;</p>}
          {chat.map((t, i) => (
            <div key={i} className={t.role === 'lead' ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink text-white px-3 py-2 text-sm' : 'max-w-[85%] rounded-2xl rounded-bl-md bg-white border border-line px-3 py-2 text-sm whitespace-pre-wrap'}>
              {t.content}
            </div>
          ))}
          {thinking && <div className="text-xs text-muted">digitando…</div>}
        </div>
        {note && <p className="text-[11px] text-muted px-1 mb-2">{note}</p>}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input className={inputClass} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Escreva como um cliente…" />
          <button className={buttonClass('secondary')} disabled={thinking || !msg.trim()}>
            Enviar
          </button>
          {chat.length > 0 && (
            <button type="button" className="text-xs text-muted underline" onClick={() => (setChat([]), setNote(null))}>
              limpar
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

type Sched = { enabled: boolean; durationMin: number; mode: 'ONLINE' | 'PRESENCIAL' | 'LIGACAO'; address?: string | null; minNoticeHours: number; days: number[]; start: number; end: number };
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Preferências de agenda: quando e como a IA e o Maestro podem marcar reuniões. */
export function SchedulingForm({ consultantId, initial, readOnly }: { consultantId: string; initial: Sched; readOnly?: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<Sched>(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/consultants/${consultantId}/ai-profile`, { method: 'PUT', body: { scheduling: s } });
      toast('Agenda salva.');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const hours = Array.from({ length: 25 }, (_, h) => h);
  return (
    <fieldset disabled={readOnly || busy} className="grid gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> A IA pode marcar reuniões com os meus clientes (e o Maestro, quando eu pedir)
      </label>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Como é a reunião">
          <select className={inputClass} value={s.mode} onChange={(e) => setS({ ...s, mode: e.target.value as Sched['mode'] })}>
            <option value="ONLINE">Online (Google Meet)</option>
            <option value="LIGACAO">Ligação</option>
            <option value="PRESENCIAL">Presencial</option>
          </select>
        </Field>
        <Field label="Duração">
          <select className={inputClass} value={s.durationMin} onChange={(e) => setS({ ...s, durationMin: Number(e.target.value) })}>
            {[15, 20, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </Field>
        <Field label="Antecedência mínima">
          <select className={inputClass} value={s.minNoticeHours} onChange={(e) => setS({ ...s, minNoticeHours: Number(e.target.value) })}>
            {[0, 1, 2, 4, 12, 24, 48].map((h) => (
              <option key={h} value={h}>
                {h === 0 ? 'Nenhuma' : `${h} hora${h > 1 ? 's' : ''}`}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {s.mode === 'PRESENCIAL' && (
        <Field label="Endereço das reuniões">
          <input className={inputClass} maxLength={200} value={s.address ?? ''} onChange={(e) => setS({ ...s, address: e.target.value })} placeholder="Rua, número, bairro, cidade" />
        </Field>
      )}
      <div>
        <div className="text-sm font-medium mb-1.5">Dias e horário em que aceita reunião</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {DAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => setS({ ...s, days: s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i].sort() })} className={'h-9 w-12 rounded-xl border text-sm ' + (s.days.includes(i) ? 'bg-ink text-white border-ink' : 'bg-white border-line')}>
              {d}
            </button>
          ))}
          <span className="text-sm text-muted ml-2">das</span>
          <select className={inputClass + ' !w-24'} value={s.start} onChange={(e) => setS({ ...s, start: Number(e.target.value) })}>
            {hours.slice(0, 24).map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">às</span>
          <select className={inputClass + ' !w-24'} value={s.end} onChange={(e) => setS({ ...s, end: Number(e.target.value) })}>
            {hours.slice(1).map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </div>
      </div>
      {!readOnly && (
        <div>
          <button type="button" className={buttonClass('primary')} onClick={save}>
            Salvar agenda
          </button>
        </div>
      )}
    </fieldset>
  );
}
