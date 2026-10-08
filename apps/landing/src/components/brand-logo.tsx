/* eslint-disable @next/next/no-img-element -- logo oficial pode vir de URL externa configurável */
import { brandMode } from '@/lib/brand-mode';

/**
 * Logo da marca. Com o arquivo OFICIAL configurado (LANDING_LOGO_URL / LANDING_LOGO_URL_WHITE),
 * usa a imagem; sem ele, mostra a logo PROSPECT.AI (public/logo.png).
 */
export function BrandLogo({ name, inverted = false }: { name: string; inverted?: boolean }) {
  // Prévia: sem logo nenhum — só o nome neutro em texto.
  if (brandMode() === 'previa') return <b className={`text-xl font-extrabold tracking-tight leading-none ${inverted ? 'text-white' : 'text-brand-500'}`}>{name}</b>;
  const src = inverted ? process.env.LANDING_LOGO_URL_WHITE || process.env.LANDING_LOGO_URL : process.env.LANDING_LOGO_URL;
  if (src) return <img src={src} alt={name} className="h-9 w-auto" />;
  return <img src={inverted ? '/logo-light.png' : '/logo.png'} alt={name} className="h-4 sm:h-[18px] w-auto" />;
}
