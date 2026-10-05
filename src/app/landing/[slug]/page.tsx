import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicLanding } from '@/modules/landing-pages/landing.service';
import { getOrgSettings } from '@/modules/organizations/settings';
import { getCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { SimulatorWidget } from '@/components/public/simulator-widget';
import { LandingTracker } from '@/components/public/tracker';
import { productLabel } from '@/modules/leads/catalog';
import { Logo } from '@/components/logo';
import { cookies, headers } from 'next/headers';
import { assignVariant } from '@/modules/experiments/experiment.service';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> };

async function load(slug: string, preview: boolean) {
  let allowPreview = false;
  if (preview) {
    const ctx = await getCtx();
    allowPreview = !!ctx && can(ctx, 'landing.read');
  }
  return { data: await getPublicLanding(slug, allowPreview), allowPreview };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const { data } = await load(slug, sp.preview === '1');
  if (!data) return { title: 'Página não encontrada' };
  const seo = (data.page.seo ?? {}) as { title?: string; description?: string; noindex?: boolean };
  return { title: { absolute: seo.title || data.page.title }, description: seo.description || data.page.subtitle || undefined, robots: seo.noindex || data.page.status !== 'PUBLISHED' ? { index: false } : undefined };
}

export default async function PublicLanding({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const { data, allowPreview } = await load(slug, sp.preview === '1');
  if (!data) notFound();
  const { page: basePage } = data;
  // Experimento A/B ativo nesta landing: variante estável por visitante (cookie anônimo pa_vid).
  const vid = (await cookies()).get('pa_vid')?.value ?? (await headers()).get('x-pa-vid');
  const variant = vid && !(allowPreview && sp.preview === '1') ? await assignVariant(basePage.organizationId, { landingPageId: basePage.id }, vid) : null;
  const vc = (variant?.config ?? {}) as { title?: string; subtitle?: string; ctaText?: string };
  const page = { ...basePage, title: vc.title || basePage.title, subtitle: vc.subtitle || basePage.subtitle, ctaText: vc.ctaText || basePage.ctaText };
  const settings = await getOrgSettings(page.organizationId);
  const brand = settings.publicBrand;
  const benefits = (page.benefits ?? []) as { title: string; text: string }[];
  const faq = (page.faq ?? []) as { q: string; a: string }[];
  const sim = page.simulator;
  const whatsapp = page.whatsappNumber?.replace(/\D/g, '');

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <LandingTracker slug={page.slug} disabled={allowPreview && sp.preview === '1'} />
      {page.status !== 'PUBLISHED' && <div className="bg-warn-50 text-warn text-center text-xs py-1.5">Pré-visualização · página não publicada</div>}
      <header className="bg-chrome border-b border-line">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-[68px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo className="h-4 shrink-0" />
            <span className="hidden sm:block border-l border-line pl-3 text-sm text-muted truncate">{brand.name}</span>
          </div>
          <span className="text-sm text-muted text-right">{brand.tagline}</span>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-7 space-y-4">
        <div className="grid lg:grid-cols-[1.42fr_1fr] gap-4 items-start">
          <section className="rounded-3xl bg-ink text-white p-7 sm:p-10">
            {page.product && <span className="block text-xs font-medium uppercase tracking-[0.1em] text-lime mb-4">Consórcio de {productLabel(page.product).toLowerCase()}</span>}
            <h1 className="text-[34px] sm:text-[44px] font-bold tracking-tight leading-[1.08]">{page.title}</h1>
            {page.subtitle && <p className="text-[17px] text-white/75 mt-5 max-w-2xl">{page.subtitle}</p>}
            {benefits.length > 0 && (
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-6 text-[15px] text-white/90">
                {benefits.map((b) => (
                  <li key={b.title} className="flex items-center gap-2.5">
                    <span className="size-1.5 rounded-full bg-lime shrink-0" /> {b.title}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3 mt-7">
              <a href="#simulador" className="rounded-xl bg-lime text-ink font-semibold px-6 h-12 inline-flex items-center">
                {page.ctaText}
              </a>
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/20 text-white font-semibold px-6 h-12 inline-flex items-center">
                  Falar no WhatsApp
                </a>
              )}
            </div>
            {page.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.imageUrl} alt="" className="mt-8 rounded-2xl w-full max-h-72 object-cover" />
            )}
          </section>
          <section id="simulador" className="rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-6">
            <h2 className="text-[17px] font-semibold">Simule agora</h2>
            <p className="text-[13px] text-muted mt-1 mb-4">Leva 1 minuto. Você recebe a simulação no WhatsApp.</p>
            {sim && sim.active ? (
              <SimulatorWidget
                simulatorSlug={sim.slug}
                landingSlug={page.slug}
                products={sim.products as never}
                required={sim.requiredFields}
                consentText={page.form?.consentText ?? 'Autorizo o contato sobre esta simulação, conforme a Política de Privacidade.'}
                ctaText={page.ctaText}
                defaultProduct={page.product}
                experimentVariantId={variant?.variantId ?? null}
              />
            ) : (
              <p className="text-sm text-muted">Simulador indisponível no momento.</p>
            )}
          </section>
        </div>

        {benefits.length > 0 && (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {benefits.map((b) => (
              <li key={b.title} className="rounded-3xl border border-line bg-surface p-6">
                <span className="grid place-items-center size-10 rounded-xl bg-brand-50 text-brand-600 font-bold" aria-hidden>
                  ✓
                </span>
                <b className="block text-[17px] mt-4">{b.title}</b>
                <span className="block text-sm text-muted mt-2">{b.text}</span>
              </li>
            ))}
          </ul>
        )}

        {faq.length > 0 && (
          <section className="rounded-3xl border border-line bg-surface p-6">
            <h2 className="text-[17px] font-semibold mb-2">Perguntas frequentes</h2>
            {faq.map((f) => (
              <details key={f.q} className="border-b border-line last:border-0 py-4">
                <summary className="cursor-pointer font-medium">{f.q}</summary>
                <p className="text-muted mt-2 text-[15px]">{f.a}</p>
              </details>
            ))}
          </section>
        )}
      </main>

      <footer className="text-muted text-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 flex flex-wrap gap-4 justify-between">
          <span>
            © {new Date().getFullYear()} {brand.name}. Simulações ilustrativas; condições oficiais na proposta.
          </span>
          {brand.privacyUrl && (
            <a href={brand.privacyUrl} className="underline">
              Política de Privacidade
            </a>
          )}
        </div>
      </footer>

      {whatsapp && (
        <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="fixed bottom-5 right-5 rounded-full bg-brand-500 text-white px-4 py-3 shadow-lg font-semibold text-sm">
          WhatsApp
        </a>
      )}
    </div>
  );
}
