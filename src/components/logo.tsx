import Image from 'next/image';

/** Logo PROSPECT.AI. `light` = versão branca, para fundo escuro. A altura vem de `className` (ex.: "h-4"). */
export function Logo({ light = false, className = 'h-4' }: { light?: boolean; className?: string }) {
  return <Image src={light ? '/logo-light.png' : '/logo.png'} alt="Prospect.AI" width={1080} height={96} unoptimized priority className={`${className} w-auto`} />;
}
