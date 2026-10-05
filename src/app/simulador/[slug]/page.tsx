import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getOrgSettings } from '@/modules/organizations/settings';
import { SimulatorWidget } from '@/components/public/simulator-widget';
import { Logo } from '@/components/logo';

export const dynamic = 'force-dynamic';

/** Simulador avulso (pode ser incorporado em qualquer página via iframe). */
export default async function PublicSimulator({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sim = await db.simulator.findUnique({ where: { slug } });
  if (!sim || !sim.active) notFound();
  const brand = (await getOrgSettings(sim.organizationId)).publicBrand;
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="bg-chrome border-b border-line">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-[68px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo className="h-4 shrink-0" />
            <span className="hidden sm:block border-l border-line pl-3 text-sm text-muted truncate">{brand.name}</span>
          </div>
          <span className="text-sm text-muted text-right">{brand.tagline}</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-7">
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
          <h1 className="text-[20px] font-semibold tracking-tight">{sim.name}</h1>
          <p className="text-[13px] text-muted mt-1 mb-5">Escolha o produto e veja as parcelas na hora.</p>
          <SimulatorWidget simulatorSlug={sim.slug} products={sim.products as never} required={sim.requiredFields} consentText="Autorizo o contato sobre esta simulação pelos canais selecionados, conforme a Política de Privacidade." />
        </section>
      </main>
    </div>
  );
}
