'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Icon } from './icons';
import { Badge, buttonClass, cx } from './ui';
import { Modal, inputClass } from './client';

/** Atualiza a página (server components) em eventos de tempo real e, por segurança, a cada N segundos. */
export function AutoRefresh({ seconds = 60, on = ['rt:notification', 'rt:conversation'] }: { seconds?: number; on?: string[] }) {
  const router = useRouter();
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (Date.now() - last < 3000) return; // no máximo 1 atualização a cada 3s
      last = Date.now();
      router.refresh();
    };
    on.forEach((e) => window.addEventListener(e, refresh));
    const t = setInterval(refresh, seconds * 1000);
    return () => {
      on.forEach((e) => window.removeEventListener(e, refresh));
      clearInterval(t);
    };
  }, [router, seconds, on]);
  return null;
}

type Device = { id: string; kind: string; label: string; status: string; push: boolean };

/** ENVIAR PARA MEU CELULAR — dispositivo conectado (push), QR Code ou link seguro temporário. */
export function SendToPhoneButton({ targetType, targetId, size = 'sm' }: { targetType: 'CONVERSATION' | 'LEAD' | 'OPPORTUNITY' | 'TASK'; targetId: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pushReady, setPushReady] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [result, setResult] = useState<{ method: string; url?: string; qr?: string | null; expiresAt: string; delivered?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    api<{ items: Device[]; push: { configured: boolean } }>('/devices')
      .then((r) => {
        const phones = r.items.filter((d) => d.status === 'ACTIVE' && d.push);
        setDevices(phones);
        setPushReady(r.push.configured);
        setDeviceId(phones[0]?.id ?? '');
      })
      .catch(() => undefined);
  }, [open]);

  const send = async (method: 'QR' | 'LINK' | 'PUSH') => {
    setBusy(true);
    try {
      const r = await api<{ method: string; url?: string; qr?: string | null; expiresAt: string; delivered?: boolean }>('/send-to-phone', { body: { targetType, targetId, method, deviceId: method === 'PUSH' ? deviceId : undefined } });
      setResult(r);
      if (method === 'PUSH') toast('Enviado para o celular.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={buttonClass('secondary', size)} onClick={() => setOpen(true)}>
        <Icon name="smartphone" className="size-4" /> Enviar para meu celular
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Enviar para meu celular">
        <div className="space-y-4 text-sm">
          <p className="text-muted">O celular abre exatamente este item. O link é temporário, não contém dados pessoais e só funciona com o <b>seu</b> login — a sessão deste computador não é transferida.</p>
          <section className="rounded-xl border border-line p-3">
            <b className="block mb-2">1 · Dispositivo conectado (push)</b>
            {!pushReady ? (
              <p className="text-xs text-muted">Push não configurado no servidor.</p>
            ) : devices.length ? (
              <div className="flex gap-2">
                <select className={inputClass} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="Dispositivo">
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label} ({d.kind})
                    </option>
                  ))}
                </select>
                <button className={buttonClass('primary')} disabled={busy || !deviceId} onClick={() => send('PUSH')}>
                  Enviar
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">
                Nenhum celular conectado. Abra a plataforma no celular e ative as notificações em <a className="text-brand-600 underline" href="/configuracoes/notificacoes">Notificações e dispositivos</a>.
              </p>
            )}
          </section>
          <section className="rounded-xl border border-line p-3 flex flex-wrap items-center gap-2">
            <b className="w-full">2 · QR Code ou link seguro</b>
            <button className={buttonClass('secondary')} disabled={busy} onClick={() => send('QR')}>
              <Icon name="qr" className="size-4" /> Gerar QR Code
            </button>
            <button className={buttonClass('secondary')} disabled={busy} onClick={() => send('LINK')}>
              Gerar link
            </button>
          </section>
          {result && result.method !== 'PUSH' && (
            <div className="rounded-xl bg-slate-50 border border-line p-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {result.qr && <img src={result.qr} alt="QR Code para abrir no celular" className="mx-auto size-52" />}
              {result.url && (
                <div className="flex gap-2 mt-2">
                  <input readOnly className={inputClass} value={result.url} aria-label="Link seguro" onFocus={(e) => e.target.select()} />
                  <button className={buttonClass('secondary')} onClick={() => navigator.clipboard.writeText(result.url!).then(() => toast('Link copiado.'))}>
                    Copiar
                  </button>
                </div>
              )}
              <p className="text-xs text-muted mt-2">Expira às {new Date(result.expiresAt).toLocaleTimeString('pt-BR')}.</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

/** Botões de resolução da Next Best Action. */
export function NbaButtons({ id }: { id: string }) {
  const router = useRouter();
  const act = async (status: 'DONE' | 'DISMISSED') => {
    try {
      await api(`/nba/${id}`, { method: 'PATCH', body: { status } });
      toast(status === 'DONE' ? 'Ação registrada como feita.' : 'Ação descartada.');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <span className="inline-flex gap-1">
      <button className={buttonClass('secondary', 'sm')} onClick={() => act('DONE')}>
        Feito
      </button>
      <button className={buttonClass('ghost', 'sm')} onClick={() => act('DISMISSED')}>
        Descartar
      </button>
    </span>
  );
}

const COPILOT_ACTIONS = [
  ['SUMMARIZE', 'Resumir'],
  ['SUGGEST_REPLY', 'Sugerir resposta'],
  ['ANALYZE_OBJECTION', 'Analisar objeção'],
  ['NEXT_ACTION', 'Próxima ação'],
  ['ANALYZE_OPPORTUNITY', 'Analisar oportunidade'],
] as const;

/** CONSULTANT COPILOT — nada é enviado ao cliente sem o consultor decidir. */
export function CopilotPanel({ leadId, onUseReply, compact }: { leadId: string; onUseReply?: (text: string) => void; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ title: string; content: string; sources: string[]; requiresApproval: boolean; action: string } | null>(null);
  const run = async (action: string) => {
    setBusy(action);
    try {
      setOut(await api('/copilot', { body: { leadId, action } }));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-2">
      <div className={cx('flex flex-wrap gap-1.5', compact && 'text-xs')}>
        {COPILOT_ACTIONS.map(([k, l]) => (
          <button key={k} className={buttonClass('secondary', 'sm')} disabled={!!busy} onClick={() => run(k)}>
            {busy === k ? '…' : l}
          </button>
        ))}
        <button
          className={buttonClass('ghost', 'sm')}
          disabled={!!busy}
          onClick={async () => {
            try {
              await api('/tasks', { body: { type: 'FOLLOW_UP', title: 'Follow-up sugerido pelo Copilot', leadId, dueAt: new Date(Date.now() + 24 * 3_600_000).toISOString(), priority: 'MEDIUM' } });
              toast('Follow-up criado para amanhã.');
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
        >
          Criar follow-up
        </button>
      </div>
      {out && (
        <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2 mb-1">
            <b className="text-ink">{out.title}</b>
            {out.requiresApproval && <Badge tone="amber">revise antes de enviar</Badge>}
          </div>
          <p className="whitespace-pre-line text-ink-2">{out.content}</p>
          {out.sources.length > 0 && <p className="text-xs text-muted mt-2">Fontes: {out.sources.join(' · ')}</p>}
          {out.action === 'SUGGEST_REPLY' && onUseReply && (
            <button className={buttonClass('primary', 'sm') + ' mt-2'} onClick={() => onUseReply(out.content)}>
              Usar no campo de resposta
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Solicita permissão de notificação no desktop (Notification API). */
export function DesktopPermissionButton() {
  const [perm, setPerm] = useState<string>('default');
  useEffect(() => {
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);
  if (perm === 'unsupported') return <Badge tone="gray">Navegador sem suporte</Badge>;
  if (perm === 'granted') return <Badge tone="green" dot>Notificações no computador ativas</Badge>;
  if (perm === 'denied') return <Badge tone="red">Bloqueadas no navegador — libere nas configurações do site</Badge>;
  return (
    <button
      className={buttonClass('primary', 'sm')}
      onClick={async () => {
        const p = await Notification.requestPermission();
        setPerm(p);
        if (p === 'granted') new Notification('Notificações ativadas', { body: 'Você será avisado de leads quentes, mensagens e SLA.', icon: '/icon.png' });
      }}
    >
      Ativar notificações no computador
    </button>
  );
}
