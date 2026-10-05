import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCtx } from '@/modules/auth/session';
import { resolveDeepLink } from '@/modules/devices/device.service';
import { Logo } from '@/components/logo';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Abrir no celular', robots: { index: false } };

const MSG = {
  NOT_FOUND: ['Link inválido', 'Este link não existe. Gere um novo no computador.'],
  EXPIRED: ['Link expirado', 'Por segurança, o link vale só alguns minutos. Gere um novo em “Enviar para meu celular”.'],
  FORBIDDEN: ['Acesso não permitido', 'Este link foi gerado para outro usuário ou você não tem mais acesso a este item. Entre com a sua própria conta.'],
} as const;

/** Destino do QR Code / link seguro / push "Enviar para meu celular". */
export default async function DeepLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await getCtx();
  const r = await resolveDeepLink(ctx, code, { userAgent: (await headers()).get('user-agent') });
  if (r.ok) redirect(r.path);
  if (r.reason === 'LOGIN_REQUIRED') redirect(`/login?next=${encodeURIComponent(`/m/${code}`)}`);
  const [title, text] = MSG[r.reason];
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-sm text-center bg-white border border-line rounded-3xl p-7">
        <Logo className="h-4 mx-auto mb-6" />
        <div className="mx-auto size-12 rounded-full bg-warn-50 grid place-items-center text-warn text-xl mb-3" aria-hidden>
          !
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted mt-2">{text}</p>
        <Link href="/" className="inline-block mt-4 text-sm text-brand-600 underline">
          Ir para a plataforma
        </Link>
      </div>
    </main>
  );
}
