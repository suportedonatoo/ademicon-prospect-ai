'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, FieldGroup, Modal, inputClass } from '@/components/client';

export function WebhookForm({ events }: { events: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', url: 'https://', events: ['lead.created', 'lead.assigned', 'opportunity.closed'] });
  return (
    <>
      <button className={buttonClass('primary')} onClick={() => setOpen(true)}>
        + Nova assinatura
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova assinatura de webhook"
        wide
        footer={
          <button
            className={buttonClass('primary')}
            onClick={async () => {
              try {
                await api('/webhooks', { body: { ...v, active: true } });
                toast('Assinatura criada.');
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Criar
          </button>
        }
      >
        <div className="grid gap-3">
          <Field label="Nome">
            <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="URL (HTTPS em produção)">
            <input className={inputClass} value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />
          </Field>
          <FieldGroup label="Eventos">
            <div className="grid sm:grid-cols-3 gap-1.5">
              {events.map((e) => (
                <label key={e} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={v.events.includes(e)} onChange={(x) => setV({ ...v, events: x.target.checked ? [...v.events, e] : v.events.filter((y) => y !== e) })} /> {e}
                </label>
              ))}
            </div>
          </FieldGroup>
        </div>
      </Modal>
    </>
  );
}
