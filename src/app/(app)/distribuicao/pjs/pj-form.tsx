'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

type V = {
  code: string;
  name: string;
  city: string;
  uf: string;
  regionId: string;
  citiesServed: string;
  active: boolean;
  subdomain: string;
  landingActive: boolean;
  landingTitle: string;
  landingSubtitle: string;
  phone: string;
  whatsapp: string;
  address: string;
};

export function PjForm({ id, initial, regions, landingDomain }: { id?: string; initial?: V; regions: { id: string; name: string }[]; landingDomain: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<V>(
    initial ?? { code: '', name: '', city: '', uf: 'SP', regionId: regions[0]?.id ?? '', citiesServed: '', active: true, subdomain: '', landingActive: false, landingTitle: '', landingSubtitle: '', phone: '', whatsapp: '', address: '' }
  );
  return (
    <>
      <button className={id ? buttonClass('ghost', 'sm') : buttonClass('primary')} onClick={() => setOpen(true)}>
        {id ? 'Editar' : '+ Nova PJ'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={id ? 'Editar PJ' : 'Nova PJ'}
        footer={
          <button
            className={buttonClass('primary')}
            onClick={async () => {
              try {
                await api(id ? `/pjs/${id}` : '/pjs', { method: id ? 'PATCH' : 'POST', body: { ...v, regionId: v.regionId || null, citiesServed: v.citiesServed.split(',').map((c) => c.trim()).filter(Boolean) } });
                toast('PJ salva.');
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
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Código">
            <input className={inputClass} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} placeholder="PJ11" />
          </Field>
          <Field label="Região">
            <select className={inputClass} value={v.regionId} onChange={(e) => setV({ ...v, regionId: e.target.value })}>
              <option value="">—</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome" className="sm:col-span-2">
            <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Cidade sede">
            <input className={inputClass} value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} />
          </Field>
          <Field label="UF">
            <input className={inputClass} maxLength={2} value={v.uf} onChange={(e) => setV({ ...v, uf: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Cidades atendidas (vírgula)" className="sm:col-span-2" hint="Usado pelo fallback do Lead Router quando nenhuma regra se aplica.">
            <input className={inputClass} value={v.citiesServed} onChange={(e) => setV({ ...v, citiesServed: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Ativa (recebe leads)
          </label>
          <div className="sm:col-span-2 border-t border-line pt-3 mt-1">
            <b className="text-sm">Landing da PJ</b>
            <p className="text-xs text-muted">Página própria com simulador. Frio = só simulou · Morno = deixou contato · Quente = pediu para ser chamado agora.</p>
          </div>
          <Field label="Subdomínio" className="sm:col-span-2" hint={v.subdomain ? `Endereço: ${landingDomain.replace('{subdomain}', v.subdomain)}` : 'Ex.: jundiai-centro'}>
            <input
              className={inputClass}
              value={v.subdomain}
              onChange={(e) => setV({ ...v, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              placeholder="jundiai-centro"
            />
          </Field>
          <Field label="Título da landing" className="sm:col-span-2" hint="Opcional — padrão: Consórcio em <cidade> com atendimento local">
            <input className={inputClass} maxLength={120} value={v.landingTitle} onChange={(e) => setV({ ...v, landingTitle: e.target.value })} />
          </Field>
          <Field label="Subtítulo" className="sm:col-span-2">
            <input className={inputClass} maxLength={240} value={v.landingSubtitle} onChange={(e) => setV({ ...v, landingSubtitle: e.target.value })} />
          </Field>
          <Field label="WhatsApp da unidade" hint="Botões de WhatsApp da landing">
            <input className={inputClass} inputMode="tel" placeholder="(11) 99999-9999" value={v.whatsapp} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} />
          </Field>
          <Field label="Telefone da unidade" hint="Botão Ligar">
            <input className={inputClass} inputMode="tel" placeholder="(11) 4000-0000" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </Field>
          <Field label="Endereço da unidade" className="sm:col-span-2">
            <input className={inputClass} maxLength={240} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={v.landingActive} disabled={!v.subdomain} onChange={(e) => setV({ ...v, landingActive: e.target.checked })} /> Landing no ar
          </label>
        </div>
      </Modal>
    </>
  );
}
