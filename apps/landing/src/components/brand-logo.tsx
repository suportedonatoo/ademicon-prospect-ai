/* eslint-disable @next/next/no-img-element -- logo oficial pode vir de URL externa configurável */
import { brandMode } from '@/lib/brand-mode';

/**
 * Logo da marca. Com o arquivo OFICIAL configurado (LANDING_LOGO_URL / LANDING_LOGO_URL_WHITE),
 * usa a imagem; sem ele, mostra o nome da marca em texto.
 */
export function BrandLogo({ name, inverted = false, previa = brandMode() === 'previa' }: { name: string; inverted?: boolean; previa?: boolean }) {
  // Prévia (ou consultor sem autorização da marca): sem logo nenhum — só o nome neutro em texto.
  if (previa) return <b className={`text-xl font-extrabold tracking-tight leading-none ${inverted ? 'text-white' : 'text-brand-500'}`}>{name}</b>;
  const src = inverted ? process.env.LANDING_LOGO_URL_WHITE || process.env.LANDING_LOGO_URL : process.env.LANDING_LOGO_URL;
  if (src) return <img src={src} alt={name} className="h-9 w-auto" />;
  // Sem arquivo oficial: o nome da marca em texto, na cor da marca (como nas telas aprovadas).
  return <b className={`text-xl font-bold tracking-tight leading-none ${inverted ? 'text-white' : 'text-brand-500'}`}>{name}</b>;
}
