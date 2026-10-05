'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Card, buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';
import type { ReportSpec } from '@/modules/reports/report.service';

type Opt = { value: string; label: string };
type Options = {
  columns: Record<'LEADS' | 'OPPORTUNITIES', Record<string, string>>;
  groups: Record<'LEADS' | 'OPPORTUNITIES', Record<string, string>>;
  source: Opt[];
  product: Opt[];
  pjId: Opt[];
};

const PERIODS: Opt[] = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: '365d', label: 'Últimos 12 meses' },
];
const STATUS: Record<'LEADS' | 'OPPORTUNITIES', Opt[]> = {
  LEADS: ['NEW', 'QUALIFIED', 'ASSIGNED', 'IN_CONVERSATION', 'OPPORTUNITY', 'CONVERTED', 'LOST'].map((v) => ({ value: v, label: v })),
  OPPORTUNITIES: [
    { value: 'OPEN', label: 'Aberta' },
    { value: 'WON', label: 'Ganha' },
    { value: 'LOST', label: 'Perdida' },
  ],
};

export function ReportBuilder({ spec, options, saved, exportQs }: { spec: ReportSpec; options: Options; saved: { id: string; name: string; query: string }[]; exportQs: string | null }) {
  const router = useRouter();
  const [s, setS] = useState<ReportSpec>(spec);
  const cols = options.columns[s.entity];
  const selected = s.columns.length ? s.columns : Object.keys(cols).slice(0, 8);

  const toQuery = (v: ReportSpec) =>
    new URLSearchParams(
      Object.entries({ ...v, columns: v.columns.join(',') }).filter(([, x]) => x !== null && x !== undefined && x !== '') as [string, string][]
    ).toString();

  function apply(next = s) {
    router.push(`/relatorios?${toQuery(next)}`);
  }

  async function save() {
    const name = window.prompt('Nome do relatório:');
    if (!name) return;
    try {
      await api('/saved-filters', { body: { page: '/relatorios', name, query: toQuery(s) } });
      toast('Relatório salvo.');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const select = (label: string, key: keyof ReportSpec, list: Opt[], empty = 'Todos') => (
    <Field label={label}>
      <select className={inputClass} value={(s[key] as string) ?? ''} onChange={(e) => setS({ ...s, [key]: e.target.value || null })}>
        <option value="">{empty}</option>
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <Card>
      <div className="grid md:grid-cols-4 gap-3">
        <Field label="Entidade">
          <select className={inputClass} value={s.entity} onChange={(e) => setS({ ...s, entity: e.target.value as ReportSpec['entity'], columns: [], groupBy: null, status: null })}>
            <option value="LEADS">Leads</option>
            <option value="OPPORTUNITIES">Oportunidades</option>
          </select>
        </Field>
        {select('Período', 'period', PERIODS, 'Últimos 30 dias')}
        {select(
          'Agrupar por',
          'groupBy',
          Object.entries(options.groups[s.entity]).map(([value, label]) => ({ value, label })),
          'Sem agrupamento (linhas)'
        )}
        {select('Situação', 'status', STATUS[s.entity])}
        {select('Origem', 'source', options.source)}
        {select('Produto', 'product', options.product)}
        {options.pjId.length > 0 && select('PJ', 'pjId', options.pjId)}
        {s.entity === 'LEADS' &&
          select('Temperatura', 'temperature', [
            { value: 'QUENTE', label: 'Quente' },
            { value: 'MORNO', label: 'Morno' },
            { value: 'FRIO', label: 'Frio' },
          ])}
      </div>
      {!s.groupBy && (
        <fieldset className="mt-4">
          <legend className="text-[12.5px] font-medium text-ink-2 mb-1.5">Colunas</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {Object.entries(cols).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={(e) => setS({ ...s, columns: e.target.checked ? [...selected, key] : selected.filter((c) => c !== key) })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className={buttonClass('primary')} onClick={() => apply()}>
          Gerar relatório
        </button>
        <button className={buttonClass('secondary')} onClick={save}>
          Salvar relatório
        </button>
        {exportQs !== null && (
          <>
            <a className={buttonClass('secondary')} href={`/api/v1/reports/export?format=csv&${exportQs}`}>
              Exportar CSV
            </a>
            <a className={buttonClass('secondary')} href={`/api/v1/reports/export?format=xlsx&${exportQs}`}>
              XLSX
            </a>
          </>
        )}
        {saved.length > 0 && (
          <select className={`${inputClass} max-w-60 ml-auto`} defaultValue="" onChange={(e) => e.target.value && router.push(`/relatorios?${e.target.value}`)} aria-label="Relatórios salvos">
            <option value="">Relatórios salvos…</option>
            {saved.map((r) => (
              <option key={r.id} value={r.query}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </Card>
  );
}
