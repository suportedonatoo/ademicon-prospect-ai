'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

export function NewPromptVersion({ agentKey, base }: { agentKey: string; base: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState(base);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button className={buttonClass('secondary', 'sm')} onClick={() => { setInstructions(base); setOpen(true); }}>
        Nova versão
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova versão de prompt (rascunho)"
        wide
        footer={
          <button
            className={buttonClass('primary')}
            disabled={busy || instructions.trim().length < 10}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/ai/prompts', { body: { agentKey, instructions, changeNote: note || undefined } });
                toast('Rascunho criado. Teste no AI Lab antes de publicar.');
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar rascunho
          </button>
        }
      >
        <Field label="Instruções do agente">
          <textarea className={inputClass + ' h-80 py-2 font-mono text-[12.5px]'} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </Field>
        <Field label="Nota da alteração" className="mt-3">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que mudou e por quê" />
        </Field>
      </Modal>
    </>
  );
}
