'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

type Profile = { enabled: boolean; assistantName?: string | null; presentation?: string | null; style?: string | null; emojis?: boolean | null };

export function AiProfileForm({ consultantId, consultantName, initial, readOnly }: { consultantId: string; consultantName: string; initial: Profile; readOnly?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<Profile>(initial);
  const [busy, setBusy] = useState(false);
  const first = consultantName.split(' ')[0];
  const preview = v.presentation?.trim() || `Sou ${v.assistantName?.trim() ? `${v.assistantName.trim()}, ` : 'o '}assistente virtual de ${first}. ${first} assume a conversa quando você quiser.`;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/consultants/${consultantId}/ai-profile`, {
        method: 'PUT',
        body: { enabled: v.enabled, assistantName: v.assistantName || null, presentation: v.presentation || null, style: v.style || null, emojis: v.emojis ?? null },
      });
      toast('IA do consultor salva.');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset disabled={readOnly || busy} className="grid gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} /> Usar IA personalizada nos meus atendimentos
      </label>
      <Field label="Nome do assistente" hint="Opcional. Ex.: Ana">
        <input className={inputClass} maxLength={40} value={v.assistantName ?? ''} onChange={(e) => setV({ ...v, assistantName: e.target.value })} />
      </Field>
      <Field label="Apresentação" hint="Precisa deixar claro que é um assistente virtual. Vazio = texto automático abaixo.">
        <textarea className={inputClass} rows={2} maxLength={300} value={v.presentation ?? ''} onChange={(e) => setV({ ...v, presentation: e.target.value })} />
      </Field>
      <Field label="Estilo" hint="Somado ao estilo da empresa. Ex.: Tom acolhedor, chama o cliente pelo nome.">
        <textarea className={inputClass} rows={2} maxLength={300} value={v.style ?? ''} onChange={(e) => setV({ ...v, style: e.target.value })} />
      </Field>
      <Field label="Emojis">
        <select className={inputClass} value={v.emojis == null ? '' : v.emojis ? 'yes' : 'no'} onChange={(e) => setV({ ...v, emojis: e.target.value === '' ? null : e.target.value === 'yes' })}>
          <option value="">Padrão da empresa</option>
          <option value="yes">Usar com moderação</option>
          <option value="no">Não usar</option>
        </select>
      </Field>
      <div className="rounded-lg bg-slate-50 border border-line p-3 text-sm">
        <div className="text-xs text-muted mb-1">Primeira mensagem vai se apresentar assim:</div>
        {v.enabled ? preview : 'Apresentação padrão da empresa (IA personalizada desligada).'}
      </div>
      {!readOnly && (
        <div>
          <button type="button" className={buttonClass('primary', 'sm')} onClick={save}>
            Salvar
          </button>
        </div>
      )}
    </fieldset>
  );
}
