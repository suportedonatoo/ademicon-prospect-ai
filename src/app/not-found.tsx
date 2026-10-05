import Link from 'next/link';
import { buttonClass } from '@/components/ui';
import { Logo } from '@/components/logo';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center p-6">
      <div className="text-center">
        <Logo className="h-4 mx-auto mb-8" />
        <div className="text-4xl font-semibold text-faint">404</div>
        <p className="text-sm text-muted mt-2">Página não encontrada.</p>
        <Link href="/" className={buttonClass('secondary') + ' mt-5'}>
          Ir para o dashboard
        </Link>
      </div>
    </div>
  );
}
