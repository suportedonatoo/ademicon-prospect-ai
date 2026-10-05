import type { Site } from '@/lib/gestao';
import { partnerLoginUrl } from '@/lib/links';
import { ADVANTAGES, CENTRAL_ADVANTAGE, FAQ, PRODUCT_COPY, RATE_VS_INTEREST, STEPS, WHAT_IS, sortProducts } from '@/content/master';
import { Icon } from './icon';
import { BrandLogo } from './brand-logo';
import { ContactButtons, WhatsAppFloat } from './contact-buttons';
import { SimulatorFlow } from './simulator-flow';
import { Tracker } from './tracker';

/**
 * LAYOUT MESTRE — o mesmo para todas as PJs e para a landing central (modelo da home institucional da marca).
 * Só mudam: a unidade (nome, cidade, cidades atendidas), os contatos (WhatsApp/telefone/endereço)
 * e os textos de chamada configurados por PJ. A simulação roda no motor central (sistema de gestão).
 */
export function MasterPage({ site, initialProduct, keepQuery = '' }: { site: Site; initialProduct?: string; keepQuery?: string }) {
  // keepQuery preserva ?pj=... no modo de desenvolvimento sem subdomínio
  const productHref = (key: string) => `?${keepQuery}produto=${key}#simular`;
  const { pj, brand, contact } = site;
  // Landing central não tem unidade: o nome exibido é a marca e o lead é dividido entre as unidades.
  const unitName = pj?.name ?? brand.name;
  const advantages = pj ? ADVANTAGES : ADVANTAGES.map((a) => (a.title === 'Consultor da sua região' ? CENTRAL_ADVANTAGE : a));
  const products = sortProducts(site.simulator.products);
  const nav = [
    ['#topo', 'Início'],
    ['#produtos', 'Produtos'],
    ['#como-funciona', 'Como funciona'],
    ['#duvidas', 'Dúvidas'],
    ['#unidade', pj ? 'Sua unidade' : 'Atendimento'],
  ];

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <Tracker site={site.subdomain} />

      {/* Cabeçalho */}
      <header className="sticky top-0 z-30 bg-[#f6f8f3] border-b border-line">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="#topo" className="flex items-center gap-3 min-w-0" aria-label={pj ? `${brand.name} · ${pj.name}` : brand.name}>
            <BrandLogo name={brand.name} />
            {pj && <span className="hidden xl:block border-l border-line pl-3 text-xs leading-tight text-muted max-w-40 truncate">{pj.name}</span>}
          </a>
          <nav className="hidden lg:flex items-center gap-6 text-[15px] font-medium text-ink-2 whitespace-nowrap" aria-label="Seções">
            {nav.map(([href, label]) => (
              <a key={href} href={href} className="hover:text-brand-500">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <a href={partnerLoginUrl()} className="hidden sm:inline-flex rounded-xl border border-line bg-white hover:bg-brand-50 text-ink text-sm font-semibold px-4 py-2.5">
              Área do parceiro
            </a>
            <a href="#simular" className="inline-flex rounded-xl bg-ink hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2.5">
              Simular agora
            </a>
          </div>
        </div>
      </header>

      {/* Hero (cartão escuro) + simulador ao lado */}
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 pt-5 grid gap-4 lg:grid-cols-[1.42fr_1fr] items-start">
        <section id="topo" className="rounded-3xl bg-night text-white p-7 sm:p-10 lg:min-h-full">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-lime">{pj ? `${pj.name} · ${pj.city}/${pj.uf}` : 'Atendimento online · no Brasil e no exterior'}</p>
          <h1 className="mt-5 text-[34px] sm:text-[46px] font-bold tracking-tight leading-[1.08]">{site.title}</h1>
          <p className="mt-5 text-white/75 text-[17px] max-w-xl">{site.subtitle}</p>
          {pj && pj.citiesServed.length > 1 && <p className="mt-2 text-sm text-white/55">Atendemos {pj.citiesServed.join(', ')}.</p>}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#simular" className="inline-flex items-center rounded-xl bg-lime text-ink font-semibold px-6 h-12">
              Simular um consórcio
            </a>
            <ContactButtons site={site.subdomain} pjName={unitName} contact={contact} variant="dark" size="lg" />
          </div>
        </section>
        <div id="simular" className="scroll-mt-24">
          <SimulatorFlow site={site.subdomain} products={products} pjName={unitName} privacyUrl={brand.privacyUrl} initialProduct={initialProduct} />
        </div>
      </div>

      {/* Atalhos: o que o cliente pode fazer por aqui */}
      <ul className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['#simular', 'coins', 'Simular parcelas', 'Imóvel, veículo, moto, serviços e bens móveis.', 'Começar'],
            ['#unidade', 'whatsapp', 'Falar com consultor', 'Um consultor te atende pelo WhatsApp, sem compromisso.', 'Ver contatos'],
            ['#como-funciona', 'calendar', 'Como funciona', 'Grupo, assembleia, sorteio e lance — em três passos.', 'Entender'],
            ['#duvidas', 'shield', 'Dúvidas frequentes', 'Taxa de administração, contemplação e segurança.', 'Ver respostas'],
          ] as const
        ).map(([href, icon, title, text, cta]) => (
          <li key={href}>
            <a href={href} className="flex h-full flex-col rounded-3xl border border-line bg-white p-6 hover:border-brand-200">
              <span className="grid place-items-center size-10 rounded-xl bg-brand-50 text-brand-700">
                <Icon name={icon} className="size-5" />
              </span>
              <b className="mt-4 text-[17px]">{title}</b>
              <span className="mt-2 flex-1 text-sm text-muted">{text}</span>
              <span className="mt-4 text-sm font-medium text-brand-700">{cta} →</span>
            </a>
          </li>
        ))}
      </ul>

      {/* O que é possível conquistar */}
      <section id="produtos" className="bg-canvas scroll-mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <SectionTitle center title="O que é possível conquistar com o consórcio" text="Com a carta de crédito, você escolhe o bem ou serviço que faz mais sentido para o seu momento." />
          <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {products.map((p) => {
              const copy = PRODUCT_COPY[p.key];
              return (
                <li key={p.key} className="rounded-2xl bg-white p-6 flex flex-col shadow-sm hover:shadow-md transition">
                  <span className="grid place-items-center size-12 rounded-xl bg-brand-50 text-brand-500">
                    <Icon name={copy?.icon ?? 'sparkle'} />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{copy?.title ?? p.label}</h3>
                  <p className="mt-1 text-sm text-muted flex-1">{copy?.text ?? 'Planeje a sua conquista com consórcio.'}</p>
                  <a href={productHref(p.key)} className="mt-5 inline-flex justify-center rounded-full bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm px-4 py-2.5">
                    Simular consórcio
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* O que é consórcio */}
      <section className="mx-auto max-w-7xl w-full px-4 sm:px-6 py-16">
        <SectionTitle center title="O que é consórcio?" text="Uma forma planejada de comprar, sem juros." />
        <ol className="mt-10 grid md:grid-cols-3 gap-4">
          {WHAT_IS.map((w, i) => (
            <li key={w.title} className="rounded-2xl border border-line p-6">
              <span className="text-4xl font-bold text-brand-500">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-bold">{w.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{w.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Vantagens */}
      <section className="bg-brand-500 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <SectionTitle dark center title="Por que fazer consórcio?" />
          <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {advantages.map((a) => (
              <li key={a.title} className="rounded-2xl bg-white/10 p-6">
                <Icon name={a.icon} className="size-8" />
                <h3 className="mt-4 text-lg font-bold">{a.title}</h3>
                <p className="mt-1 text-sm text-white/85">{a.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="mx-auto max-w-7xl w-full px-4 sm:px-6 py-16 scroll-mt-16">
        <SectionTitle center title="Como funciona" />
        <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl bg-canvas p-6">
              <span className="absolute top-5 right-5 text-sm font-bold text-brand-500">{i + 1}</span>
              <span className="grid place-items-center size-12 rounded-xl bg-brand-500 text-white">
                <Icon name={s.icon} />
              </span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Consórcio x financiamento */}
      <section className="bg-canvas">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <SectionTitle center title="Consórcio x financiamento" />
          <div className="mt-10 grid md:grid-cols-2 gap-4">
            <Compare title="Consórcio" items={RATE_VS_INTEREST.consorcio} good />
            <Compare title="Financiamento" items={RATE_VS_INTEREST.financiamento} />
          </div>
          <p className="mt-4 text-xs text-muted text-center">{RATE_VS_INTEREST.note}</p>
          <div className="mt-6 text-center">
            <a href="#simular" className="inline-flex rounded-full bg-brand-500 hover:bg-brand-600 text-white font-bold px-6 py-3">
              Simule agora
            </a>
          </div>
        </div>
      </section>

      {/* Dúvidas */}
      <section id="duvidas" className="mx-auto max-w-3xl w-full px-4 sm:px-6 py-16 scroll-mt-16">
        <SectionTitle center title="Perguntas frequentes" />
        <div className="mt-8 divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                {f.q}
                <span className="text-brand-500 transition group-open:rotate-45 text-2xl leading-none" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Sua unidade */}
      <section id="unidade" className="bg-canvas scroll-mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 grid gap-8 lg:grid-cols-2 items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-brand-500">{pj ? 'Sua unidade' : 'Atendimento'}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">{pj ? pj.name : 'Um consultor fala com você'}</h2>
            <p className="mt-2 text-muted">
              {pj ? `Atendimento em ${pj.citiesServed.join(', ') || pj.city}.` : 'Depois da simulação com interesse, um consultor de uma das nossas unidades chama você no WhatsApp — esteja no Brasil ou no exterior.'}
            </p>
            {!pj && (
              <a href="/unidades" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
                Prefere escolher a unidade? Ver unidades →
              </a>
            )}
            {contact.address && (
              <p className="mt-4 flex items-start gap-2 text-sm text-ink-2">
                <Icon name="pin" className="size-5 text-brand-500 shrink-0" /> {contact.address}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold">{pj ? 'Fale com um consultor da unidade' : 'Fale com um consultor'}</h3>
            <p className="mt-1 text-sm text-muted">Tire dúvidas e receba as condições reais para o seu objetivo.</p>
            <div className="mt-5">
              {contact.whatsapp || contact.phone ? (
                <ContactButtons site={site.subdomain} pjName={unitName} contact={contact} size="lg" />
              ) : (
                <a href="#simular" className="inline-flex rounded-full bg-brand-500 hover:bg-brand-600 text-white font-bold px-6 py-3">
                  Simular e pedir contato
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-night text-white/75">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 grid gap-6 md:grid-cols-[1fr_auto] text-sm">
          <div className="space-y-3">
            <BrandLogo name={brand.name} inverted />
            <p>{pj ? `${pj.name} · ${pj.city}/${pj.uf}` : brand.tagline}</p>
            <p className="text-xs text-white/55 max-w-2xl">{site.simulator.disclaimer}</p>
            <p className="text-xs text-white/55 max-w-2xl">
              Seus dados são usados apenas para o atendimento que você pedir (LGPD). O atendimento inicial pode ser feito por um assistente virtual, identificado como tal; um consultor
              humano assume quando você quiser.
              {brand.privacyUrl && (
                <>
                  {' '}
                  <a className="underline" href={brand.privacyUrl} target="_blank" rel="noreferrer">
                    Política de Privacidade
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="flex md:flex-col gap-3 md:items-end">
            <a href={partnerLoginUrl()} className="hover:text-white underline-offset-4 hover:underline">
              Área do parceiro
            </a>
            <a href="#topo" className="hover:text-white underline-offset-4 hover:underline">
              Voltar ao topo
            </a>
          </div>
        </div>
      </footer>

      <WhatsAppFloat site={site.subdomain} pjName={unitName} whatsapp={contact.whatsapp} />
    </div>
  );
}

function SectionTitle({ title, text, dark, center }: { title: string; text?: string; dark?: boolean; center?: boolean }) {
  return (
    <div className={center ? 'text-center' : undefined}>
      <h2 className={`text-3xl sm:text-4xl font-bold tracking-tight ${dark ? '' : 'text-ink-2'}`}>{title}</h2>
      {text && <p className={`mt-3 max-w-2xl text-lg ${center ? 'mx-auto' : ''} ${dark ? 'text-white/85' : 'text-muted'}`}>{text}</p>}
    </div>
  );
}

function Compare({ title, items, good }: { title: string; items: string[]; good?: boolean }) {
  return (
    <div className={`rounded-2xl p-6 ${good ? 'bg-white ring-2 ring-brand-500' : 'bg-white/60 border border-line'}`}>
      <h3 className="font-bold text-xl">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-0.5 grid place-items-center size-5 rounded-full text-xs shrink-0 ${good ? 'bg-brand-500 text-white' : 'bg-slate-200 text-muted'}`}>{good ? '✓' : '•'}</span>
            <span className={good ? 'text-ink' : 'text-muted'}>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
