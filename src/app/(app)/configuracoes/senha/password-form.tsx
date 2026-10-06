'use client';

import { useState } from 'react';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

export function PasswordForm() {
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const mismatch = !!f.again && f.next !== f.again;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api('/auth/password', { body: { current: f.current, next: f.next } });
          toast('Senha trocada.');
          setF({ current: '', next: '', again: '' });
        } catch (err) {
          toast((err as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Senha atual">
        <input className={inputClass} type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      </Field>
      <Field label="Nova senha" hint="Pelo menos 8 caracteres.">
        <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
      </Field>
      <Field label="Repita a nova senha" hint={mismatch ? 'As senhas não são iguais.' : undefined}>
        <input className={inputClass} type="password" autoComplete="new-password" required value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} />
      </Field>
      <button className={buttonClass('primary')} disabled={busy || mismatch || f.next.length < 8 || !f.current}>
        {busy ? 'Salvando…' : 'Trocar senha'}
      </button>
    </form>
  );
}
