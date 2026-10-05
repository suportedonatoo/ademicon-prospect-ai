# Canais e fontes reais

Todas as chaves ficam em **Super Admin → Configurar APIs** (criptografadas). Sem chave, cada canal roda em
modo simulado e a tela/diagnóstico mostram isso — nada é inventado.

## WhatsApp oficial (Cloud API da Meta) — `src/modules/integrations/whatsapp/whatsapp.provider.ts`
- Configurar: Modo `cloud-api`, URL (`https://graph.facebook.com/v23.0`), token, App Secret, token de verificação, ID da WABA.
- Em cada número (WhatsApp → Números): **ID do número na Meta** (`phone_number_id`). "Conectar" confere na Meta se o ID é daquele número.
- Webhook: `GET/POST /api/v1/webhooks/inbound/whatsapp?org=<slug>` (assinatura `X-Hub-Signature-256`).
  Recebe mensagens (texto, botões; mídia vira "[imagem recebida]") e **status** (enviada/entregue/lida/falhou).
- Envio: texto só dentro da **janela de 24 h** desde a última mensagem do cliente; fora dela só **template aprovado**
  (campanhas já enviam como template; `{{nome}}` vira `{{1}}` no formato da Meta).
- Erro do número (token, conta bloqueada, número não registrado) → número `ERROR` e a conversa segue pelo **backup**.
  Erro da mensagem (destinatário inválido etc.) → só a mensagem fica `FAILED`, com nota na conversa.

## Instagram Direct — `src/modules/instagram/instagram.service.ts`
- Configurar: token da página (`instagram_manage_messages`) + ID da conta profissional; usa App Secret e token de verificação da Meta.
- Webhook: `GET/POST /api/v1/webhooks/instagram?org=<slug>` (objeto `instagram`, campo `messages`).
- Quem escreve vira lead (identidade `INSTAGRAM:<IGSID>`, nome do perfil quando a Meta libera), a conversa cai no
  mesmo Inbox (canal Instagram) e a IA responde; o lead entra na divisão igual quando qualificado.

## Google Maps — Places API (New) Text Search
- Chave do Google Cloud com a Places API habilitada (cobrança por uso). Busca "categoria em bairro, cidade, UF", até 60 resultados.

## Bing Maps — REST (Locations + Local Search)
- Chave Bing Maps for Enterprise. A Microsoft está **descontinuando** o Bing Maps (Enterprise até 30/06/2028); o substituto é o Azure Maps.

## Cadastro Nacional de Empresas (CNPJ)
- **BrasilAPI** (dados públicos da Receita, gratuita, sem chave) — real por padrão. Prospecção → Empresas → "Consultar CNPJ"
  e enriquecimento automático de leads com CNPJ. A base pública não permite busca por cidade/atividade (use os mapas).

## Treinamento — `/treinamento`
- Super Admin publica vídeos (YouTube/Vimeo tocam dentro do sistema) e links/apostilas por módulo; a equipe marca o que
  concluiu e o Super Admin vê o progresso de cada pessoa.
