import { notFound } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getLanding } from '@/modules/landing-pages/landing.service';
import { db } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { PageHeader } from '@/components/ui';
import { LandingBuilder, type LandingValues } from '../builder';

export const metadata = { title: 'Landing Page' };

export default async function LandingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx('landing.read');
  const { id } = await params;
  const isNew = id === 'novo';
  let initial: LandingValues | null = null;
  let status = 'DRAFT';
  if (!isNew) {
    try {
      const p = await getLanding(ctx, id);
      status = p.status;
      initial = {
        name: p.name,
        slug: p.slug,
        title: p.title,
        subtitle: p.subtitle ?? '',
        product: p.product ?? '',
        regionId: p.regionId ?? '',
        pjId: p.pjId ?? '',
        consultantId: p.consultantId ?? '',
        ctaText: p.ctaText,
        imageUrl: p.imageUrl ?? '',
        benefits: (p.benefits ?? []) as LandingValues['benefits'],
        faq: (p.faq ?? []) as LandingValues['faq'],
        simulatorId: p.simulatorId ?? '',
        whatsappNumber: p.whatsappNumber ?? '',
        tracking: (p.tracking ?? {}) as LandingValues['tracking'],
        seo: (p.seo ?? {}) as LandingValues['seo'],
        form: { fields: p.form?.fields ?? ['name', 'whatsapp', 'email', 'city'], requiredFields: p.form?.requiredFields ?? ['name', 'whatsapp'], consentText: p.form?.consentText ?? '' },
      };
    } catch (e) {
      if (isAppError(e) && e.status === 404) notFound();
      throw e;
    }
  }
  const [regions, pjs, consultants, simulators] = await Promise.all([
    db.region.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true } }),
    db.pJ.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, code: true, city: true }, orderBy: { code: 'asc' } }),
    db.consultant.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.simulator.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader crumb="Landing Pages" title={isNew ? 'Nova landing page' : initial!.name} subtitle="Configure conteúdo, simulador, formulário, tracking e SEO. O preview mostra a versão salva." />
      <LandingBuilder
        id={isNew ? null : id}
        status={status}
        initial={initial}
        canEdit={can(ctx, 'landing.manage')}
        canPublish={can(ctx, 'landing.publish')}
        options={{ regions, pjs: pjs.map((p) => ({ id: p.id, name: `${p.code} · ${p.city}` })), consultants, simulators }}
      />
    </>
  );
}
