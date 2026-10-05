import { requireCtx } from '@/modules/auth/session';
import { Card, LinkButton, Notice, PageHeader } from '@/components/ui';

export const metadata = { title: 'Extensão Sales Assistant' };

export default async function ExtensionPage() {
  await requireCtx();
  return (
    <>
      <PageHeader crumb="Minha conta" title="Extensão “Ademicon Sales Assistant”" subtitle="Acesso rápido a notificações, leads quentes, conversas aguardando e resumo de oportunidades — sem duplicar o CRM." actions={<LinkButton href="/configuracoes/notificacoes" variant="primary">Gerar token de conexão</LinkButton>} />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Instalar no Chrome ou Edge (modo desenvolvedor)">
          <ol className="list-decimal pl-5 space-y-2 text-sm text-ink-2">
            <li>
              No computador, gere a pasta da extensão: <code className="bg-slate-100 rounded px-1">npm run extension:build</code> (cria <code className="bg-slate-100 rounded px-1">apps/extension/dist</code>).
            </li>
            <li>
              Abra <code className="bg-slate-100 rounded px-1">chrome://extensions</code> (ou <code className="bg-slate-100 rounded px-1">edge://extensions</code>) e ative o <b>Modo do desenvolvedor</b>.
            </li>
            <li>
              Clique em <b>Carregar sem compactação</b> e selecione a pasta <code className="bg-slate-100 rounded px-1">apps/extension/dist</code>.
            </li>
            <li>
              Aqui na plataforma, vá em <b>Notificações e dispositivos → Conectar extensão</b> e copie o token.
            </li>
            <li>Na extensão, cole o endereço da plataforma e o token e clique em Conectar.</li>
          </ol>
          <p className="text-xs text-muted mt-3">Para distribuição à equipe, publique a mesma pasta na Chrome Web Store / Microsoft Edge Add-ons (conta de desenvolvedor da empresa).</p>
        </Card>
        <Card title="Segurança">
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-2">
            <li>O token é exclusivo do seu usuário e deste navegador; só o hash fica no servidor.</li>
            <li>Acesso somente leitura e restrito ao seu escopo (as mesmas permissões da plataforma).</li>
            <li>Revogue a qualquer momento em Dispositivos — a extensão para de funcionar na hora.</li>
            <li>Ao clicar em um item, a plataforma abre no navegador e exige o seu login normal.</li>
          </ul>
          <div className="mt-4">
            <Notice tone="blue">A extensão consulta a plataforma a cada minuto (alarme do navegador) e mostra notificações nativas quando chega algo novo.</Notice>
          </div>
        </Card>
      </div>
    </>
  );
}
