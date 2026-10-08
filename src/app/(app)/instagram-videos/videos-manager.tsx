'use client';

import { useEffect, useRef, useState } from 'react';
import { api, toast } from '@/lib/client';
import { Badge, buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

interface Rule {
  id: string;
  postUrl: string;
  caption: string | null;
  thumbnailUrl: string | null;
  keywords: string[];
  message: string;
  publicReply: string;
  active: boolean;
  images: number;
  sent: number;
  failed: number;
  createdAt: string;
}

const DEFAULT_REPLY = 'Olha sua DM, {nome}! Te encaminhei uma mensagem 😉';
const EMPTY = { postUrl: '', keywords: 'ademicon, consórcio, quero', publicReply: DEFAULT_REPLY, mine: '', withPhotos: false };

/** Vídeos com palavra-chave: lista + formulário (link, palavras, resposta pública, mensagem com 2 ideias da IA, fotos). */
export function VideosManager({ consultantId, consultantName, connected }: { consultantId: string; consultantName: string; connected: boolean }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const load = () =>
    api<Rule[]>(`/instagram/videos?consultantId=${consultantId}`)
      .then(setRules)
      .catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultantId]);

  if (!rules) return <p className="text-sm text-muted">Carregando…</p>;
  return (
    <div className="grid gap-4">
      {editing ? (
        <RuleForm
          key={editing}
          consultantId={consultantId}
          consultantName={consultantName}
          rule={editing === 'new' ? null : (rules.find((r) => r.id === editing) ?? null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      ) : (
        <div>
          <button className={buttonClass('primary')} disabled={!connected} onClick={() => setEditing('new')}>
            + Configurar um vídeo
          </button>
          {!connected && <span className="ml-3 text-sm text-bad">Conecte o Instagram em Meu perfil primeiro.</span>}
        </div>
      )}

      <ul className="grid gap-3">
        {rules.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-white p-4 flex flex-wrap gap-4 items-start">
            {r.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- capa do vídeo vinda do Instagram
              <img src={r.thumbnailUrl} alt="" className="size-20 rounded-xl object-cover bg-slate-100" />
            ) : (
              <div className="size-20 rounded-xl bg-slate-100 grid place-items-center text-xs text-muted">vídeo</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.active ? 'green' : 'gray'} dot>
                  {r.active ? 'Ativo' : 'Pausado'}
                </Badge>
                <span className="text-sm text-muted">
                  {r.sent} mensagem(ns) enviada(s){r.failed ? ` · ${r.failed} falha(s)` : ''} · {r.images ? `mensagem + ${r.images} foto(s)` : 'só mensagem'}
                </span>
              </div>
              <a href={r.postUrl} target="_blank" rel="noreferrer" className="block text-sm text-brand-600 truncate mt-1">
                {r.caption?.slice(0, 90) || r.postUrl}
              </a>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {r.keywords.map((k) => (
                  <span key={k} className="text-xs rounded-full bg-slate-100 px-2 py-0.5">
                    {k}
                  </span>
                ))}
              </div>
              <p className="text-sm text-ink-2 mt-2 line-clamp-2">{r.message}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <button className={buttonClass('secondary', 'sm')} onClick={() => setEditing(r.id)}>
                Editar
              </button>
              <button
                className={buttonClass('ghost', 'sm')}
                onClick={async () => {
                  await api(`/instagram/videos/${r.id}`, { method: 'PATCH', body: { active: !r.active } }).catch((e) => toast((e as Error).message, 'error'));
                  load();
                }}
              >
                {r.active ? 'Pausar' : 'Ativar'}
              </button>
              <button
                className="text-xs text-muted hover:text-bad underline"
                onClick={async () => {
                  if (!confirm('Excluir a configuração deste vídeo? Os comentários novos deixam de ser respondidos.')) return;
                  await api(`/instagram/videos/${r.id}`, { method: 'DELETE' }).catch((e) => toast((e as Error).message, 'error'));
                  load();
                }}
              >
                excluir
              </button>
            </div>
          </li>
        ))}
        {!rules.length && !editing && <li className="text-sm text-muted">Nenhum vídeo configurado ainda.</li>}
      </ul>
    </div>
  );
}

