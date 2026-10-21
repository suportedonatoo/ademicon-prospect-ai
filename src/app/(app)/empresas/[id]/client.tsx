'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, toast } from '@/lib/client';
import { Badge, buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

type PartnerCompany = {
  cnpj: string;
  name: string;
  segment: string;
  activity: string;
  city: string;
  uf: string;
  role: string | null;
  situation: string | null;
  score: number;
  reasons: string[];
  inBase: { id: string; mine: boolean; consultant: string | null } | null;
  sample: boolean;
};
type PartnerResult = { source: string; companies: PartnerCompany[]; warnings: string[] };

const cnpjFmt = (c: string) => (c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c);
const tone = (s: number) => (s >= 80 ? 'green' : s >= 65 ? 'blue' : s > 0 ? 'amber' : 'gray');

/** "Ver outras empresas" de um sócio: carrega sob demanda (busca cobrada na fonte paga). */
export function PartnerCompanies({ prospectId, name, canAdd }: { prospectId: string; name: string; canAdd: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<PartnerResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!data)
    return (
      <button
        type="button"
        className={buttonClass('secondary', 'sm')}
        disabled={busy === 'load'}
        onClick={async () => {
          setBusy('load');
          try {
            setData(await api<PartnerResult>(`/prospecting/${prospectId}/partners?name=${encodeURIComponent(name)}`));
          } catch (e) {
            toast((e as Error).message, 'error');
          } finally {
            setBusy(null);
          }
        }}
      >
        {busy === 'load' ? 'Buscando…' : 'Ver outras empresas'}
      </button>
    );

  return (
    <div className="mt-2 rounded-xl border border-line">
      <div className="px-3 py-2 text-xs text-muted flex flex-wrap justify-between gap-2">
        <span>
          <b className="text-ink">{data.companies.length}</b> outra(s) empresa(s) de {name} · fonte: {data.source} + empresas já na base
        </span>
        <button type="button" className="text-brand-600 hover:underline" onClick={() => setData(null)}>
          Fechar
        </button>
      </div>
      {data.warnings.map((w) => (
        <p key={w} className="px-3 pb-2 text-xs text-warn">
          {w}
        </p>
      ))}
      {data.companies.length ? (
        <ul className="divide-y divide-line">
          {data.companies.map((c) => (
            <li key={c.cnpj} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Badge tone={tone(c.score)}>{c.score ? `Nota ${c.score}` : 'Sem nota'}</Badge>
              <span className="min-w-0 flex-1">
                <b className="font-medium">{c.name}</b>
                <span className="block text-xs text-muted">
                  {c.segment} · {c.city}/{c.uf} · CNPJ {cnpjFmt(c.cnpj)}
                  {c.role ? ` · ${c.role}` : ''}
                  {c.situation && c.situation !== 'ATIVA' ? ` · ${c.situation.toLowerCase()}` : ''}
                </span>
                {c.reasons.length > 0 && <span className="block text-xs text-faint">{c.reasons.join(' · ')}</span>}
              </span>
              {c.inBase ? (
                c.inBase.mine ? (
                  <Link className={buttonClass('ghost', 'sm')} href={`/empresas/${c.inBase.id}`}>
                    Na sua lista
                  </Link>
                ) : (
                  <Badge>{c.inBase.consultant ? `Com ${c.inBase.consultant}` : 'Já na base'}</Badge>
                )
              ) : canAdd && c.score > 0 ? (
                <button
                  type="button"
                  className={buttonClass('primary', 'sm')}
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(c.cnpj);
                    try {
                      const r = await api<{ id: string }>(`/prospecting/${prospectId}/partners`, { body: { name, cnpj: c.cnpj } });
                      toast('Empresa adicionada à sua lista, já na cadência do SDR.');
                      router.push(`/empresas/${r.id}`);
                    } catch (e) {
                      toast((e as Error).message, 'error');
                      setBusy(null);
                    }
                  }}
                >
                  {busy === c.cnpj ? 'Adicionando…' : 'Adicionar à minha lista'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 pb-3 text-sm text-muted">Nenhuma outra empresa encontrada para este sócio.</p>
      )}
    </div>
  );
}

/** Botões de resultado da etapa atual do SDR, com anotação opcional. */
export function TouchButtons({ prospectId, results }: { prospectId: string; results: [string, string][] }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-2">
      <input className={inputClass} placeholder="Anotação (opcional): com quem falou, o que ficou combinado…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      <div className="flex flex-wrap gap-1.5">
        {results.map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            className={buttonClass(key === 'DECISOR' || key === 'RESPONDEU' ? 'primary' : key === 'SEM_INTERESSE' || key === 'NUMERO_ERRADO' ? 'ghost' : 'secondary', 'sm')}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/prospecting/${prospectId}/sdr`, { body: { action: 'touch', result: key, note: note || undefined } });
                toast(`Registrado: ${label}.`);
                setNote('');
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Q = { want?: string | null; value?: number | null; term?: string | null; hasBid?: boolean | null; isDecisionMaker?: boolean | null; notes?: string | null };
const yesNo = (v: boolean | null | undefined) => (v == null ? '' : v ? 'sim' : 'nao');
const fromYesNo = (v: string) => (v === '' ? null : v === 'sim');

/** Perguntas de qualificação (o que, quanto, quando, lance, decisor). */
export function QualificationForm({ prospectId, initial, product }: { prospectId: string; initial: Q | null; product: string }) {
  const router = useRouter();
  const [f, setF] = useState({ want: initial?.want ?? '', value: initial?.value ? String(initial.value) : '', term: initial?.term ?? '', hasBid: yesNo(initial?.hasBid), isDecisionMaker: yesNo(initial?.isDecisionMaker), notes: initial?.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid sm:grid-cols-2 gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api<{ qualified: boolean; done: number; total: number }>(`/prospecting/${prospectId}/sdr`, {
            body: { action: 'qualify', want: f.want || null, value: f.value ? Number(f.value.replace(/\D/g, '')) : null, term: f.term || null, hasBid: fromYesNo(f.hasBid), isDecisionMaker: fromYesNo(f.isDecisionMaker), notes: f.notes || null },
          });
          toast(r.qualified ? 'Qualificada! Já pode passar para lead.' : `Qualificação salva (${r.done} de ${r.total}).`);
          router.refresh();
        } catch (err) {
          toast((err as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="O que pretende comprar">
        <input className={inputClass} value={f.want} onChange={(e) => set('want', e.target.value)} placeholder={product === 'VEICULO' ? 'Ex.: 2 caminhões' : 'Ex.: sede própria'} />
      </Field>
      <Field label="Valor aproximado (R$)">
        <input className={inputClass} inputMode="numeric" value={f.value} onChange={(e) => set('value', e.target.value)} placeholder="Ex.: 600000" />
      </Field>
      <Field label="Para quando">
        <input className={inputClass} value={f.term} onChange={(e) => set('term', e.target.value)} placeholder="Ex.: próximos 6 meses" />
      </Field>
      <Field label="Tem valor para lance?">
        <select className={inputClass} value={f.hasBid} onChange={(e) => set('hasBid', e.target.value)}>
          <option value="">Não sei ainda</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      </Field>
      <Field label="Falou com quem decide?">
        <select className={inputClass} value={f.isDecisionMaker} onChange={(e) => set('isDecisionMaker', e.target.value)}>
          <option value="">Não sei ainda</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      </Field>
      <Field label="Observações">
        <input className={inputClass} value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} />
      </Field>
      <div className="sm:col-span-2">
        <button className={buttonClass('secondary')} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar qualificação'}
        </button>
      </div>
    </form>
  );
}
