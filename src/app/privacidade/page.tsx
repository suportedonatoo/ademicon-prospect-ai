import { db } from '@/lib/db';
import { getOrgSettings } from '@/modules/organizations/settings';
import { Logo } from '@/components/logo';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Política de Privacidade' };

// Contato para pedidos sobre dados pessoais. Troque por PRIVACY_CONTACT_EMAIL no servidor.
const CONTACT = process.env.PRIVACY_CONTACT_EMAIL || 'stacksolutionscorp@gmail.com';

/** Política de Privacidade pública (LGPD). É o endereço pedido pela Meta ao publicar o app de WhatsApp/Instagram. */
export default async function PrivacyPage() {
  const org = await db.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  const s = org ? await getOrgSettings(org.id) : null;
  const brand = s?.publicBrand.name ?? 'Prospect.AI';
  const sla = s?.privacy.dataRequestSlaDays ?? 15;
  const H = ({ id, children }: { id?: string; children: React.ReactNode }) => (
    <h2 id={id} className="text-[17px] font-semibold mt-8 mb-2 scroll-mt-6">
      {children}
    </h2>
  );
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="bg-chrome border-b border-line">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Logo className="h-4" />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <article className="rounded-3xl border border-line bg-surface p-6 sm:p-9 text-[15px] leading-relaxed text-ink-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:mt-2">
          <h1 className="text-[30px] leading-[1.15] font-bold text-ink">Política de Privacidade</h1>
          <p className="text-sm text-muted">Versão {s?.privacy.policyVersion ?? '2026-09'} · {brand}</p>

          <p>
            Esta política explica como tratamos os dados pessoais de quem simula um consórcio, deixa um contato ou conversa conosco pelo site, pelo WhatsApp ou pelo Instagram, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
          </p>

          <H>Quais dados tratamos</H>
          <ul>
            <li>Identificação e contato: nome, telefone/WhatsApp, e-mail, cidade e estado, e o perfil do Instagram quando você nos escreve por lá.</li>
            <li>Interesse: produto, valor e prazo desejados, objetivo e as simulações feitas.</li>
            <li>Conversas: as mensagens trocadas com o assistente virtual e com os consultores.</li>
            <li>Navegação: páginas visitadas, origem do acesso (anúncio, link ou campanha) e identificadores técnicos da sessão.</li>
            <li>Registro dos consentimentos dados e dos pedidos de exclusão ou de parar de receber mensagens.</li>
          </ul>

          <H>Para que usamos</H>
          <ul>
            <li>Enviar a simulação pedida e responder às suas dúvidas.</li>
            <li>Encaminhar o seu contato a um consultor da sua região.</li>
            <li>Acompanhar o atendimento e melhorar o serviço.</li>
            <li>Cumprir obrigações legais e registrar consentimentos.</li>
          </ul>
          <p>As bases legais são o seu consentimento, os procedimentos preliminares a um contrato pedidos por você e o legítimo interesse no atendimento comercial.</p>

          <H>Assistente virtual</H>
          <p>O primeiro atendimento pode ser feito por um assistente automatizado, que se identifica como tal. Você pode pedir um consultor humano a qualquer momento.</p>

          <H>Com quem compartilhamos</H>
          <ul>
            <li>Consultores e a unidade responsável pelo seu atendimento.</li>
            <li>Meta Platforms (WhatsApp e Instagram), quando a conversa acontece por esses canais.</li>
            <li>Fornecedores de tecnologia que operam o serviço por nossa conta: hospedagem, banco de dados e, quando ativado, o provedor de inteligência artificial que gera as respostas do assistente.</li>
          </ul>
          <p>Não vendemos dados pessoais.</p>

          <H>Por quanto tempo guardamos</H>
          <p>Enquanto durar o atendimento e pelo prazo necessário para cumprir obrigações legais. Depois disso, os dados são excluídos ou anonimizados.</p>

          <H>Seus direitos</H>
          <p>Você pode pedir confirmação do tratamento, acesso, correção, portabilidade, anonimização, exclusão dos dados e a revogação do consentimento. Respondemos em até {sla} dias.</p>

          <H id="exclusao">Como parar de receber mensagens ou excluir seus dados</H>
          <ul>
            <li>
              Para parar de receber mensagens: responda <b>PARAR</b> na própria conversa do WhatsApp ou do Instagram.
            </li>
            <li>
              Para excluir seus dados: envie um e-mail para{' '}
              <a className="text-brand-600 underline" href={`mailto:${CONTACT}?subject=Exclus%C3%A3o%20de%20dados`}>
                {CONTACT}
              </a>{' '}
              informando o telefone ou o perfil usado no contato. Confirmamos a exclusão em até {sla} dias.
            </li>
          </ul>

          <H>Contato</H>
          <p>
            Dúvidas sobre esta política ou sobre os seus dados:{' '}
            <a className="text-brand-600 underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            .
          </p>
        </article>
      </main>
    </div>
  );
}
