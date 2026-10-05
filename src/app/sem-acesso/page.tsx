import Link from 'next/link';
import { buttonClass } from '@/components/ui';

export const metadata = { title: 'Sem acesso' };

export default function NoAccess() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="text-center max-w-md rounded-3xl border border-line bg-surface p-10">
        <div className="mx-auto grid place-items-center size-14 rounded-2xl bg-brand-50 text-2xl mb-5">🔒</div>
        <h1 className="text-2xl font-bold tracking-tight">Você não tem acesso a esta área</h1>
        <p className="text-sm text-muted mt-2">Seu perfil não possui a permissão necessária. Fale com o administrador da organização.</p>
        <Link href="/" className={buttonClass('primary') + ' mt-6'}>
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
