import { BrandLogo } from '@/components/brand-logo';

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="flex justify-center mb-7">
          <BrandLogo name="Prospect.AI" />
        </div>
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted">Confira o endereço da unidade.</p>
      </div>
    </main>
  );
}
