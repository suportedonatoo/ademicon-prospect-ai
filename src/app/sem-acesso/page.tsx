import Link from 'next/link';
import { buttonClass } from '@/components/ui';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Sem acesso' };

export default async function NoAccess({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const outro = (await searchParams).motivo === 'perfil'; // tentou abrir o perfil de outro consultor
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="text-center max-w-md rounded-3xl border border-line bg-surface p-10">
        <Logo className="h-4 mx-auto mb-7" />
        <div className="mx-auto grid place-items-center size-14 rounded-2xl bg-brand-50 text-2xl mb-5">🔒</div>
        <h1 className="text-2xl font-bold tracking-tight">{outro ? 'Este perfil pertence a outro consultor' : 'Você não tem acesso a esta área'}</h1>
        <p className="text-sm text-muted mt-2">{outro ? 'Você só pode ver e editar o seu próprio perfil. Se precisar de algo de outro consultor, fale com o gestor.' : 'Seu perfil não possui a permissão necessária. Fale com o administrador da organização.'}</p>
        <Link href="/" className={buttonClass('primary') + ' mt-6'}>
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
