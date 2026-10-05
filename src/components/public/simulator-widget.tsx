'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { ChatWidget } from './chat-widget';

type ProductCfg = { key: string; label: string; termOptions: number[]; minValue: number; maxValue: number };
type Result = { protocol: string; chatToken: string; result: { value: number; options: { termMonths: number; installment: number; basis: string }[]; disclaimer: string } };

const OBJECTIVES: Record<string, string[]> = {
  IMOVEL: ['Aquisição de imóvel', 'Construção ou reforma', 'Investimento / patrimônio'],
  VEICULO: ['Aquisição de veículo', 'Troca de veículo'],
  MOTO: ['Aquisição de moto'],
  SERVICOS: ['Serviços (educação, saúde, eventos)'],
  BENS_MOVEIS: ['Equipamentos para empresa'],
};

const brl = (v: number, d = 0) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d });
const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const SESSION_KEY = 'pa_attr_session';

export function SimulatorWidget({
  simulatorSlug,
  landingSlug,
  products,
  required,
  consentText,
  ctaText = 'Simular agora',
  defaultProduct,
  experimentVariantId,
}: {
  simulatorSlug: string;
  landingSlug?: string;
  products: ProductCfg[];
  required: string[];
  consentText: string;
  ctaText?: string;
  defaultProduct?: string | null;
  experimentVariantId?: string | null;
}) {
  const initialProduct = products.find((p) => p.key === defaultProduct)?.key ?? products[0]?.key;
  const [f, setF] = useState({ product: initialProduct, objective: '', value: '', termMonths: '', city: '', uf: 'SP', name: '', whatsapp: '', email: '', requestContact: false, consentWhatsapp: false, consentEmail: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [chat, setChat] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const cfg = products.find((p) => p.key === f.product) ?? products[0];
  const req = (k: string) => required.includes(k);

  if (result) {
    return (
      <div className="space-y-4" aria-live="polite">
        <div>
          <div className="text-xs text-slate-500">Protocolo {result.protocol}</div>
          <h3 className="text-xl font-semibold text-slate-900">Sua simulação de {cfg.label.toLowerCase()} · {brl(result.result.value)}</h3>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {result.result.options.map((o, i) => (
            <div key={o.termMonths} className={`rounded-2xl border p-4 ${i === 0 ? 'bg-[#131c17] border-[#131c17] text-white' : 'border-slate-200 text-slate-900'}`}>
              <div className={`text-xs ${i === 0 ? 'text-white/75' : 'text-slate-500'}`}>Parcela estimada</div>
              <div className="text-xl font-bold tabular mt-1">{brl(o.installment, 2)}</div>
              <div className={`text-[11px] mt-1 ${i === 0 ? 'text-[#c8f29a]' : 'text-slate-500'}`}>
                {o.basis === 'DIVISAO_SIMPLES' ? 'crédito ÷ prazo' : 'por mês'} · {o.termMonths} meses
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">{result.result.disclaimer}</p>
        <div className="rounded-2xl bg-[#e2f3e3] p-3.5 text-sm text-[#1e7a45]">
          {f.requestContact ? 'Recebemos seu pedido! Um consultor da sua região vai entrar em contato.' : 'Simulação registrada. Se quiser, converse agora com nosso assistente para tirar dúvidas.'}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setChat(true)} className="rounded-xl bg-[#131c17] text-white px-4 h-10 text-sm font-semibold hover:bg-[#22302a]">
            Tirar dúvidas agora
          </button>
          <button onClick={() => setResult(null)} className="rounded-xl border border-slate-200 bg-white px-4 h-10 text-sm font-semibold">
            Nova simulação
          </button>
        </div>
        {chat && <ChatWidget token={result.chatToken} onClose={() => setChat(false)} />}
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const sessionKey = (() => {
            try {
              return localStorage.getItem(SESSION_KEY);
            } catch {
              return null;
            }
          })();
          const res = await api<Result>('/public/simulations', {
            body: {
              ...f,
              value: Number(String(f.value).replace(/\D/g, '')),
              termMonths: f.termMonths ? Number(f.termMonths) : null,
              simulatorSlug,
              landingSlug: landingSlug ?? null,
              sessionKey,
              experimentVariantId: experimentVariantId ?? null,
              email: f.email || null,
              objective: f.objective || null,
              city: f.city || null,
            },
          });
          setResult(res);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {products.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Produto">
          {products.map((p) => (
            <button type="button" key={p.key} role="radio" aria-checked={f.product === p.key} onClick={() => set('product', p.key)} className={`rounded-full px-3 py-1.5 text-sm font-medium border ${f.product === p.key ? 'bg-[#131c17] text-white border-[#131c17]' : 'bg-white border-slate-200 text-slate-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <L label={`Valor desejado${req('value') ? ' *' : ''}`}>
          <input className={inp} inputMode="numeric" placeholder={`${brl(cfg.minValue)} a ${brl(cfg.maxValue)}`} value={f.value ? Number(String(f.value).replace(/\D/g, '')).toLocaleString('pt-BR') : ''} onChange={(e) => set('value', e.target.value.replace(/\D/g, ''))} required={req('value')} />
        </L>
        <L label="Prazo desejado">
          <select className={inp} value={f.termMonths} onChange={(e) => set('termMonths', e.target.value)}>
            <option value="">Ver todos</option>
            {cfg.termOptions.map((t) => (
              <option key={t} value={t}>
                {t} meses
              </option>
            ))}
          </select>
        </L>
        <L label={`Objetivo${req('objective') ? ' *' : ''}`} className="sm:col-span-2">
          <select className={inp} value={f.objective} onChange={(e) => set('objective', e.target.value)} required={req('objective')}>
            <option value="">Selecione</option>
            {(OBJECTIVES[f.product] ?? []).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </L>
        <L label={`Nome${req('name') ? ' *' : ''}`} className="sm:col-span-2">
          <input className={inp} autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} required={req('name')} />
        </L>
        <L label={`WhatsApp${req('whatsapp') ? ' *' : ''}`}>
          <input className={inp} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-0000" value={f.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} required={req('whatsapp')} />
        </L>
        <L label={`E-mail${req('email') ? ' *' : ''}`}>
          <input className={inp} type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} required={req('email')} />
        </L>
        <L label={`Cidade${req('city') ? ' *' : ''}`}>
          <input className={inp} autoComplete="address-level2" value={f.city} onChange={(e) => set('city', e.target.value)} required={req('city')} />
        </L>
        <L label={`UF${req('uf') ? ' *' : ''}`}>
          <input className={inp} maxLength={2} value={f.uf} onChange={(e) => set('uf', e.target.value.toUpperCase())} required={req('uf')} />
        </L>
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={(e) => set('website', e.target.value)} aria-hidden="true" />
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-1 size-4 accent-[#2f9e5b]" checked={f.requestContact} onChange={(e) => set('requestContact', e.target.checked)} />
        Quero receber o contato de um consultor especialista.
      </label>
      <fieldset className="rounded-lg bg-slate-50 p-3 space-y-1.5">
        <legend className="sr-only">Consentimento</legend>
        <p className="text-xs text-slate-600">{consentText}</p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4 accent-[#2f9e5b]" checked={f.consentWhatsapp} onChange={(e) => set('consentWhatsapp', e.target.checked)} /> Aceito contato por WhatsApp
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4 accent-[#2f9e5b]" checked={f.consentEmail} onChange={(e) => set('consentEmail', e.target.checked)} /> Aceito contato por e-mail
        </label>
      </fieldset>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} className="w-full rounded-xl bg-[#131c17] hover:bg-[#22302a] text-white font-semibold py-3 text-[15px] disabled:opacity-60">
        {busy ? 'Calculando…' : ctaText}
      </button>
      <p className="text-[11px] text-slate-500 text-center">Simulação gratuita e sem compromisso. Seus dados são tratados conforme a LGPD.</p>
    </form>
  );
}

const inp = 'w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 focus:outline-none focus:border-[#2f9e5b] focus:ring-3 focus:ring-[#d6e4f5]';

function L({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="block text-[12.5px] font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
