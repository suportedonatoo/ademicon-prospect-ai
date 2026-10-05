'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

type T = { id?: string; title: string; network: string; audience: string; body: string };

const NETWORKS = [
  ['QUALQUER', 'Qualquer rede'],
  ['WHATSAPP_STATUS', 'Status do WhatsApp'],
  ['INSTAGRAM', 'Instagram'],
  ['GRUPOS', 'Grupos (WhatsApp / Facebook)'],
];

/** Criar / editar modelo do kit. Editar o texto de um modelo aprovado manda ele de volta para revisão. */
export function TemplateForm({ template }: { template?: T }) {
  const router = useRouter();
  const blank: T = { title: '', network: 'QUALQUER', audience: '', body: 'Escreva o texto aqui.\nSimulação grátis: {link}' };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<T>(template ?? blank);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(template?.id ? `/gestao/divulgacao/modelos/${template.id}` : '/gestao/divulgacao/modelos', {
        method: template?.id ? 'PUT' : 'POST',
        body: { title: v.title, network: v.network, audience: v.audience || null, body: v.body },
      });
      toast(template?.id ? 'Modelo salvo.' : 'Modelo criado. Aprove para ele entrar no kit.');
      setOpen(false);
      if (!template) setV(blank);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className={template ? 'text-xs text-brand-600 hover:underline' : buttonClass('primary')} onClick={() => setOpen(true)}>
        {template ? 'editar' : '+ Novo modelo'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={template ? 'Editar modelo' : 'Novo modelo de postagem'}
        footer={
          <button className={buttonClass('primary')} disabled={busy} onClick={save}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        }
      >
        <div className="grid gap-3">
          <Field label="Título (só para organizar)">
            <input className={inputClass} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rede">
              <select className={inputClass} value={v.network} onChange={(e) => setV({ ...v, network: e.target.value })}>
                {NETWORKS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Público (opcional)">
              <input className={inputClass} placeholder="Ex.: Brasileiros no exterior" value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value })} />
            </Field>
          </div>
          <Field label="Texto" hint="Use {link} onde entra o link do consultor e {primeiro_nome} para o nome dele. Evite taxas, valores e promessas de contemplação.">
            <textarea className={inputClass + ' h-auto py-2'} rows={8} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
          </Field>
          {template?.id && <p className="text-xs text-warn">Se mudar o texto, o modelo sai do kit até ser aprovado de novo.</p>}
        </div>
      </Modal>
    </>
  );
}
