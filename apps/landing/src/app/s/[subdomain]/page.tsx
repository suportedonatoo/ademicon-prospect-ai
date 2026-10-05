import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { gestao, GestaoError, type Site } from '@/lib/gestao';
import { isValidSubdomain } from '@/lib/site';
import { MasterPage } from '@/components/master-page';

type Props = { params: Promise<{ subdomain: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(subdomain: string): Promise<Site | null> {
  if (!isValidSubdomain(subdomain)) return null;
  try {
    return await gestao.site(subdomain);
  } catch (e) {
    if (e instanceof GestaoError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await load((await params).subdomain);
  if (!site) return { title: 'Página não encontrada' };
  return { title: `${site.title} · ${site.brand.name}${site.pj ? ` ${site.pj.name}` : ''}`, description: site.subtitle };
}

/** Landing da PJ = layout MESTRE + dados da unidade. */
export default async function SitePage({ params, searchParams }: Props) {
  const [{ subdomain }, sp] = await Promise.all([params, searchParams]);
  const site = await load(subdomain);
  if (!site) notFound();
  return <MasterPage site={site} initialProduct={sp.produto} keepQuery={sp.pj ? `pj=${encodeURIComponent(sp.pj)}&` : ''} />;
}
