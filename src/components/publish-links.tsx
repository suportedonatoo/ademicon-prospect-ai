import Link from 'next/link';
import { Card } from '@/components/ui';
import { CopyBioLink } from '@/app/(app)/admin/equipe/link-cell';
import { landingUrlFor, masterLandingUrl } from '@/modules/consultants/landing-link';

/**
 * Os 2 links que cada consultor publica: o site mestre (divisão igual entre todos) e o link próprio
 * (subdomínio pelo nome; página idêntica, sem o nome dele — o lead é dele).
 */
export function PublishLinks({ slug, own, className }: { slug: string | null; own: boolean; className?: string }) {
  return (
    <Card
      title={own ? 'Meus links para publicar' : 'Links para publicar'}
      subtitle="As duas páginas são iguais e não mostram o nome de ninguém. Muda só para onde vai o lead."
      className={className}
      actions={
        own && (
          <Link href="/divulgacao" className="text-sm text-brand-600 hover:underline">
            Kit de divulgação de hoje →
          </Link>
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Site mestre da Ademicon</p>
          <CopyBioLink url={masterLandingUrl()} />
          <p className="text-xs text-muted">Quem deixa contato por aqui entra na divisão igual entre todos os consultores.</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{own ? 'Meu link próprio' : 'Link próprio'}</p>
          {slug ? <CopyBioLink url={landingUrlFor(slug)} /> : <p className="text-sm text-muted">Link ainda não gerado. A equipe da plataforma gera em Colaboradores.</p>}
          <p className="text-xs text-muted">Quem deixa contato por aqui vira lead {own ? 'seu' : 'deste consultor'} — não entra na divisão.</p>
        </div>
      </div>
    </Card>
  );
}
