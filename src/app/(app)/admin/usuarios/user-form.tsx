'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast, showTempPassword } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

type V = { name: string; email: string; roleKey: string; pjId: string; consultantId: string; status: 'ACTIVE' | 'DISABLED' };
type Opt = { id: string; name: string };

export function UserForm({ id, initial, roles, pjs, consultants }: { id?: string; initial?: V; roles: { key: string; name: string }[]; pjs: Opt[]; consultants: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<V>(initial ?? { name: '', email: '', roleKey: 'CONSULTANT', pjId: '', consultantId: '', status: 'ACTIVE' });
  const [temp, setTemp] = useState<string | null>(null);
  return (
    <>
      <button className={id ? buttonClass('ghost', 'sm') : buttonClass('primary')} onClick={() => setOpen(true)}>
        {id ? 'Editar' : '+ Novo usuário'}
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setTemp(null);
        }}
        title={id ? 'Editar usuário' : 'Novo usuário'}
        footer={
          !temp && (
            <button
              className={buttonClass('primary')}
              onClick={async () => {
                try {
                  const r = await api<{ tempPassword?: string | null }>(id ? `/users/${id}` : '/users', { method: id ? 'PATCH' : 'POST', body: { ...v, pjId: v.pjId || null, consultantId: v.consultantId || null } });
                  toast('Usuário salvo (auditado).');
                  router.refresh();
                  if (r.tempPassword) {
                    setTemp(r.tempPassword);
                    showTempPassword({ name: v.name, email: v.email, password: r.tempPassword });
                  }
                  else setOpen(false);
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              Salvar
            </button>
          )
        }
      >
        {temp ? (
          <div className="space-y-2 text-sm">
            <p>Usuário criado. Senha temporária (exibida uma única vez — entregue por canal seguro):</p>
            <code className="block rounded-lg bg-slate-900 text-slate-100 p-3">{temp}</code>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nome" className="sm:col-span-2">
              <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="E-mail" className="sm:col-span-2">
              <input className={inputClass} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Field>
            <Field label="Perfil">
              <select className={inputClass} value={v.roleKey} onChange={(e) => setV({ ...v, roleKey: e.target.value })}>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className={inputClass} value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as V['status'] })}>
                <option value="ACTIVE">Ativo</option>
                <option value="DISABLED">Desativado (encerra sessões)</option>
              </select>
            </Field>
            {(v.roleKey === 'PJ_MANAGER' || v.roleKey === 'CONSULTANT') && (
              <Field label="PJ">
                <select className={inputClass} value={v.pjId} onChange={(e) => setV({ ...v, pjId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {pjs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {v.roleKey === 'CONSULTANT' && (
              <Field label="Cadastro de consultor">
                <select className={inputClass} value={v.consultantId} onChange={(e) => setV({ ...v, consultantId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {consultants.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
