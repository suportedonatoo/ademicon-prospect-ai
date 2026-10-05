'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Badge, Card, buttonClass, cx } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

type Job = { id: string; fileName: string; headers: string[]; mapping: Record<string, string>; totalRows: number; newCount: number; updatedCount: number; duplicateCount: number; errorCount: number; status: string };
type Preview = { total: number; valid: number; invalid: number; duplicatesInFile: number; willCreate: number; willUpdate: number };
type Detail = { job: Job; preview: { rowNumber: number; raw: Record<string, string>; status: string; errors: string[] }[]; byStatus: Record<string, number> };

const STEPS = ['Upload', 'Mapeamento', 'Validação e prévia', 'Relatório'];

export function ImportWizard({ fields, campaigns }: { fields: Record<string, string>; campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [report, setReport] = useState<Job | null>(null);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <ol className="flex flex-wrap gap-2 mb-5">
        {STEPS.map((s, i) => (
          <li key={s} className={cx('flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border', i === step ? 'bg-ink text-white border-ink' : i < step ? 'bg-ok-50 text-ok border-emerald-200' : 'bg-white text-muted border-line')}>
            <span className="tabular">{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid md:grid-cols-[1fr_280px] gap-4 items-end">
          <label className="block border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50/30">
            <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="font-medium">{file ? file.name : 'Selecione um arquivo CSV ou XLSX'}</div>
            <div className="text-xs text-muted mt-1">{file ? `${(file.size / 1024).toFixed(0)} KB` : 'Primeira linha = cabeçalho. Separador , ou ;'}</div>
          </label>
          <div className="space-y-3">
            <Field label="Atribuir à campanha (opcional)">
              <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">Nenhuma</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className={buttonClass('primary') + ' w-full'}
              disabled={!file || busy}
              onClick={() =>
                wrap(async () => {
                  const form = new FormData();
                  form.append('file', file!);
                  if (campaignId) form.append('campaignId', campaignId);
                  const j = await api<Job>('/imports', { form });
                  setJob(j);
                  setMapping(j.mapping ?? {});
                  setStep(1);
                })
              }
            >
              {busy ? 'Enviando…' : 'Enviar arquivo'}
            </button>
            {/* download de arquivo gerado pela API (não é navegação de página) */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/v1/imports/sample" className="block text-center text-xs text-brand-600 hover:underline">
              Baixar planilha de exemplo (1.000 registros fictícios)
            </a>
          </div>
        </div>
      )}

      {step === 1 && job && (
        <div>
          <p className="text-sm text-muted mb-4">
            <b className="text-ink">{job.fileName}</b> · {job.totalRows.toLocaleString('pt-BR')} linhas. Confirme a coluna de cada campo (sugestão automática pelo nome do cabeçalho).
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(fields).map(([k, label]) => (
              <Field key={k} label={label + (k === 'name' ? ' *' : '')}>
                <select className={inputClass} value={mapping[k] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value }))}>
                  <option value="">— ignorar —</option>
                  {job.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="flex gap-2 mt-5">
            <button className={buttonClass('secondary')} onClick={() => setStep(0)}>
              Voltar
            </button>
            <button
              className={buttonClass('primary')}
              disabled={busy}
              onClick={() =>
                wrap(async () => {
                  const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
                  const p = await api<Preview>(`/imports/${job.id}/validate`, { body: { mapping: clean } });
                  setPreview(p);
                  setDetail(await api<Detail>(`/imports/${job.id}`));
                  setStep(2);
                })
              }
            >
              {busy ? 'Validando…' : 'Validar e deduplicar'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && job && preview && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            {[
              ['Registros', preview.total],
              ['Serão criados', preview.willCreate],
              ['Serão atualizados', preview.willUpdate],
              ['Duplicados na planilha', preview.duplicatesInFile],
              ['Inválidos', preview.invalid],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-line p-3">
                <div className="text-xs text-muted">{l}</div>
                <div className="text-xl font-semibold tabular">{(v as number).toLocaleString('pt-BR')}</div>
              </div>
            ))}
          </div>
          {detail && (
            <div className="overflow-x-auto scroll-thin border border-line rounded-xl mb-4">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Linha</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    {job.headers.slice(0, 6).map((h) => (
                      <th key={h} className="px-3 py-2 text-left">
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left">Erros</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.preview.map((r) => (
                    <tr key={r.rowNumber} className="border-t border-line">
                      <td className="px-3 py-1.5 tabular">{r.rowNumber}</td>
                      <td className="px-3 py-1.5">
                        <Badge tone={r.status === 'VALID' ? 'green' : r.status === 'DUPLICATE' ? 'amber' : 'red'}>{r.status}</Badge>
                      </td>
                      {job.headers.slice(0, 6).map((h) => (
                        <td key={h} className="px-3 py-1.5 whitespace-nowrap">
                          {r.raw[h]}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-bad">{r.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted mb-4">Leads importados não recebem mensagens automáticas sem consentimento registrado. A origem dos dados fica gravada em cada lead.</p>
          <div className="flex gap-2">
            <button className={buttonClass('secondary')} onClick={() => setStep(1)}>
              Ajustar mapeamento
            </button>
            <button
              className={buttonClass('primary')}
              disabled={busy || !preview.valid}
              onClick={() =>
                wrap(async () => {
                  const done = await api<Job>(`/imports/${job.id}/execute`, { method: 'POST' });
                  setReport(done);
                  setStep(3);
                  router.refresh();
                })
              }
            >
              {busy ? `Importando ${preview.valid.toLocaleString('pt-BR')} registros…` : `Importar ${preview.valid.toLocaleString('pt-BR')} registros`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && report && (
        <div>
          <div className="text-lg font-semibold mb-3">Importação concluída</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ['Registros', report.totalRows],
              ['Novos', report.newCount],
              ['Atualizados', report.updatedCount],
              ['Duplicados', report.duplicateCount],
              ['Erros', report.errorCount],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-line p-3">
                <div className="text-xs text-muted">{l}</div>
                <div className="text-2xl font-semibold tabular">{(v as number).toLocaleString('pt-BR')}</div>
              </div>
            ))}
          </div>
          <button
            className={buttonClass('secondary') + ' mt-5'}
            onClick={() => {
              setStep(0);
              setFile(null);
              setJob(null);
              setReport(null);
            }}
          >
            Nova importação
          </button>
        </div>
      )}
    </Card>
  );
}
