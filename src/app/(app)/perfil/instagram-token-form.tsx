'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { inputClass } from '@/components/client';

/** Conexão alternativa: colar o token de acesso da conta. O sistema descobre a conta sozinho. */
export function InstagramTokenForm({ consultantId }: { consultantId: string }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-brand-600 font-medium">Conectar colando um token de acesso</summary>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api<{ username: string | null }>('/instagram/token', { body: { consultantId, token } });
            toast(`Instagram conectado${r.username ? `: @${r.username}` : ''}.`);
            setToken('');
            router.refresh();
          } catch (err) {
            toast((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <input className={inputClass + ' flex-1 min-w-60 font-mono text-xs'} type="password" autoComplete="off" placeholder="Token de acesso da conta do Instagram" aria-label="Token de acesso" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className={buttonClass('secondary')} disabled={busy || token.trim().length < 20}>
          {busy ? 'Conferindo…' : 'Conectar com token'}
        </button>
      </form>
      <p className="text-xs text-muted mt-2">Só o token: o sistema confere na Meta, identifica a conta e passa a receber as mensagens. O token fica criptografado e nunca volta para a tela.</p>
    </details>
  );
}
