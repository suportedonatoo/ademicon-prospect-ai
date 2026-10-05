'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

export function LoginForm({ demoAccounts, demoPassword, next = '/' }: { demoAccounts: string[][]; demoPassword: string | null; next?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/auth/login', { body: { email, password } });
            window.location.href = next;
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <Field label="E-mail">
          <input className={inputClass} type="email" placeholder="nome@ademicon.com.br" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <input className={inputClass} type="password" placeholder="••••••••" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-bad" role="alert">{error}</p>}
        <button className={buttonClass('primary') + ' w-full !h-11'} disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      {demoAccounts.length > 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-4">
          <p className="text-xs text-muted mb-2.5">
            Contas de demonstração{demoPassword ? (
              <>
                {' '}· senha <b className="text-ink">{demoPassword}</b>
              </>
            ) : ' · senha definida em SEED_PASSWORD'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {demoAccounts.map(([mail, label]) => (
              <button
                key={mail}
                type="button"
                className={buttonClass('secondary', 'sm')}
                onClick={() => {
                  setEmail(mail);
                  if (demoPassword) setPassword(demoPassword);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