function RuleForm({ consultantId, consultantName, rule, onDone }: { consultantId: string; consultantName: string; rule: Rule | null; onDone: () => void }) {
  const [v, setV] = useState(rule ? { postUrl: rule.postUrl, keywords: rule.keywords.join(', '), publicReply: rule.publicReply, mine: rule.message, withPhotos: rule.images > 0 } : EMPTY);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]); // ideias já mostradas: "gerar outras" não repete
  const [choice, setChoice] = useState(0); // 0 = a minha mensagem; 1 e 2 = ideias da IA
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [savedImages, setSavedImages] = useState(rule?.images ?? 0);
  const fileInput = useRef<HTMLInputElement>(null);
  const first = consultantName.split(' ')[0];
  const options = [v.mine, ...ideas];
  const chosen = options[choice] ?? v.mine;
  const preview = (t: string) => t.replace(/\{nome\}/gi, '@maria').replace(/\{consultor\}/gi, first).replace(/\{link\}/gi, 'seu-link');
  const keywords = v.keywords.split(',').map((k) => k.trim()).filter(Boolean);
  const room = 3 - savedImages - files.length;

  const genIdeas = async () => {
    setLoadingIdeas(true);
    try {
      const r = await api<{ ideas: string[] }>('/instagram/videos/ideas', { body: { consultantId, message: v.mine, keywords, exclude: seen } });
      setSeen((s) => [...s, ...r.ideas].slice(-12));
      setIdeas(r.ideas);
      setChoice(0);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoadingIdeas(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = { consultantId, postUrl: v.postUrl, keywords, publicReply: v.publicReply, message: chosen, active: true };
      const saved = await api<{ id: string }>(rule ? `/instagram/videos/${rule.id}` : '/instagram/videos', { method: rule ? 'PATCH' : 'POST', body });
      if (v.withPhotos) {
        for (const f of files) {
          const form = new FormData();
          form.append('file', f);
          await api(`/instagram/videos/${saved.id}/images`, { form });
        }
      } else if (rule && savedImages) {
        for (let n = savedImages - 1; n >= 0; n--) await api(`/instagram/videos/${saved.id}/images/${n}`, { method: 'DELETE' });
      }
      toast(rule ? 'Vídeo atualizado.' : 'Vídeo configurado. Quem comentar a palavra já recebe a mensagem.');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-brand-200 bg-white p-5 grid gap-4">
      <b>{rule ? 'Editar vídeo' : 'Configurar um vídeo'}</b>
      <Field label="1. Link do vídeo" hint="No Instagram: no vídeo → ⋯ ou avião de papel → Copiar link. Precisa ser um vídeo da sua conta conectada.">
        <input className={inputClass} value={v.postUrl} onChange={(e) => setV({ ...v, postUrl: e.target.value })} placeholder="https://www.instagram.com/reel/…" />
      </Field>
      <Field label="2. Palavras-chave" hint="Separe por vírgula. Vale com ou sem acento e com pequenos erros de digitação.">
        <input className={inputClass} value={v.keywords} onChange={(e) => setV({ ...v, keywords: e.target.value })} placeholder="ademicon, consórcio" />
      </Field>
      <Field label="3. Resposta no comentário (pública)" hint="Aparece embaixo do comentário da pessoa. Use {nome} para o @ dela.">
        <input className={inputClass} maxLength={300} value={v.publicReply} onChange={(e) => setV({ ...v, publicReply: e.target.value })} />
      </Field>

      <div>
        <Field label="4. Mensagem do Direct" hint="Escreva a sua. Depois, se quiser, peça 2 ideias para a IA e escolha qual vai ser enviada. Use {nome}, {consultor} e {link}.">
          <textarea
            className={inputClass + ' !h-28 py-2'}
            maxLength={1000}
            value={v.mine}
            onChange={(e) => {
              setV({ ...v, mine: e.target.value });
              setChoice(0);
            }}
            placeholder="Ex.: Oi, {nome}! Vi que você comentou no meu vídeo. Separei as informações do consórcio para você…"
          />
        </Field>
        <button type="button" className={buttonClass('secondary', 'sm') + ' mt-2'} disabled={loadingIdeas || v.mine.trim().length < 10} onClick={genIdeas}>
          {loadingIdeas ? 'Pensando…' : ideas.length ? '↻ Gerar outras 2 ideias' : '✨ Gerar 2 ideias com IA'}
        </button>
        {ideas.length > 0 && (
          <div className="mt-3 grid gap-2">
            <span className="text-sm font-medium">Qual mensagem vai ser enviada?</span>
            {options.map((o, n) => (
              <label key={n} className={'flex gap-3 rounded-2xl border p-3 cursor-pointer text-sm ' + (choice === n ? 'border-brand-500 bg-brand-50' : 'border-line bg-white')}>
                <input type="radio" name="escolha" checked={choice === n} onChange={() => setChoice(n)} className="mt-1" />
                <span>
                  <b className="block text-xs text-muted mb-0.5">{n === 0 ? 'A sua mensagem' : `Ideia ${n} da IA`}</b>
                  {preview(o)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="text-sm font-medium">5. O que enviar</span>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {[
            [false, 'Só mensagem'],
            [true, 'Mensagem + fotos (até 3)'],
          ].map(([val, label]) => (
            <button key={String(val)} type="button" onClick={() => setV({ ...v, withPhotos: val as boolean })} className={'rounded-xl border px-4 h-10 text-sm ' + (v.withPhotos === val ? 'bg-ink text-white border-ink' : 'bg-white border-line')}>
              {label as string}
            </button>
          ))}
        </div>
        {v.withPhotos && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              {rule &&
                Array.from({ length: savedImages }, (_, n) => (
                  <span key={`s${n}`} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto privada do sistema */}
                    <img src={`/api/v1/instagram/videos/${rule.id}/images/${n}?v=${savedImages}`} alt="" className="size-24 rounded-xl object-cover border border-line" />
                    <button
                      type="button"
                      className="absolute -top-2 -right-2 size-6 rounded-full bg-ink text-white text-xs"
                      onClick={async () => {
                        await api(`/instagram/videos/${rule.id}/images/${n}`, { method: 'DELETE' }).catch((e) => toast((e as Error).message, 'error'));
                        setSavedImages((s) => s - 1);
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              {files.map((f, n) => (
                <span key={`f${n}`} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- pré-visualização local */}
                  <img src={URL.createObjectURL(f)} alt="" className="size-24 rounded-xl object-cover border border-line" />
                  <button type="button" className="absolute -top-2 -right-2 size-6 rounded-full bg-ink text-white text-xs" onClick={() => setFiles(files.filter((_, i) => i !== n))}>
                    ×
                  </button>
                </span>
              ))}
              {room > 0 && (
                <button type="button" onClick={() => fileInput.current?.click()} className="size-24 rounded-xl border border-dashed border-line text-xs text-muted">
                  + foto
                  <br />
                  (JPG/PNG)
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = [...(e.target.files ?? [])].filter((f) => ['image/jpeg', 'image/png'].includes(f.type) && f.size <= 5 * 1024 * 1024);
                e.target.value = '';
                if (picked.length < (e.target.files?.length ?? 0)) toast('Algumas fotos foram ignoradas: use JPG ou PNG de até 5 MB.', 'error');
                setFiles([...files, ...picked].slice(0, 3 - savedImages));
              }}
            />
            <p className="text-xs text-muted mt-2">Regra do Instagram: a primeira mensagem para quem comentou só pode ser texto. As fotos vão assim que a pessoa responder no Direct. Dica: termine a mensagem com uma pergunta.</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-slate-50 border border-line p-3 text-sm">
        <div className="text-xs text-muted mb-1">Como fica para quem comentar &quot;{keywords[0] ?? 'ademicon'}&quot;:</div>
        <div>
          <b>No comentário:</b> {preview(v.publicReply || DEFAULT_REPLY)}
        </div>
        <div className="mt-1 whitespace-pre-wrap">
          <b>No Direct:</b> {preview(chosen || '…')}
        </div>
        {v.withPhotos && <div className="mt-1 text-muted">+ {savedImages + files.length || 'as'} foto(s) quando a pessoa responder.</div>}
      </div>

      <div className="flex gap-2">
        <button className={buttonClass('primary')} disabled={busy || !v.postUrl.trim() || !keywords.length || chosen.trim().length < 10 || (v.withPhotos && !savedImages && !files.length)} onClick={save}>
          {busy ? 'Salvando…' : rule ? 'Salvar' : 'Salvar e ativar'}
        </button>
        <button className={buttonClass('ghost')} onClick={onDone} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
