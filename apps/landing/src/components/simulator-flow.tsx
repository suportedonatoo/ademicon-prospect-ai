'use client';

import { useMemo, useState } from 'react';
import { PRODUCT_COPY, sortProducts } from '@/content/master';
import { getSessionKey, post } from './session';
import { ChatBox } from './chat-box';
import { trackContactClick } from './contact-buttons';

interface Product {
  key: string;
  label: string;
  termOptions: number[];
  minValue: number;
  maxValue: number;
  installmentRange: { min: number; max: number };
}

type Mode = 'PARCELA' | 'CREDITO';

interface SimResult {
  simulationId: string;
  result: {
    mode: Mode;
    value: number;
    installmentTarget?: number;
    options: { termMonths: number; installment: number; credit: number; basis: string }[];
    disclaimer: string;
    /** Faixas oficiais da administradora (sem tabela estimada). */
    officialRange?: { creditMin: number; creditMax: number; installmentMin: number; installmentMax: number };
  };
}

type Step = 'simular' | 'resultado' | 'contato' | 'enviado';
type Heat = 'MORNO' | 'QUENTE';

const brl0 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** Brasil: (11) 99999-9999. Exterior: começa com + e mantém o código do país (até 15 dígitos, padrão internacional). */
function maskPhone(v: string) {
  if (v.trim().startsWith('+')) {
    const intl = onlyDigits(v).slice(0, 15);
    return `+${intl}`; // sem espaços automáticos: o código do país tem de 1 a 3 dígitos
  }
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

/** Valor inicial sugerido: ~45% da faixa, arredondado. */
function suggested(p: Product, mode: Mode) {
  if (mode === 'PARCELA') {
    const { min, max } = p.installmentRange;
    return Math.max(min, Math.round((min + (max - min) * 0.45) / 100) * 100);
  }
  return Math.max(p.minValue, Math.round((p.minValue + (p.maxValue - p.minValue) * 0.35) / 1000) * 1000);
}

const CONSENT_TEXT = (pjName: string) => `Autorizo a ${pjName} a me contatar pelo WhatsApp sobre esta simulação. Posso cancelar a qualquer momento respondendo "PARAR".`;

const field = 'w-full rounded-lg border border-line bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const label = 'block text-[15px] font-bold text-ink mb-2';

export function SimulatorFlow({
  site,
  products: rawProducts,
  pjName,
  privacyUrl,
  initialProduct,
}: {
  site: string;
  products: Product[];
  pjName: string;
  privacyUrl: string | null;
  initialProduct?: string;
}) {
  const products = useMemo(() => sortProducts(rawProducts), [rawProducts]);
  const start = products.find((p) => p.key === initialProduct) ?? products[0];
  const [step, setStep] = useState<Step>('simular');
  const [productKey, setProductKey] = useState(start?.key ?? '');
  const product = products.find((p) => p.key === productKey) ?? products[0];
  const [mode, setMode] = useState<Mode>('PARCELA');
  const [amount, setAmount] = useState<number>(() => (start ? suggested(start, 'PARCELA') : 0));
  const [sim, setSim] = useState<SimResult | null>(null);
  const [heat, setHeat] = useState<Heat>('MORNO');
  const [contact, setContact] = useState({ name: '', whatsapp: '', email: '', bestTime: '', consent: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [protocol, setProtocol] = useState('');
  // Dois caminhos: 'APENAS' (só simular → FRIO, bot do visitante) · 'INTERESSE' (deixa contato → MORNO/QUENTE, bot de qualificação)
  const [path, setPath] = useState<'APENAS' | 'INTERESSE'>('APENAS');
  const [chatToken, setChatToken] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  if (!product) return <div className="rounded-3xl bg-white border border-line p-6">Simulador indisponível no momento.</div>;

  const range = mode === 'PARCELA' ? product.installmentRange : { min: product.minValue, max: product.maxValue };
  const step_ = mode === 'PARCELA' ? 10 : 1000;
  const outOfRange = amount < range.min || amount > range.max;
  const fill = `${Math.min(100, Math.max(0, ((amount - range.min) / (range.max - range.min || 1)) * 100))}%`;
  const productName = (p: Product) => PRODUCT_COPY[p.key]?.title ?? p.label;

  function changeProduct(key: string) {
    const p = products.find((x) => x.key === key)!;
    setProductKey(key);
    setAmount(suggested(p, mode));
    setError('');
  }
  function changeMode(m: Mode) {
    setMode(m);
    setAmount(suggested(product, m));
    setError('');
  }
  /** Digitação de dinheiro: parcela em centavos ("400000" → 4.000,00); crédito em reais. */
  function typeAmount(raw: string) {
    const d = onlyDigits(raw).slice(0, 12);
    setAmount(mode === 'PARCELA' ? Number(d || 0) / 100 : Number(d || 0));
  }

  async function simulate(e: React.FormEvent, which: 'APENAS' | 'INTERESSE' = 'APENAS') {
    e.preventDefault();
    setPath(which);
    if (!amount || outOfRange) return setError(`Escolha um valor entre ${brl2(range.min)} e ${brl2(range.max)}.`);
    setBusy(true);
    setError('');
    try {
      const data = await post<SimResult>('/api/simulate', {
        site,
        sessionKey: getSessionKey() ?? undefined,
        product: product.key,
        mode,
        ...(mode === 'PARCELA' ? { installment: amount } : { value: amount }),
      });
      setSim(data);
      setStep(which === 'INTERESSE' ? 'contato' : 'resultado');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function goInterest() {
    setPath('INTERESSE');
    setError('');
    setStep('contato');
  }

  async function sendInterest(e: React.FormEvent) {
    e.preventDefault();
    if (!sim) return;
    if (!contact.consent) return setError('Para entrarmos em contato, marque a autorização.');
    setBusy(true);
    setError('');
    try {
      const data = await post<{ protocol: string; chatToken: string; whatsappUrl?: string | null }>('/api/interest', {
        site,
        simulationId: sim.simulationId,
        sessionKey: getSessionKey() ?? undefined,
        name: contact.name,
        whatsapp: contact.whatsapp,
        email: contact.email || undefined,
        bestTime: heat === 'MORNO' ? contact.bestTime || undefined : undefined,
        callNow: heat === 'QUENTE',
        consentWhatsapp: contact.consent,
        consentText: CONSENT_TEXT(pjName),
        website: contact.website,
      });
      setProtocol(data.protocol);
      setChatToken(data.chatToken);
      setWhatsappUrl(data.whatsappUrl ?? null);
      setStep('enviado');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white text-ink border border-line p-5 sm:p-6 w-full">
      {step === 'simular' && (
        <form onSubmit={simulate} className="space-y-5" noValidate>
          <h2 className="text-[19px] font-bold leading-snug text-brand-500">Você está perto de realizar o seu projeto de vida</h2>

          <div>
            <label htmlFor="tipo" className={label}>
              Selecione um tipo de consórcio
            </label>
            <select id="tipo" value={product.key} onChange={(e) => changeProduct(e.target.value)} className={`${field} bg-brand-50/60 appearance-none bg-no-repeat pr-10`} style={{ backgroundImage: CHEVRON, backgroundPosition: 'right 14px center' }}>
              {products.map((p) => (
                <option key={p.key} value={p.key}>
                  {productName(p)}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className={label}>Simular Plano por</legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1" role="radiogroup">
              {(['PARCELA', 'CREDITO'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => changeMode(m)}
                  className={`rounded-lg py-2.5 text-[15px] font-semibold transition ${mode === m ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-2 hover:bg-white'}`}
                >
                  {m === 'PARCELA' ? 'Parcela' : 'Crédito'}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="valor" className={label}>
              {mode === 'PARCELA' ? 'Valor da parcela' : 'Valor do crédito'}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">R$</span>
              <input
                id="valor"
                inputMode="numeric"
                className={`${field} pl-11`}
                value={amount ? (mode === 'PARCELA' ? num2(amount) : amount.toLocaleString('pt-BR')) : ''}
                onChange={(e) => typeAmount(e.target.value)}
                aria-invalid={outOfRange}
              />
            </div>
            <input
              type="range"
              aria-label={mode === 'PARCELA' ? 'Valor da parcela' : 'Valor do crédito'}
              className="range-brand mt-4"
              min={range.min}
              max={range.max}
              step={step_}
              value={Math.min(range.max, Math.max(range.min, amount))}
              onChange={(e) => setAmount(Number(e.target.value))}
              style={{ ['--fill' as string]: fill }}
            />
            <div className="mt-1.5 flex justify-between text-xs text-muted tabular-nums">
              <span>{brl2(range.min)}</span>
              <span>{brl2(range.max)}</span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={(e) => simulate(e, 'APENAS')} className="rounded-full border border-brand-500 text-brand-600 hover:bg-brand-50 disabled:opacity-60 font-bold py-3.5 text-[14.5px]">
              {busy && path === 'APENAS' ? 'Calculando…' : 'Simular apenas'}
            </button>
            <button type="button" disabled={busy} onClick={(e) => simulate(e, 'INTERESSE')} className="rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold py-3.5 text-[14.5px]">
              {busy && path === 'INTERESSE' ? 'Calculando…' : 'Simulação com interesse'}
            </button>
          </div>
          <p className="text-[11.5px] text-muted text-center -mt-2">“Simular apenas” não pede seus dados. Com interesse, um consultor te atende.</p>
        </form>
      )}

      {step === 'resultado' && sim && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted">{productName(product)} · simulação por {sim.result.mode === 'PARCELA' ? 'parcela' : 'crédito'}</p>
            <h2 className="text-2xl font-bold">
              {sim.result.mode === 'PARCELA' ? (
                <>
                  Parcela de <span className="text-brand-500">{brl2(sim.result.installmentTarget ?? 0)}</span>
                </>
              ) : (
                <>
                  Crédito de <span className="text-brand-500">{brl0(sim.result.value)}</span>
                </>
              )}
            </h2>
          </div>
          {sim.result.officialRange ? (
            <div className="rounded-xl border border-line divide-y divide-line">
              <div className="px-4 py-3">
                <p className="text-xs text-muted">Cartas de crédito de {productName(product)}</p>
                <p className="font-bold tabular-nums">
                  {brl0(sim.result.officialRange.creditMin)} a {brl0(sim.result.officialRange.creditMax)}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-muted">Parcelas, conforme o plano</p>
                <p className="font-bold tabular-nums">
                  {brl2(sim.result.officialRange.installmentMin)} a {brl2(sim.result.officialRange.installmentMax)}
                </p>
              </div>
              <p className="px-4 py-3 text-[13px] text-ink-2">
                {sim.result.mode === 'PARCELA' ? 'A parcela' : 'O crédito'} que você escolheu está dentro das condições oficiais. O consultor apresenta os planos disponíveis — prazo e parcela exata — para o seu caso.
              </p>
            </div>
          ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {sim.result.options.map((o) => (
              <li key={o.termMonths} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-muted">{o.termMonths} meses</span>
                <span className="text-right">
                  {sim.result.mode === 'PARCELA' ? (
                    <>
                      <span className="block text-xs text-muted">carta de até</span>
                      <b className="tabular-nums">{brl0(o.credit)}</b>
                    </>
                  ) : (
                    <>
                      <b className="tabular-nums">{brl2(o.installment)}</b>
                      <span className="text-xs text-muted">/mês</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          )}
          <p className="text-[11px] leading-snug text-muted">
            {sim.result.options[0]?.basis === 'DIVISAO_SIMPLES' ? 'Base: crédito ÷ prazo, sem taxas. ' : ''}
            {sim.result.disclaimer}
          </p>
          <ChatBox mode="visitor" site={site} product={product.key} pjName={pjName} onInterest={goInterest} />
          <button onClick={goInterest} className="w-full rounded-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3">
            Tenho interesse — falar com a unidade
          </button>
          <button onClick={() => setStep('simular')} className="w-full text-sm text-muted underline">
            Refazer simulação
          </button>
        </div>
      )}

      {step === 'contato' && (
        <form onSubmit={sendInterest} className="space-y-4" noValidate>
          <div>
            <h2 className="text-[19px] font-bold text-brand-500">{heat === 'QUENTE' ? 'Um consultor vai te chamar agora' : 'Deixe seu contato'}</h2>
            <p className="text-sm text-muted mt-1">
              {heat === 'QUENTE' ? `A ${pjName} é avisada na hora para te chamar no WhatsApp.` : `Um consultor da ${pjName} te chama no WhatsApp.`}
            </p>
          </div>
          {sim && (
            <p className="rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-2">
              Sua simulação: <b>{productName(product)}</b> ·{' '}
              {sim.result.mode === 'PARCELA' ? <>parcela de <b>{brl2(sim.result.installmentTarget ?? 0)}</b></> : <>crédito de <b>{brl0(sim.result.value)}</b></>}
            </p>
          )}
          <fieldset>
            <legend className="block text-sm font-semibold mb-1.5">Como prefere ser atendido?</legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1" role="radiogroup">
              {([['MORNO', 'Quero receber contato'], ['QUENTE', 'Quero ser chamado agora']] as [Heat, string][]).map(([h, l]) => (
                <button key={h} type="button" role="radio" aria-checked={heat === h} onClick={() => setHeat(h)} className={`rounded-lg py-2 px-2 text-[13px] font-semibold transition ${heat === h ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-2 hover:bg-white'}`}>
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="nome" className="block text-sm font-semibold mb-1.5">
              Nome
            </label>
            <input id="nome" autoComplete="name" className={field} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="whats" className="block text-sm font-semibold mb-1.5">
              WhatsApp
            </label>
            <input
              id="whats"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 99999-9999 ou +1 305 555 0100"
              className={field}
              value={contact.whatsapp}
              onChange={(e) => setContact({ ...contact, whatsapp: maskPhone(e.target.value) })}
              required
            />
            <p className="mt-1 text-[12px] text-muted">Mora fora do Brasil? Use + e o código do país.</p>
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-semibold mb-1.5">
              E-mail <span className="text-muted font-normal">(opcional)</span>
            </label>
            <input id="email" type="email" autoComplete="email" className={field} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
          </div>
          {heat === 'MORNO' && (
            <div>
              <label htmlFor="horario" className="block text-sm font-semibold mb-1.5">
                Melhor horário <span className="text-muted font-normal">(opcional)</span>
              </label>
              <select id="horario" className={field} value={contact.bestTime} onChange={(e) => setContact({ ...contact, bestTime: e.target.value })}>
                <option value="">Qualquer horário comercial</option>
                <option>Manhã</option>
                <option>Tarde</option>
                <option>Início da noite (até 20h)</option>
              </select>
            </div>
          )}
          {/* honeypot anti-bot: invisível para pessoas */}
          <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={contact.website} onChange={(e) => setContact({ ...contact, website: e.target.value })} />
          <label className="flex gap-2.5 items-start text-[13px] text-ink-2 cursor-pointer">
            <input type="checkbox" className="mt-0.5 size-4 accent-[#131c17]" checked={contact.consent} onChange={(e) => setContact({ ...contact, consent: e.target.checked })} />
            <span>
              {CONSENT_TEXT(pjName)}
              {privacyUrl && (
                <>
                  {' '}
                  <a href={privacyUrl} target="_blank" rel="noreferrer" className="underline">
                    Política de Privacidade
                  </a>
                  .
                </>
              )}
            </span>
          </label>
          {error && (
            <p className="text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy} className="w-full rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold py-3.5">
            {busy ? 'Enviando…' : heat === 'QUENTE' ? 'Quero ser chamado agora' : 'Enviar meu contato'}
          </button>
          <button type="button" onClick={() => setStep('resultado')} className="w-full text-sm text-muted underline">
            Voltar
          </button>
        </form>
      )}

      {step === 'enviado' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center size-10 shrink-0 rounded-full bg-ok-50 text-ok text-lg" aria-hidden>
              ✓
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">{heat === 'QUENTE' ? 'Pronto! A unidade já foi avisada.' : 'Contato recebido!'}</h2>
              <p className="text-xs text-muted">
                Protocolo <b className="text-ink">{protocol}</b> · {heat === 'QUENTE' ? 'um consultor te chama em instantes (horário comercial)' : 'um consultor te chama no WhatsApp'}
              </p>
            </div>
          </div>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackContactClick(site, 'WHATSAPP_CLICK')}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#25D366] hover:brightness-95 text-white font-bold py-3 text-sm"
            >
              Continuar no WhatsApp
            </a>
          )}
          {chatToken ? (
            <>
              <p className="text-[13px] text-ink-2">{whatsappUrl ? 'Ou adiante sua conversa por aqui mesmo' : 'Enquanto isso, adiante sua conversa por aqui'} — o consultor recebe tudo:</p>
              <ChatBox mode="lead" site={site} token={chatToken} pjName={pjName} />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236b6b73' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";
