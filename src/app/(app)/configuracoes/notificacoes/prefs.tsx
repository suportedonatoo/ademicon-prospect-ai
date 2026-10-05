'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, toast } from '@/lib/client';
import { Badge, Card, buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';
import { DesktopPermissionButton } from '@/components/v2-client';

type Channel = 'IN_APP' | 'DESKTOP' | 'PUSH' | 'EXTENSION' | 'EMAIL';
type Prefs = {
  matrix: Record<string, Channel[]>;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  quietBypass: string[];
  hideSensitiveOnLockScreen: boolean;
  keys: Record<string, { label: string; group: string }>;
  channels: Channel[];
  pushConfigured: boolean;
  emailConfigured: boolean;
};
type Device = { id: string; kind: string; label: string; os: string | null; browser: string | null; status: string; push: boolean; extension: boolean; lastSeenAt: string; createdAt: string };

const CH_LABEL: Record<Channel, string> = { IN_APP: 'Sino', DESKTOP: 'Computador', PUSH: 'Celular (push)', EXTENSION: 'Extensão', EMAIL: 'E-mail' };
const KIND_LABEL: Record<string, string> = { BROWSER: 'Navegador', PWA: 'App instalado (PWA)', MOBILE: 'Celular', EXTENSION: 'Extensão' };

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PreferencesAndDevices() {
  const [p, setP] = useState<Prefs | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [push, setPush] = useState<{ configured: boolean; publicKey: string | null }>({ configured: false, publicKey: null });
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<{ token: string; apiUrl: string } | null>(null);
  const [pushState, setPushState] = useState<'unknown' | 'unsupported' | 'subscribed' | 'not-subscribed'>('unknown');

  const load = useCallback(async () => {
    const [prefs, dev] = await Promise.all([api<Prefs>('/notifications/preferences'), api<{ items: Device[]; push: { configured: boolean; publicKey: string | null } }>('/devices')]);
    setP(prefs);
    setDevices(dev.items);
    setPush(dev.push);
  }, []);

  useEffect(() => {
    load().catch((e) => toast((e as Error).message, 'error'));
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) setPushState('unsupported');
    else navigator.serviceWorker.getRegistration('/').then(async (reg) => setPushState((await reg?.pushManager.getSubscription()) ? 'subscribed' : 'not-subscribed'));
  }, [load]);

  if (!p) return <p className="text-sm text-muted">Carregando…</p>;

  const toggle = (key: string, ch: Channel) =>
    setP((x) => {
      if (!x) return x;
      const cur = new Set(x.matrix[key] ?? []);
      if (cur.has(ch)) cur.delete(ch);
      else cur.add(ch);
      return { ...x, matrix: { ...x.matrix, [key]: [...cur] as Channel[] } };
    });

  const save = async () => {
    setSaving(true);
    try {
      await api('/notifications/preferences', { method: 'PUT', body: { matrix: p.matrix, quietEnabled: p.quietEnabled, quietStart: p.quietStart, quietEnd: p.quietEnd, quietBypass: p.quietBypass, hideSensitiveOnLockScreen: p.hideSensitiveOnLockScreen } });
      toast('Preferências salvas.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async () => {
    try {
      if (!push.publicKey) throw new Error('Push não configurado no servidor.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Permissão de notificação negada neste aparelho.');
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(push.publicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api('/devices/push', { body: { endpoint: json.endpoint, keys: json.keys, standalone: window.matchMedia('(display-mode: standalone)').matches } });
      setPushState('subscribed');
      toast('Este aparelho vai receber notificações push.');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Desconectar este dispositivo? Ele deixa de receber notificações imediatamente.')) return;
    await api(`/devices/${id}`, { method: 'DELETE' }).catch((e) => toast((e as Error).message, 'error'));
    toast('Dispositivo revogado.');
    load();
  };

  const groups = [...new Set(Object.values(p.keys).map((k) => k.group))];

  return (
    <div className="grid xl:grid-cols-[1.35fr_1fr] gap-4 items-start">
      <Card title="O que receber e onde" subtitle="O sino sempre registra tudo (histórico auditável). Os demais canais você escolhe." actions={<button className={buttonClass('primary', 'sm')} disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</button>}>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-[11px] uppercase tracking-wider text-muted py-2">Evento</th>
                {p.channels.map((c) => (
                  <th key={c} className="text-center text-[11px] uppercase tracking-wider text-muted px-2">
                    {CH_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g}>
                <tr>
                  <td colSpan={6} className="pt-4 pb-1 text-xs font-semibold text-ink">
                    {g}
                  </td>
                </tr>
                {Object.entries(p.keys)
                  .filter(([, v]) => v.group === g)
                  .map(([k, v]) => (
                    <tr key={k} className="border-t border-line">
                      <td className="py-2">{v.label}</td>
                      {p.channels.map((c) => {
                        const disabled = c === 'IN_APP' || (c === 'PUSH' && !p.pushConfigured) || (c === 'EMAIL' && !p.emailConfigured);
                        return (
                          <td key={c} className="text-center">
                            <input type="checkbox" className="size-4 accent-brand-600" aria-label={`${v.label} — ${CH_LABEL[c]}`} checked={c === 'IN_APP' || (p.matrix[k] ?? []).includes(c)} disabled={disabled} onChange={() => toggle(k, c)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        </div>
        {!p.pushConfigured && <p className="text-xs text-muted mt-3">Push indisponível: o servidor não tem chaves VAPID configuradas.</p>}
        {!p.emailConfigured && <p className="text-xs text-muted mt-1">E-mail indisponível: nenhum provedor de e-mail configurado.</p>}
      </Card>

      <div className="space-y-4">
        <Card title="Horário de silêncio" subtitle="Notificações não críticas ficam guardadas e chegam quando o silêncio termina.">
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" className="size-4 accent-brand-600" checked={p.quietEnabled} onChange={(e) => setP({ ...p, quietEnabled: e.target.checked })} /> Ativar horário de silêncio
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início">
              <input type="time" className={inputClass} value={p.quietStart} onChange={(e) => setP({ ...p, quietStart: e.target.value })} />
            </Field>
            <Field label="Fim">
              <input type="time" className={inputClass} value={p.quietEnd} onChange={(e) => setP({ ...p, quietEnd: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-muted mt-2">Sempre passam: lead quente, SLA crítico e falha crítica.</p>
          <label className="flex items-center gap-2 text-sm mt-3">
            <input type="checkbox" className="size-4 accent-brand-600" checked={p.hideSensitiveOnLockScreen} onChange={(e) => setP({ ...p, hideSensitiveOnLockScreen: e.target.checked })} /> Ocultar nomes e detalhes na tela bloqueada do celular
          </label>
          <button className={buttonClass('secondary', 'sm') + ' mt-3'} disabled={saving} onClick={save}>
            Salvar
          </button>
        </Card>

        <Card title="Este aparelho">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>Notificações no computador (navegador aberto)</span>
              <DesktopPermissionButton />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Push (mesmo com o navegador fechado · celular)</span>
              {pushState === 'unsupported' ? (
                <Badge tone="gray">Sem suporte neste navegador</Badge>
              ) : pushState === 'subscribed' ? (
                <Badge tone="green" dot>
                  Ativo
                </Badge>
              ) : (
                <button className={buttonClass('primary', 'sm')} disabled={!push.configured} onClick={enablePush}>
                  Ativar push aqui
                </button>
              )}
            </div>
            <p className="text-xs text-muted">No iPhone (iOS 16.4+), primeiro use “Compartilhar → Adicionar à Tela de Início” e abra pelo ícone; depois ative o push. No Android, basta ativar no Chrome.</p>
          </div>
        </Card>

        <Card title="Extensão Chrome / Edge" subtitle="Ademicon Sales Assistant — notificações, leads quentes e conversas aguardando.">
          {token ? (
            <div className="space-y-2 text-sm">
              <p>Copie o token abaixo e cole na extensão (ele aparece só agora):</p>
              <input readOnly className={inputClass + ' font-mono text-xs'} value={token.token} onFocus={(e) => e.target.select()} aria-label="Token da extensão" />
              <p className="text-xs text-muted">Endereço da plataforma: {token.apiUrl}</p>
              <button className={buttonClass('secondary', 'sm')} onClick={() => navigator.clipboard.writeText(token.token).then(() => toast('Token copiado.'))}>
                Copiar token
              </button>
            </div>
          ) : (
            <button
              className={buttonClass('secondary', 'sm')}
              onClick={async () => {
                try {
                  setToken(await api('/devices/extension', { body: {} }));
                  load();
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              Conectar extensão
            </button>
          )}
          <p className="text-xs text-muted mt-2">
            Instalação: <a className="text-brand-600 underline" href="/extensao">instruções</a>.
          </p>
        </Card>
      </div>

      <Card className="xl:col-span-2" title="Dispositivos conectados" pad={false} actions={<button className={buttonClass('ghost', 'sm')} onClick={async () => { const r = await api<{ ended: number }>('/devices/sessions', { method: 'DELETE' }); toast(`${r.ended} sessão(ões) encerrada(s) em outros aparelhos.`); }}>Encerrar outras sessões</button>}>
        {devices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Nenhum dispositivo conectado ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {devices.map((d) => (
              <li key={d.id} className="px-5 py-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  <b className="block">{d.label}</b>
                  <span className="text-xs text-muted">
                    {KIND_LABEL[d.kind] ?? d.kind} · {[d.browser, d.os].filter(Boolean).join(' · ')} · último acesso {new Date(d.lastSeenAt).toLocaleString('pt-BR')}
                  </span>
                </span>
                <Badge tone={d.status === 'ACTIVE' ? 'green' : 'gray'} dot>
                  {d.status === 'ACTIVE' ? 'Conectado' : 'Revogado'}
                </Badge>
                {d.status === 'ACTIVE' && (
                  <button className={buttonClass('danger', 'sm')} onClick={() => revoke(d.id)}>
                    Revogar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
