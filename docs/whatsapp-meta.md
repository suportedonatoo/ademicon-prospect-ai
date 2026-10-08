# WhatsApp oficial (Meta Cloud API) + bot no piloto

## Como funciona no piloto
- **Um número dedicado ao bot** (um chip novo, só para isso) fica ligado à API oficial da Meta.
- O cliente deixa o contato na landing e aparece o botão **"Continuar no WhatsApp"**. Ao clicar, ele **manda a primeira mensagem** para o número do bot.
  - Como foi o cliente que escreveu, abre-se a janela de 24 h da Meta. O bot responde na hora, com a IA, sem custo de template.
  - Tudo aparece no **Inbox** do sistema, junto com o consultor que recebeu o lead.
- **Opcional — o bot inicia sozinho:** se vocês aprovarem um *template de abertura* na Meta, o bot manda a primeira mensagem para quem deixou contato na landing, mesmo sem o clique. Isso tem custo por mensagem (veja abaixo).
- O consultor acompanha a conversa e pode assumir a qualquer momento: responder pelo Inbox pausa a IA naquela conversa.
- **Os números pessoais dos consultores ficam para a fase 2.** Para usar o mesmo número no app do celular e na API ao mesmo tempo ("coexistence"), a Meta exige o cadastro pelo *Embedded Signup*, normalmente feito por um parceiro oficial (BSP). No piloto, os números deles continuam cadastrados no sistema, mas as conversas do bot saem pelo número do bot.

> **Por que um chip novo?** Ligado direto à API (sem parceiro), o número **deixa de funcionar no app do WhatsApp** do celular. Não use o número pessoal de ninguém.

## Passo a passo na Meta (uma vez)
1. **Portfólio empresarial** em business.facebook.com. Crie, ou use o da unidade.
   - A **verificação da empresa** é necessária para tirar os limites iniciais de envio. Pode ser feita durante o piloto.
2. **App:** em developers.facebook.com, vá em *Criar app → tipo Empresa* e adicione o produto **WhatsApp**.
3. **Número do bot:** em *WhatsApp → Configuração da API → Adicionar número*.
   - Informe o chip novo, confirme por SMS ou ligação e defina o nome de exibição; a Meta aprova o nome.
   - Anote o **ID do número de telefone** (*phone_number_id*) e o **ID da conta do WhatsApp Business** (*WABA ID*).
4. **Token permanente:**
   - Em *Configurações do negócio → Usuários do sistema*, crie um usuário **Admin**.
   - Atribua a ele o app e a conta do WhatsApp, com controle total.
   - Clique em *Gerar token*, escolha o app e marque as permissões `whatsapp_business_messaging` e `whatsapp_business_management`, sem validade.
   - O token temporário do painel de teste vence em 24 h; não use ele.
5. **App Secret:** no app, em *Configurações → Básico → Chave secreta do app*.
6. **Webhook:** em *WhatsApp → Configuração → Webhook*.
   - **URL de retorno:** `https://gestao.seudominio.com.br/api/v1/webhooks/inbound/whatsapp`.
   - **Token de verificação:** um texto aleatório que vocês inventam. Ele vai igual no sistema, no passo 8.
   - Clique em *Verificar e salvar*. Depois, em **Campos do webhook**, assine o campo **messages**.
7. **Publicar o app** (modo *Ao vivo*). A Meta pede a **URL da Política de Privacidade**, a mesma que falta pedir à Ademicon.
   - **Forma de pagamento:** cadastre em *WhatsApp Manager → Faturamento*. Ela é necessária para templates.

## No sistema
8. **Super Admin → Configurar APIs → WhatsApp:**
   - **Modo:** `cloud-api`.
   - **URL da API:** `https://graph.facebook.com/v23.0`.
   - **Token de acesso:** o token do passo 4.
   - **App Secret:** o do passo 5.
   - **Token de verificação do webhook:** o mesmo do passo 6.
   - **ID da conta WhatsApp Business (WABA):** o do passo 3.

   Clique em **Testar conexão**. O resultado deve dizer "Conta conectada".
9. **WhatsApp → Números → Conexão com a Meta.** Esse painel faz pelo sistema o que antes era feito no painel da Meta:
   - mostra o que falta: token, WABA, App Secret e token do webhook;
   - **Inscrever agora:** inscreve o app na conta. Sem isso, as mensagens recebidas não chegam;
   - **Importar números da Meta:** traz todos os números da conta já com o *phone_number_id*. Número já cadastrado com o mesmo telefone só ganha o ID; número novo entra como número da operação, e depois dá para passar a um consultor em *Editar*;
   - **Registrar** (com o PIN de 6 dígitos): liga na API o número que ainda não está registrado.

   Se preferir cadastrar à mão, siga o passo abaixo.

   **WhatsApp → Números → Novo número:**
   - **Nome:** "Bot do piloto".
   - **Telefone:** o chip, com DDI.
   - **Finalidade:** *Prospect Agent*.
   - **ID do número na Meta:** o *phone_number_id*.

   Clique em **Conectar**. O sistema confere na Meta se o ID é mesmo desse número.
10. **Teste:** do seu celular, mande "Oi" para o número do bot. A conversa aparece no **Inbox** e o bot responde.
11. **(Opcional) Bot iniciando a conversa:**
    - Em **WhatsApp → Templates**, envie o `retorno_simulacao` para aprovação. Ele já vem pronto, como rascunho.
    - Quando a Meta aprovar, clique em **"Usar para iniciar conversas"**.
    - Para desligar, use **"Parar de iniciar conversas"**.

## Regras que o sistema já cumpre
- **Janela de 24 h:** texto livre só até 24 h depois da última mensagem do cliente; fora disso, só template aprovado. Se não houver template, o sistema não arrisca e avisa na conversa o motivo.
- **Opt-out:** se o cliente responder "PARAR", "sair" ou "não quero receber", o bot para e o pedido fica registrado (LGPD).
- **Horário de silêncio:** o bot não inicia conversa das 21h às 8h (ajustável em Configurações). Responder quem escreveu é sempre permitido.
- **Limite de contatos proativos** por semana, por lead.
- **Assinatura do webhook:** só aceita mensagens assinadas pela Meta (App Secret).
- **Sem disparo em massa** a partir da landing: cada contato é de quem deixou o número e autorizou.

## Custos (Meta, Brasil — conferir na fatura)
| Tipo | Quando | Valor de referência |
|---|---|---|
| Atendimento (*service*) | O bot ou o consultor responde quem escreveu, dentro das 24 h | Grátis (há relatos de que, a partir de out/2026, só as primeiras 1.000 por número/mês são grátis — conferir no WhatsApp Manager) |
| Utilidade (*utility*) | Template de abertura, se a Meta classificar como utilidade | ≈ US$ 0,0068 por mensagem |
| Marketing | Template promocional | ≈ US$ 0,0625 por mensagem |

O botão "Continuar no WhatsApp" é o caminho **sem custo**. O template de abertura é opcional, e a Meta pode reclassificá-lo como marketing.
