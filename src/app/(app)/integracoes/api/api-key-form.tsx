'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, FieldGroup, Modal, inputClass } from '@/components/client';

const COMMON = ['lead.create', 'lead.read', 'lead.update', 'opportunity.read', 'opportunity.create', 'analytics.read', 'campaign.read'];

export function ApiKeyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<string[]>(['lead.create']);
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <>
      <button className={buttonClass('primary', 'sm')} onClick={() => setOpen(true)}>
        + Nova chave
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setSecret(null);
        }}
        title="Nova chave de API"
        footer={
          !secret && (
            <button
              className={buttonClass('primary')}
              disabled={!name || !perms.length}
              onClick={async () => {
                try {
                  const r = await api<{ secret: string }>('/apikeys', { body: { name, permissions: perms } });
                  setSecret(r.secret);
                  router.refresh();
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              Criar chave
            </button>
          )
        }
      >
        {secret ? (
          <div className="space-y-2">
            <p className="text-sm">Copie a chave agora — ela não será exibida novamente.</p>
            <code className="block break-all rounded-lg bg-slate-900 text-slate-100 p-3 text-xs">{secret}</code>
          </div>
        ) : (
          <div className="grid gap-3">
            <Field label="Nome (identifica a integração)">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Formulário do site institucional" />
            </Field>
            <FieldGroup label="Permissões (princípio do menor privilégio)">
              <div className="grid grid-cols-2 gap-1.5">
                {COMMON.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={perms.includes(p)} onChange={(e) => setPerms(e.target.checked ? [...perms, p] : perms.filter((x) => x !== p))} /> <code className="text-xs">{p}</code>
                  </label>
                ))}
              </div>
            </FieldGroup>
          </div>
        )}
      </Modal>
    </>
  );
}
