'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Chips, Field, FieldGroup, Modal, inputClass } from '@/components/client';
import { PRODUCTS, SOURCES } from '@/modules/leads/catalog';

export function NewLeadButton() {
  const [open, setOpen] = useState(false);
  // Ctrl+K → "Criar lead" abre direto o formulário (/leads?novo=1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('novo') === '1') setOpen(true);
  }, []);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [f, setF] = useState({ name: '', phone: '', email: '', city: '', uf: 'SP', product: '', desiredValue: '', source: 'MANUAL', consentWhatsapp: false });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  return (
    <>
      <button className={buttonClass('primary')} onClick={() => setOpen(true)}>
        + Novo lead
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo lead"
        subtitle="Entra no Lead Engine: deduplica, pontua e distribui."
        footer={
          <>
            <button className={buttonClass('secondary')} onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              className={buttonClass('primary')}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await api<{ leadId: string; deduplicated: boolean; matchedBy?: string }>('/leads', {
                    body: {
                      name: f.name,
                      phone: f.phone || null,
                      email: f.email || null,
                      city: f.city || null,
                      uf: f.uf || null,
                      product: f.product || null,
                      desiredValue: f.desiredValue ? Number(f.desiredValue.replace(/\D/g, '')) : null,
                      source: f.source,
                      consent: f.consentWhatsapp ? { whatsapp: true, email: false, purpose: 'SERVICE', text: 'Consentimento verbal registrado pelo consultor' } : null,
                    },
                  });
                  toast(res.deduplicated ? `Lead já existia (mesmo ${res.matchedBy === 'PHONE' ? 'telefone' : 'e-mail'}): dados unificados.` : 'Lead criado e processado (score e distribuição).');
                  setOpen(false);
                  router.push(`/leads/${res.leadId}`);
                } catch (e) {
                  toast((e as Error).message, 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Salvando…' : 'Criar lead'}
            </button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome" className="sm:col-span-2">
            <input className={inputClass} value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Telefone (WhatsApp)">
            <input className={inputClass} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(11) 9____-____" />
          </Field>
          <Field label="E-mail">
            <input className={inputClass} value={f.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Cidade">
            <input className={inputClass} value={f.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="UF">
            <input className={inputClass} maxLength={2} value={f.uf} onChange={(e) => set('uf', e.target.value.toUpperCase())} />
          </Field>
          <FieldGroup label="Produto">
            <Chips label="Produto" value={f.product} onChange={(v) => set('product', v)} options={Object.entries(PRODUCTS).map(([k, v]) => ({ value: k, label: v }))} />
          </FieldGroup>
          <Field label="Valor desejado">
            <input className={inputClass} inputMode="numeric" placeholder="R$ 0" value={f.desiredValue} onChange={(e) => set('desiredValue', e.target.value)} />
          </Field>
          <Field label="Origem">
            <select className={inputClass} value={f.source} onChange={(e) => set('source', e.target.value)}>
              {Object.entries(SOURCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-start gap-2 text-sm text-ink-2 sm:col-span-2 mt-1">
            <input type="checkbox" className="mt-1" checked={f.consentWhatsapp} onChange={(e) => set('consentWhatsapp', e.target.checked)} />
            Cliente autorizou contato por WhatsApp (LGPD)
          </label>
        </div>
        <p className="text-xs text-muted mt-4">O lead passa por validação, normalização e deduplicação. Se já existir alguém com o mesmo telefone ou e-mail, os dados são unificados, sem criar duplicata.</p>
      </Modal>
    </>
  );
}

