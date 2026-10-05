'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

export function DataRequestForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ requesterName: '', requesterEmail: '', type: 'ACCESS', leadId: '', notes: '' });
  return (
    <>
      <button className={buttonClass('primary')} onClick={() => setOpen(true)}>
        + Registrar solicitação
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Solicitação do titular"
        footer={
          <button
            className={buttonClass('primary')}
            onClick={async () => {
              try {
                await api('/privacy/requests', { body: { ...v, leadId: v.leadId || null, notes: v.notes || undefined } });
                toast('Solicitação registrada com prazo de atendimento.');
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Registrar
          </button>
        }
      >
        <div className="grid gap-3">
          <Field label="Nome do titular">
            <input className={inputClass} value={v.requesterName} onChange={(e) => setV({ ...v, requesterName: e.target.value })} />
          </Field>
          <Field label="E-mail do titular">
            <input className={inputClass} value={v.requesterEmail} onChange={(e) => setV({ ...v, requesterEmail: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <select className={inputClass} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
              <option value="ACCESS">Acesso aos dados</option>
              <option value="CORRECTION">Correção</option>
              <option value="DELETION">Exclusão (anonimização)</option>
              <option value="PORTABILITY">Portabilidade</option>
              <option value="OPPOSITION">Oposição ao tratamento</option>
            </select>
          </Field>
          <Field label="ID do lead (opcional)" hint="Copie da URL da ficha do lead">
            <input className={inputClass} value={v.leadId} onChange={(e) => setV({ ...v, leadId: e.target.value })} />
          </Field>
          <Field label="Observações">
            <textarea className={inputClass + ' h-16 py-2'} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
