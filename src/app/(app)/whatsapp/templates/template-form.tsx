'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

type V = { name: string; category: string; language: string; body: string };

export function TemplateForm({ id, initial }: { id?: string; initial?: V }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<V>(initial ?? { name: '', category: 'UTILITY', language: 'pt_BR', body: 'Olá {{1}}, ' });
  const needsOptOut = v.category === 'MARKETING' && !/sair|parar|stop/i.test(v.body);
  return (
    <>
      <button className={id ? buttonClass('ghost', 'sm') : buttonClass('primary')} onClick={() => setOpen(true)}>
        {id ? 'Editar' : '+ Novo template'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={id ? 'Editar template' : 'Novo template'}
        footer={
          <button
            className={buttonClass('primary')}
            disabled={needsOptOut}
            onClick={async () => {
              try {
                await api(id ? `/whatsapp/templates/${id}` : '/whatsapp/templates', { method: id ? 'PATCH' : 'POST', body: v });
                toast('Template salvo como rascunho.');
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Salvar
          </button>
        }
      >
        <div className="grid gap-3">
          <Field label="Nome (minúsculas e _)">
            <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
          </Field>
          <Field label="Categoria">
            <select className={inputClass} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
              <option value="UTILITY">Utilidade (atendimento)</option>
              <option value="MARKETING">Marketing</option>
              <option value="AUTHENTICATION">Autenticação</option>
            </select>
          </Field>
          <Field label="Texto" hint="Use {{1}}, {{2}}… para variáveis.">
            <textarea className={inputClass + ' h-28 py-2'} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
          </Field>
          {needsOptOut && <p className="text-xs text-bad">Templates de marketing precisam informar como parar de receber mensagens (ex.: &quot;Responda SAIR&quot;).</p>}
        </div>
      </Modal>
    </>
  );
}
