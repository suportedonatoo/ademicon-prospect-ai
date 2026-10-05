/* eslint-disable @next/next/no-img-element -- logo oficial pode vir de URL externa configurável */

/**
 * Logo da marca. Com o arquivo OFICIAL configurado (LANDING_LOGO_URL / LANDING_LOGO_URL_WHITE),
 * usa a imagem; sem ele, mostra o nome da marca como marcador provisório.
 */
export function BrandLogo({ name, inverted = false }: { name: string; inverted?: boolean }) {
  const src = inverted ? process.env.LANDING_LOGO_URL_WHITE || process.env.LANDING_LOGO_URL : process.env.LANDING_LOGO_URL;
  if (src) return <img src={src} alt={name} className="h-9 w-auto" />;
  return (
    <span className={`flex items-center gap-3 ${inverted ? 'text-white' : 'text-ink'}`}>
      <span className={`grid place-items-center size-9 rounded-[10px] font-bold text-xs shrink-0 ${inverted ? 'bg-lime text-ink' : 'bg-ink text-lime'}`}>{name.slice(0, 2).toUpperCase()}</span>
      <b className="text-base font-semibold tracking-tight leading-none">{name}</b>
    </span>
  );
}
