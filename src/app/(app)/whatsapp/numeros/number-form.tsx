'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

type V = { name: string; phone: string; purpose: string; dailyLimit: string; webhookUrl: string; consultantId: string; priority: string; providerNumberId?: string };
type Owner = { id: string; name: string };

export function NumberForm({ id, initial, consultants = [], label }: { id?: string; initial?: V; consultants?: Owner[]; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<V>(initial ?? { name: '', phone: '', purpose: 'TEAM', dailyLimit: '250', webhookUrl: '', consultantId: '', priority: '0' });
  return (
    <>
      <button className={id ? buttonClass('ghost', 'sm') : buttonClass('primary')} onClick={() => setOpen(true)}>
        {label ?? (id ? 'Editar' : '+ Adicionar número')}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={id ? 'Editar número' : 'Adicionar número'}
        footer={
          <button
            className={buttonClass('primary')}
            onClick={async () => {
              try {
                await api(id ? `/whatsapp/numbers/${id}` : '/whatsapp/numbers', { method: id ? 'PATCH' : 'POST', body: { ...v, dailyLimit: Number(v.dailyLimit), priority: Number(v.priority || 0), consultantId: v.consultantId || null, providerNumberId: v.providerNumberId || null } });
                toast('Número salvo.');
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
          <Field label="Nome">
            <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Telefone" hint="Do exterior: use + e o código do país (ex.: +1 305 555 0100).">
            <input className={inputClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Consultor dono" hint="Cada consultor tem de 1 a 7 números.">
              <select className={inputClass} value={v.consultantId} onChange={(e) => setV({ ...v, consultantId: e.target.value, purpose: e.target.value ? 'TEAM' : v.purpose })}>
                <option value="">— Número da operação (bots/equipe) —</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ordem" hint="0 = principal">
              <input className={inputClass} inputMode="numeric" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value.replace(/\D/g, '').slice(0, 1) })} />
            </Field>
          </div>
          <Field label="Finalidade">
            <select className={inputClass} value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })}>
              <option value="PROSPECT_BOT">Prospect Agent</option>
              <option value="QUALIFICATION_BOT">Qualification Agent</option>
              <option value="TEAM">Equipe (consultores)</option>
            </select>
          </Field>
          <Field label="ID do número na Meta (phone_number_id)" hint="Obrigatório para a API oficial. Fica no Gerenciador do WhatsApp → API.">
            <input className={inputClass} inputMode="numeric" value={v.providerNumberId ?? ''} onChange={(e) => setV({ ...v, providerNumberId: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Limite diário de envios" hint="Respeite o limite do tier da conta na plataforma oficial.">
            <input className={inputClass} inputMode="numeric" value={v.dailyLimit} onChange={(e) => setV({ ...v, dailyLimit: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Webhook (opcional)">
            <input className={inputClass} value={v.webhookUrl} onChange={(e) => setV({ ...v, webhookUrl: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
