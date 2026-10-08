'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Badge, buttonClass, Card } from '@/components/ui';
import { inputClass } from '@/components/client';

interface Status {
  checks: { token: boolean; waba: boolean; appSecret: boolean; verifyToken: boolean; subscribed: boolean };
  error: string | null;
  webhookUrl: string;
  numbers: {
    id: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    name_status?: string;
    messaging_limit_tier?: string;
    registered: boolean;
    local: { id: string; name: string; linked: boolean; owner: string | null } | null;
  }[];
}

const Check = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <li className="flex items-start gap-2">
    <span className={ok ? 'text-ok' : 'text-bad'}>{ok ? '✓' : '✗'}</span>
    <span>{children}</span>
  </li>
);

/** Conexão com a Meta: conferência, inscrição do app, importação e registro dos números. */
export function MetaSetup() {
  const router = useRouter();
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState('');
  const [pin, setPin] = useState<Record<string, string>>({});

  const load = () => api<Status>('/whatsapp/meta').then(setS).catch((e) => toast((e as Error).message, 'error'));
  useEffect(() => {
    load();
  }, []);

  async function run(action: string, extra: Record<string, string> = {}, ok = 'Feito.') {
    setBusy(action + (extra.numberId ?? ''));
    try {
      const r = await api<{ total?: number; linked?: number; created?: number }>('/whatsapp/meta', { body: { action, ...extra } });
      toast(action === 'import' ? `${r.total} número(s) na Meta · ${r.created} novo(s) · ${r.linked} atualizado(s).` : ok);
      await load();
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }

  if (!s) return null;
  const c = s.checks;
  return (
    <Card title="Conexão com a Meta (API oficial)" subtitle="Tudo o que precisa estar certo para os números enviarem e receberem mensagens." className="mt-4">
      <ul className="text-sm space-y-1">
        <Check ok={c.token}>Token de acesso e modo cloud-api (Super Admin → Configurar APIs → WhatsApp)</Check>
        <Check ok={c.waba}>ID da conta WhatsApp Business (WABA)</Check>
        <Check ok={c.appSecret}>App Secret (confere a assinatura das mensagens recebidas)</Check>
        <Check ok={c.verifyToken}>Token de verificação do webhook</Check>
        <Check ok={c.subscribed}>
          App inscrito na conta: sem isso a Meta não entrega as mensagens recebidas.{' '}
          {c.token && c.waba && !c.subscribed && (
            <button className="text-brand-600 underline" disabled={!!busy} onClick={() => run('subscribe', {}, 'App inscrito: as mensagens recebidas passam a chegar.')}>
              Inscrever agora
            </button>
          )}
        </Check>
      </ul>
      <p className="text-xs text-muted mt-2">
        Webhook para colar na Meta (WhatsApp → Configuração, campo <b>messages</b>): <code className="select-all">{s.webhookUrl}</code>
      </p>
      {s.error && <p className="text-sm text-bad mt-2">{s.error}</p>}

      {c.token && c.waba && (
        <>
          <div className="flex items-center justify-between mt-4">
            <b className="text-sm">Números na conta da Meta ({s.numbers.length})</b>
            <button className={buttonClass('primary', 'sm')} disabled={!!busy} onClick={() => run('import')}>
              {busy === 'import' ? 'Importando…' : 'Importar números da Meta'}
            </button>
          </div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {s.numbers.map((n) => (
              <li key={n.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0">
                  <b>{n.verified_name ?? 'Sem nome'}</b> · {n.display_phone_number}
                  <span className="block text-xs text-muted">
                    ID {n.id} · qualidade {n.quality_rating ?? '—'} · nome {n.name_status ?? '—'} · limite {n.messaging_limit_tier ?? '—'}
                    {n.local ? ` · no sistema: ${n.local.name}${n.local.owner ? ` (${n.local.owner})` : ' (operação)'}` : ' · ainda não está no sistema'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={n.registered ? 'green' : 'amber'} dot>
                    {n.registered ? 'Registrado na API' : 'Falta registrar'}
                  </Badge>
                  {!n.registered && n.local?.linked && (
                    <>
                      <input className={inputClass + ' !h-8 w-24 text-center tracking-widest'} inputMode="numeric" maxLength={6} placeholder="PIN" value={pin[n.local.id] ?? ''} onChange={(e) => setPin({ ...pin, [n.local!.id]: e.target.value.replace(/\D/g, '') })} />
                      <button className={buttonClass('secondary', 'sm')} disabled={!!busy || (pin[n.local.id] ?? '').length !== 6} onClick={() => run('register', { numberId: n.local!.id, pin: pin[n.local!.id] }, 'Número registrado na API.')}>
                        Registrar
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
            {!s.numbers.length && !s.error && <li className="py-3 text-muted">Nenhum número na conta. Adicione o número no WhatsApp Manager da Meta.</li>}
          </ul>
          <p className="text-xs text-muted mt-2">
            O PIN é a senha de 6 dígitos da verificação em duas etapas do número. Número novo: você escolhe o PIN aqui mesmo, na primeira vez. Um número ligado à API deixa de funcionar no app do celular.
          </p>
        </>
      )}
    </Card>
  );
}
