import { instagramConnectConfigured } from '@/modules/instagram/instagram.service';
import { Badge, Notice } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { InstagramTokenForm } from '@/app/(app)/perfil/instagram-token-form';

/**
 * "Entrar com o Instagram" — o consultor conecta a conta profissional dele (login oficial do Instagram)
 * na própria tela em que está (Vídeos do Instagram, Configurar IA ou Meu perfil) e volta para ela.
 * Com a conta conectada, a IA responde o Direct e os comentários dessa conta.
 */
export function InstagramLogin({
  consultantId,
  connected,
  username,
  canManage,
  own,
  next,
  status,
}: {
  consultantId: string;
  connected: boolean;
  username: string | null;
  canManage: boolean;
  own: boolean;
  next: '/perfil' | '/instagram-videos' | '/configurar-ia';
  status?: { instagram?: string; conta?: string; motivo?: string };
}) {
  return (
    <div>
      {status?.instagram === 'ok' && (
        <div className="mb-3">
          <Notice tone="green" title="Instagram conectado.">
            {status.conta ? `Conta @${status.conta}. ` : ''}A IA já cuida do Direct e dos comentários desta conta.
          </Notice>
        </div>
      )}
      {status?.instagram === 'erro' && (
        <div className="mb-3">
          <Notice tone="red" title="Não foi possível conectar.">
            {status.motivo}
          </Notice>
        </div>
      )}
      {connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="green" dot>
            Conectado{username ? ` · @${username}` : ''}
          </Badge>
          {canManage && (
            <>
              {own && instagramConnectConfigured() && (
                <a href={`/api/v1/instagram/connect?next=${next}`} className="text-sm text-brand-600 underline">
                  trocar de conta
                </a>
              )}
              <ActionButton size="sm" variant="danger" path="/instagram/disconnect" body={{ consultantId }} confirm="Desconectar o Instagram? A IA deixa de responder o Direct e os comentários desta conta." success="Instagram desconectado.">
                Desconectar
              </ActionButton>
            </>
          )}
        </div>
      ) : !instagramConnectConfigured() ? (
        <p className="text-sm text-muted">Ainda não disponível: a equipe da plataforma precisa preencher o ID e o segredo do app do Instagram em Configurar APIs.</p>
      ) : own ? (
        <div className="flex flex-wrap items-center gap-4">
          <a
            href={`/api/v1/instagram/connect?next=${next}`}
            className="inline-flex items-center gap-2.5 rounded-xl px-5 h-12 font-semibold text-white shadow-sm hover:opacity-95"
            style={{ background: 'linear-gradient(45deg, #f58529, #dd2a7b 45%, #8134af 75%, #515bd4)' }}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
            </svg>
            Entrar com o Instagram
          </a>
          <span className="text-sm text-muted max-w-md">Você entra com a sua conta profissional (Comercial ou Criador de conteúdo) e autoriza. A senha fica só no Instagram.</span>
        </div>
      ) : (
        <p className="text-sm text-muted">Não conectado. O consultor entra com o Instagram pelo login dele.</p>
      )}
      {!connected && canManage && <InstagramTokenForm consultantId={consultantId} />}
    </div>
  );
}
