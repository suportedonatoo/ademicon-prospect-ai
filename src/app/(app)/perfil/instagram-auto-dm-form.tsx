'use client';

import { useEffect, useRef, useState } from 'react';
import { api, toast } from '@/lib/client';
import { Badge, buttonClass } from '@/components/ui';
import { inputClass } from '@/components/client';

interface AutoDm {
  enabled: boolean;
  keywords: string[];
  message: string;
  publicReply: string;
  hasImage: boolean;
  connected: boolean;
  sent30: number;
  recent: { createdAt: string; commenterUsername: string | null; commentText: string; keyword: string | null; status: string; error: string | null; photoSentAt: string | null }[];
}

const STATUS: Record<string, [string, 'green' | 'amber' | 'red' | 'gray']> = {
  SENT: ['Enviada', 'green'],
  FAILED: ['Falhou', 'red'],
  SKIPPED_REPEAT: ['Já recebeu (30 dias)', 'gray'],
};

/** Resposta automática: quem comenta uma palavra-chave recebe a apresentação no Direct (e a foto quando responder). */
export function InstagramAutoDmForm({ consultantId, consultantName }: { consultantId: string; consultantName: string }) {
  const [d, setD] = useState<AutoDm | null>(null);
  const [kw, setKw] = useState('');
  const [busy, setBusy] = useState(false);
  const [imgV, setImgV] = useState(0);
  const file = useRef<HTMLInputElement>(null);

  const load = () =>
    api<AutoDm>(`/instagram/auto-dm/${consultantId}`)
      .then((r) => {
        setD(r);
        setKw(r.keywords.join(', '));
      })
      .catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultantId]);

  if (!d) return <p className="text-sm text-muted mt-4">Carregando a resposta automática…</p>;
  const preview = d.message.replace(/\{nome\}/gi, '@maria').replace(/\{consultor\}/gi, consultantName.split(' ')[0]).replace(/\{link\}/gi, 'seu-link');

  async function save(enabled = d!.enabled) {
    setBusy(true);
    try {
      await api(`/instagram/auto-dm/${consultantId}`, { method: 'PUT', body: { enabled, keywords: kw.split(','), message: d!.message, publicReply: d!.publicReply } });
      toast(enabled ? 'Resposta automática ligada.' : 'Resposta automática salva (desligada).');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <b>Resposta automática a comentários</b>
          <p className="text-sm text-muted">Quem comentar uma das palavras nos seus posts recebe a sua apresentação no Direct. Quando a pessoa responder, vai a foto e a IA continua a conversa.</p>
        </div>
        <Badge tone={d.enabled ? 'green' : 'gray'} dot>
          {d.enabled ? `Ligada · ${d.sent30} enviadas em 30 dias` : 'Desligada'}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px] mt-4">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium">Palavras-chave</span> <span className="text-muted">(separe por vírgula; acento e pequenos erros de digitação são aceitos)</span>
            <input className={inputClass + ' mt-1'} value={kw} onChange={(e) => setKw(e.target.value)} placeholder="ademicon, consórcio, quero, simular" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Mensagem de apresentação</span> <span className="text-muted">— use {'{nome}'}, {'{consultor}'} e {'{link}'}</span>
            <textarea className={inputClass + ' mt-1 h-32 py-2'} maxLength={1000} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Resposta pública no comentário</span> <span className="text-muted">(opcional, ex.: &quot;Te chamei no Direct, {'{nome}'}!&quot;)</span>
            <input className={inputClass + ' mt-1'} maxLength={300} value={d.publicReply} onChange={(e) => setD({ ...d, publicReply: e.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass('primary')} disabled={busy || !d.connected} onClick={() => save(true)} type="button">
              {d.enabled ? 'Salvar' : 'Salvar e ligar'}
            </button>
            {d.enabled && (
              <button className={buttonClass('secondary')} disabled={busy} onClick={() => save(false)} type="button">
                Desligar
              </button>
            )}
          </div>
          {!d.connected && <p className="text-xs text-bad">Conecte o Instagram acima para ligar a resposta automática.</p>}
        </div>

        <div>
          <span className="text-sm font-medium">Foto de apresentação</span>
          <div className="mt-1 rounded-2xl border border-line bg-canvas p-3">
            {d.hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagem privada do sistema
              <img src={`/api/v1/instagram/auto-dm/${consultantId}/image?v=${imgV}`} alt="Foto de apresentação" className="w-full rounded-xl" />
            ) : (
              <p className="text-xs text-muted py-6 text-center">Sem foto própria: vai a foto do seu perfil (se houver).</p>
            )}
            <div className="mt-2 flex gap-3 text-xs">
              <button type="button" className="text-brand-600 underline" onClick={() => file.current?.click()}>
                {d.hasImage ? 'trocar foto' : '+ enviar foto (JPG ou PNG, até 5 MB)'}
              </button>
              {d.hasImage && (
                <button
                  type="button"
                  className="text-muted underline"
                  onClick={async () => {
                    await api(`/instagram/auto-dm/${consultantId}/image`, { method: 'DELETE' }).catch((e) => toast((e as Error).message, 'error'));
                    load();
                  }}
                >
                  tirar
                </button>
              )}
            </div>
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const form = new FormData();
                form.append('file', f);
                try {
                  await api(`/instagram/auto-dm/${consultantId}/image`, { form });
                  toast('Foto salva.');
                  setImgV((v) => v + 1);
                  load();
                } catch (err) {
                  toast((err as Error).message, 'error');
                }
              }}
            />
          </div>
          <p className="text-xs text-muted mt-3">Como a pessoa recebe:</p>
          <div className="mt-1 rounded-2xl bg-slate-100 p-3 text-sm whitespace-pre-wrap">{preview}</div>
        </div>
      </div>

      {d.recent.length > 0 && (
        <div className="mt-4">
          <span className="text-sm font-medium">Últimos comentários</span>
          <ul className="mt-1 divide-y divide-line text-sm">
            {d.recent.map((r, i) => {
              const [label, tone] = STATUS[r.status] ?? [r.status, 'gray'];
              return (
                <li key={i} className="py-2 flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <b>{r.commenterUsername ? `@${r.commenterUsername}` : 'Alguém'}</b> <span className="text-muted">“{r.commentText.slice(0, 80)}”</span>
                    <span className="block text-xs text-muted">
                      {new Date(r.createdAt).toLocaleString('pt-BR')} · palavra: {r.keyword}
                      {r.photoSentAt ? ' · foto enviada' : ''}
                      {r.error ? ` · ${r.error}` : ''}
                    </span>
                  </span>
                  <Badge tone={tone}>{label}</Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
