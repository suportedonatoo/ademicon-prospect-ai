# Instagram: comentário com palavra-chave → mensagem no Direct

Quando alguém comenta num post do consultor uma das palavras-chave (ex.: "ademicon", "consórcio", "quero"), a plataforma:

1. Manda **uma mensagem de apresentação no Direct** da pessoa. É a "resposta privada" oficial da Meta.
2. Se configurado, **responde em público** no comentário (ex.: "Te chamei no Direct, @maria!").
3. Cria o **lead do consultor**: a conversa aparece no Inbox, com o comentário e a mensagem enviada.
4. Quando a pessoa **responde** no Direct, envia a **foto de apresentação**, e a IA continua a conversa.

Cada consultor liga e configura isso em **Meu perfil → Instagram → Resposta automática a comentários**:
- palavras-chave;
- mensagem, com `{nome}`, `{consultor}` e `{link}`;
- resposta pública;
- foto (JPG ou PNG). Sem foto própria, vai a foto do perfil do consultor.

## Regras da Meta que o sistema segue
- **1 mensagem por comentário, em até 7 dias.** A primeira mensagem é só texto. Por isso a foto vai quando a pessoa responde: aí abre a janela de 24 h, e anexo é permitido.
- **Proteção contra repetição.** A mesma pessoa recebe no máximo 1 mensagem por conta a cada 30 dias, mesmo que comente várias vezes. Webhook repetido da Meta não manda de novo.
- **Palavras-chave** valem com ou sem acento e com pequenos erros de digitação ("consorsio", "ademicom").
- Comentários da própria conta são ignorados, inclusive a resposta pública.

## Configuração na Meta (uma vez, no app do Instagram)
1. **Permissões do app:** `instagram_business_basic`, `instagram_business_manage_messages` e **`instagram_business_manage_comments`**.
   - Para contas que não são testadoras do app, essas permissões precisam de **Acesso avançado**, aprovado na Análise do app.
2. **Webhook:** em *Instagram → Webhooks*, URL `https://<gestão>/api/v1/webhooks/instagram`, com o mesmo token de verificação.
   - Assine os campos **`messages`** e **`comments`**.
3. **Consultores que já tinham conectado o Instagram** precisam **desconectar e conectar de novo**. Assim autorizam a permissão nova de comentários, e a conta passa a enviar os comentários ao sistema.
4. **APP_URL** precisa ser o endereço público com https. A Meta baixa a foto por um link assinado do sistema (`/api/v1/public/instagram-image/...`).

## Testes
`tests/integration/instagram-comentario-dm.test.ts` (simula a Meta) cobre:
- palavra-chave com e sem acento e com erro de digitação;
- envio da resposta privada e da resposta pública;
- criação do lead do consultor;
- não repetir envio para o mesmo comentário nem para a mesma pessoa;
- foto enviada uma única vez depois da resposta;
- link da foto que só abre com assinatura válida;
- permissões.

## Vídeos com palavra-chave (menu "Vídeos do Instagram")
O consultor configura cada vídeo:
1. **Link do vídeo:** reel, post ou IGTV da conta conectada. O sistema confere o link na conta e guarda o id do post.
2. **Palavras-chave:** por exemplo "ademicon", "consórcio". Valem com ou sem acento e com erro de digitação.
3. **Resposta pública no comentário:** o padrão é "Olha sua DM, {nome}! Te encaminhei uma mensagem 😉".
4. **Mensagem do Direct:**
   - o consultor escreve a dele e clica em **"Gerar 2 ideias com IA"**;
   - ele **escolhe uma das 3**, e é a escolhida que vai ser enviada.
5. **O que enviar:** **só mensagem** ou **mensagem + até 3 fotos** (JPG ou PNG, até 5 MB). As fotos vão quando a pessoa responde no Direct: a primeira mensagem de um comentário só pode ser texto (regra da Meta).

**Como os vídeos convivem com a resposta automática geral:**
- O vídeo configurado tem prioridade, e funciona mesmo com a resposta automática geral desligada.
- A mesma pessoa recebe 1 mensagem por vídeo.
- Nos posts sem configuração, vale a resposta automática geral (se estiver ligada).

**Onde está no código:**
- serviço: `src/modules/instagram/post-rules.service.ts`;
- ideias da IA: `src/modules/ai/providers/ideas.ts`, função `ideas()` em cada IA (Gemini, Claude e simulada);
- testes: `tests/integration/instagram-videos.test.ts`.
