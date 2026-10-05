import { gestao, type Unit } from '@/lib/gestao';
import { partnerLoginUrl, unitUrl } from '@/lib/links';
import { Icon } from '@/components/icon';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Encontre sua unidade' };

/** "Encontre sua unidade": lista as landings das PJs (o endereço principal é a landing central). */
export default async function Units() {
  let units: Unit[] = [];
  let brandName = 'Consórcio';
  let unavailable = false;
  try {
    const data = await gestao.units();
    units = data.units;
    brandName = data.brand.name;
  } catch {
    unavailable = true;
  }
  const byUf = units.reduce<Record<string, Unit[]>>((acc, u) => ((acc[u.uf] ??= []).push(u), acc), {});

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-night text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <b className="text-lg">{brandName}</b>
          <a href={partnerLoginUrl()} className="text-sm text-white/80 hover:text-white">
            Área do parceiro
          </a>
        </div>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 pb-14">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Encontre sua unidade</h1>
          <p className="mt-2 text-white/75 max-w-xl">Escolha a unidade mais perto de você para simular e falar com um consultor da sua região.</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-10 flex-1">
        {unavailable && <p className="text-sm text-bad">Não foi possível carregar as unidades agora. Tente novamente em instantes.</p>}
        {!unavailable && units.length === 0 && <p className="text-sm text-muted">Nenhuma unidade com página no ar.</p>}
        {Object.entries(byUf).map(([uf, list]) => (
          <section key={uf} className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-600">{uf}</h2>
            <ul className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((u) => (
                <li key={u.subdomain}>
                  <a href={unitUrl(u.subdomain)} className="block h-full rounded-2xl border border-line bg-white p-5 hover:border-brand-500 hover:shadow-md transition">
                    <span className="flex items-center gap-2 text-sm text-muted">
                      <Icon name="pin" className="size-4 text-brand-600" /> {u.city}
                    </span>
                    <b className="block mt-1">{u.name}</b>
                    {u.citiesServed.length > 0 && <span className="block mt-1 text-xs text-muted">Atende: {u.citiesServed.join(', ')}</span>}
                    <span className="mt-3 inline-block text-sm font-semibold text-brand-600">Simular nesta unidade →</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
