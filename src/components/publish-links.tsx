import Link from 'next/link';
import { Card } from '@/components/ui';
import { CopyBioLink } from '@/app/(app)/admin/equipe/link-cell';
import { landingUrlFor, masterLandingUrl } from '@/modules/consultants/landing-link';

/**
 * Links para publicar: o link próprio (página idêntica, sem o nome dele — o lead é dele) e, só para
 * gestores (`showMaster`), o site mestre (divisão igual entre todos).
 */
export function PublishLinks({ slug, own, showMaster, className }: { slug: string | null; own: boolean; showMaster: boolean; className?: string }) {
  return (
    <Card
      title={showMaster ? (own ? 'Meus links para publicar' : 'Links para publicar') : 'Meu link para publicar'}
      subtitle={showMaster ? 'As duas páginas são iguais e não mostram o nome de ninguém. Muda só para onde vai o lead.' : 'A página não mostra o nome de ninguém.'}
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
        {showMaster && <div className="space-y-1.5">
          <p className="text-sm font-semibold">Site mestre da Ademicon</p>
          <CopyBioLink url={masterLandingUrl()} />
          <p className="text-xs text-muted">Quem deixa contato por aqui entra na divisão igual entre todos os consultores.</p>
        </div>}
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{own ? 'Meu link próprio' : 'Link próprio'}</p>
          {slug ? <CopyBioLink url={landingUrlFor(slug)} /> : <p className="text-sm text-muted">Link ainda não gerado. A equipe da plataforma gera em Colaboradores.</p>}
          <p className="text-xs text-muted">Quem deixa contato por aqui vira lead {own ? 'seu' : 'deste consultor'} — não entra na divisão.</p>
        </div>
      </div>
    </Card>
  );
}
