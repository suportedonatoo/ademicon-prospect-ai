'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';
import { Avatar } from '@/components/avatar';
import { photoProblem, uploadPhoto } from '@/components/photo-picker';

type Opt = { id: string; name: string };
type Created = {
  consultantId: string;
  name: string;
  email: string;
  tempPassword: string | null;
  warning: string | null;
  landingUrl?: string;
};

export function MemberForm({ pjs }: { pjs: Opt[] }) {
  const router = useRouter();
  const blank = {
    name: '',
    email: '',
    pjId: pjs.length === 1 ? pjs[0].id : '',
    instagram: '',
    numbers: ['', ''],
  };
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(blank);
  const [done, setDone] = useState<Created | null>(null);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [photoFailed, setPhotoFailed] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setDone(null);
    setV(blank);
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
    setPhotoFailed(null);
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<Created>('/team', {
        body: {
          name: v.name,
          email: v.email,
          pjId: v.pjId,
          instagram: v.instagram || null,
          numbers: v.numbers.filter((n) => n.trim()),
        },
      });
      if (photo) {
        // O cadastro já foi feito; se só a foto falhar, avisa e dá para enviar depois pela lista.
        await uploadPhoto(r.consultantId, photo.file).catch((e: Error) => setPhotoFailed(e.message));
      }
      setDone(r);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className={buttonClass('primary')} onClick={() => setOpen(true)}>
        + Adicionar colaborador
      </button>
      <Modal
        open={open}
        onClose={close}
        title={done ? 'Colaborador cadastrado' : 'Adicionar colaborador'}
        footer={
          done ? (
            <button className={buttonClass('primary')} onClick={close}>
              Fechar
            </button>
          ) : (
            <button className={buttonClass('primary')} disabled={busy} onClick={save}>
              {busy ? 'Salvando…' : 'Cadastrar e começar a receber leads'}
            </button>
          )
        }
      >
        {done ? (
          <div className="space-y-3 text-sm">
            <p>
              <b>{done.name}</b> já está na divisão igual e recebe o próximo lead na vez dele.
            </p>
            {done.warning && <p className="text-warn">{done.warning}</p>}
            {photoFailed && <p className="text-warn">A foto não foi salva ({photoFailed}). Envie de novo clicando na foto, na lista da equipe.</p>}
            {done.landingUrl && (
              <p>
                Link para a bio: <b className="font-mono text-xs">{done.landingUrl}</b>
                <br />
                <span className="text-xs text-muted">Quem chegar por este link e deixar contato vira lead desta pessoa.</span>
              </p>
            )}
            {done.tempPassword && (
              <div className="rounded-lg border border-line bg-slate-50 p-3">
                Login: <b>{done.email}</b>
                <br />
                Senha provisória: <code className="font-mono">{done.tempPassword}</code>
                <p className="text-xs text-muted mt-1">Aparece só agora. Entregue à pessoa por um canal privado; ela troca no primeiro acesso.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <Field label="Foto" hint="JPG, PNG ou WEBP, até 3 MB (opcional). Aparece só aqui dentro do sistema, nunca na página pública.">
              <div className="flex items-center gap-3">
                <Avatar name={v.name || '?'} url={photo?.preview ?? null} size={56} />
                <label className={buttonClass('secondary', 'sm') + ' cursor-pointer'}>
                  {photo ? 'Trocar foto' : 'Escolher foto'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const problem = photoProblem(file);
                      if (problem) return toast(problem, 'error');
                      if (photo) URL.revokeObjectURL(photo.preview);
                      setPhoto({ file, preview: URL.createObjectURL(file) });
                    }}
                  />
                </label>
                {photo && (
                  <button
                    type="button"
                    className={buttonClass('ghost', 'sm')}
                    onClick={() => {
                      URL.revokeObjectURL(photo.preview);
                      setPhoto(null);
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
            </Field>
            <Field label="Nome completo">
              <input className={inputClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="E-mail (login)">
              <input className={inputClass} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Field>
            <Field label="Unidade">
              <select className={inputClass} value={v.pjId} onChange={(e) => setV({ ...v, pjId: e.target.value })}>
                <option value="">Escolha…</option>
                {pjs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Instagram" hint="@usuario ou o link do perfil (opcional)">
              <input className={inputClass} placeholder="@usuario" value={v.instagram} onChange={(e) => setV({ ...v, instagram: e.target.value })} />
            </Field>
            <Field label="Números de WhatsApp (1 a 7)" hint="O 1º é o principal; os demais são backup. Do exterior: + e o código do país.">
              <div className="grid gap-2">
                {v.numbers.map((n, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={inputClass}
                      placeholder={i === 0 ? 'Principal: +55 11 91234-5678' : `Backup ${i}`}
                      value={n}
                      onChange={(e) =>
                        setV({
                          ...v,
                          numbers: v.numbers.map((x, j) => (j === i ? e.target.value : x)),
                        })
                      }
                    />
                    {v.numbers.length > 1 && (
                      <button
                        type="button"
                        className={buttonClass('ghost', 'sm')}
                        onClick={() =>
                          setV({
                            ...v,
                            numbers: v.numbers.filter((_, j) => j !== i),
                          })
                        }
                        aria-label="Remover número"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {v.numbers.length < 7 && (
                  <button type="button" className={buttonClass('secondary', 'sm') + ' justify-self-start'} onClick={() => setV({ ...v, numbers: [...v.numbers, ''] })}>
                    + número
                  </button>
                )}
              </div>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}

type ImportResult = {
  total: number;
  created: number;
  results: {
    line: number;
    name: string;
    email: string;
    ok: boolean;
    error?: string;
    warning?: string | null;
    tempPassword?: string | null;
  }[];
};

export function TeamImport({ template }: { template: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState('');
  const [res, setRes] = useState<ImportResult | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      setRes(await api<ImportResult>('/team/import', { body: { csv } }));
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className={buttonClass('secondary')} onClick={() => setOpen(true)}>
        Subir planilha
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setRes(null);
          setCsv('');
        }}
        title="Cadastrar equipe por planilha"
        footer={
          !res && (
            <button className={buttonClass('primary')} disabled={busy || !csv.trim()} onClick={run}>
              {busy ? 'Cadastrando…' : 'Cadastrar todos'}
            </button>
          )
        }
      >
        {res ? (
          <div className="space-y-3 text-sm">
            <p>
              <b>{res.created}</b> de {res.total} cadastrada(s) — já recebendo leads em partes iguais.
            </p>
            <div className="max-h-80 overflow-auto border border-line rounded-lg">
              <table className="w-full text-xs">
                <tbody>
                  {res.results.map((r) => (
                    <tr key={r.line} className="border-b border-line">
                      <td className="p-2 text-muted">{r.line}</td>
                      <td className="p-2">
                        {r.name}
                        <div className="text-muted">{r.email}</div>
                      </td>
                      <td className="p-2">
                        {r.ok ? (
                          <>
                            <span className="text-ok">OK</span>
                            {r.tempPassword && (
                              <div>
                                senha: <code className="font-mono">{r.tempPassword}</code>
                              </div>
                            )}
                            {r.warning && <div className="text-warn">{r.warning}</div>}
                          </>
                        ) : (
                          <span className="text-bad">{r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">As senhas provisórias aparecem só agora. Entregue a cada pessoa por um canal privado.</p>
          </div>
        ) : (
          <div className="grid gap-3 text-sm">
            <p>
              Uma pessoa por linha: <code>nome; email; unidade; instagram; whatsapp1; … whatsapp7</code>. Pode colar direto do Excel/Google Planilhas (salvo como CSV) ou escolher o arquivo.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
            <textarea className={inputClass + ' font-mono text-xs'} rows={8} placeholder={template} value={csv} onChange={(e) => setCsv(e.target.value)} />
            <a className="text-brand-600 hover:underline text-xs" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download="modelo-equipe.csv">
              Baixar modelo
            </a>
          </div>
        )}
      </Modal>
    </>
  );
}
