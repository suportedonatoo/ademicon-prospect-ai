import { avatarTone, cx } from '@/components/ui';

/** Foto do colaborador; sem foto, mostra as iniciais. */
export function Avatar({ name, url, size = 40, className }: { name: string; url: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.38),
  };
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- rota interna autenticada, sem otimização de imagem
    <img src={url} alt={`Foto de ${name}`} style={style} className={cx('rounded-full object-cover shrink-0 bg-slate-100', className)} />
  ) : (
    <span style={style} aria-hidden className={cx('rounded-full shrink-0 inline-flex items-center justify-center font-semibold', avatarTone(name), className)}>
      {initials}
    </span>
  );
}
