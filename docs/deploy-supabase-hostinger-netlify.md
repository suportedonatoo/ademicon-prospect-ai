# Colocar no ar: Supabase (banco) + Hostinger (gestão) + Netlify (landing)

| Peça | Onde | Endereço de exemplo |
|---|---|---|
| Banco de dados (Postgres) | **Supabase** — plano Free | — |
| Sistema de gestão (login, painéis, Inbox) | **Hostinger** — Node.js Web App | `https://gestao.seudominio.com.br` |
| Landing (site mestre + links dos consultores) | **Netlify** | `https://ademicon-piloto.netlify.app` |

**Link de cada consultor (por caminho):** `https://ademicon-piloto.netlify.app/c/joana-barros`.
É a mesma página do site mestre, sem nome nenhum, e o lead vai para a Joana. No `netlify.app` não existe subdomínio por consultor; por isso o link vai pelo caminho `/c/`.

> Faça na ordem: **1 Supabase → 2 Hostinger → 3 Netlify → 4 ligar as duas**.

---

## 1. Supabase (banco de dados)

1. Em supabase.com, clique em **New project**.
   - **Região:** South America (São Paulo).
   - **Senha do banco:** uma senha forte, guardada num cofre. Prefira só letras e números, porque símbolos precisam ser "escapados" na URL.
2. **Desligue a API automática** em **Project Settings → Data API**, desligando *Enable Data API*.
   - O sistema fala direto com o Postgres e não usa essa API.
   - Desligada, ninguém consegue ler as tabelas pela API pública do Supabase.
3. **Pegue a URL de conexão**: botão **Connect**, depois **Session pooler** (ela funciona em IPv4).
   - Ela se parece com `postgresql://postgres.<id>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`.
   - Acrescente `?connection_limit=5` no final. O plano Free tem poucas conexões.
4. **Crie as tabelas e o banco do piloto a partir do seu PC**, na pasta do projeto, pelo PowerShell:
   ```powershell
   $env:DATABASE_URL = "postgresql://postgres.<id>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?connection_limit=5"
   npx prisma migrate deploy
   $env:PILOTO_MARCA = "Ademicon"
   $env:PILOTO_UNIDADE = "Nome da unidade"
   $env:PILOTO_CIDADE = "Cidade"
   $env:PILOTO_UF = "SP"
   $env:PILOTO_SUPERADMINS = "voce@empresa.com"
   $env:PILOTO_ADMIN = "gestor@unidade.com"
   $env:PILOTO_ADMIN_NOME = "Nome do gestor"
   npx tsx --env-file=.env scripts/preparar-piloto.ts
   ```
   - O script imprime **uma vez** as senhas provisórias e a `LANDING_SERVICE_API_KEY`. **Guarde as duas.**
   - Ele cria só a estrutura real, sem nenhum dado fictício, e se recusa a rodar se o banco já tiver dados.
   - Feche o PowerShell depois, para a URL do Supabase não ficar na sessão.

**Limites do Free:**
- 500 MB de banco, o que sobra para o piloto.
- O projeto **pausa depois de 7 dias sem uso**. Com o piloto rodando todo dia isso não acontece. Se pausar, basta clicar em *Restore* no painel; os dados ficam guardados.
- **Backup:** o Free não tem backup diário. Exporte pelo painel ou rode `pg_dump` com a mesma URL uma vez por semana.

---

## 2. Hostinger (sistema de gestão)

Precisa de um plano com **Node.js Web Apps**: **Business** ou **Cloud**.

1. No hPanel, vá em **Websites → Adicionar site → Node.js App** e escolha **Importar do GitHub**.
   - **Repositório:** `Wendelldevelop/repositorioademicon`.
   - **Branch:** `preparacao-piloto`.
2. Configurações de deploy (a Hostinger detecta o Next.js; confira):
   - **Framework:** Next.js.
   - **Node:** 22, ou no mínimo 20.
   - **Build:** `npm run build`.
   - **Diretório de saída:** `.next`.
   - **Pasta raiz:** a raiz do repositório, ou seja, deixe em branco.
3. **Variáveis de ambiente**: cadastre antes do primeiro build. Dá para importar um arquivo `.env`.
   ```env
   APP_ENV=production
   APP_NAME=Ademicon Prospect AI
   APP_URL=https://gestao.seudominio.com.br
   DATABASE_URL=<a URL do Session pooler do passo 1.3>
   SESSION_SECRET=<texto aleatório longo — 48+ caracteres>
   CREDENTIALS_KEY=<outro texto aleatório longo>
   QUEUE_DRIVER=inline
   TRUSTED_PROXY_HOPS=1
   LANDING_URL_TEMPLATE=https://ademicon-piloto.netlify.app/c/{subdomain}
   LANDING_CENTRAL_URL=https://ademicon-piloto.netlify.app
   AI_PROVIDER=mock
   AI_MODEL=claude-haiku-4-5
   AI_VISITOR_MODE=roteiro
   WHATSAPP_PROVIDER=mock
   STORAGE_PROVIDER=local
   EMAIL_PROVIDER=log
   COMPANY_REGISTRY_PROVIDER=brasilapi
   ```
   - Não tem Redis nem worker. Com `QUEUE_DRIVER=inline`, as rotinas automáticas rodam dentro do próprio servidor: follow-up, SLA, notificações e a virada diária dos contadores do WhatsApp.
   - O sistema **se recusa a subir** se faltar `SESSION_SECRET` ou se algum endereço estiver como `localhost`. É de propósito.
4. **Domínio:** ligue `gestao.seudominio.com.br` ao app. Se o domínio está na própria Hostinger, ela cria o DNS e o HTTPS.
5. **Confira:**
   - `https://gestao.seudominio.com.br/api/v1/health` deve responder com `"database":"ok"`.
   - Entre com o Super Admin do passo 1.4 e troque a senha.
   - A tela de login **não** pode mostrar "Contas de demonstração".

> **Fotos dos colaboradores:** ficam no disco do app. A documentação da Hostinger não diz se esse disco é mantido entre deploys. Se alguma foto sumir depois de um deploy, é isso; reenvie. A solução definitiva é mover para um storage externo depois do piloto.

---

## 3. Netlify (landing)

1. Em netlify.com, vá em **Add new project → Import from Git → GitHub**.
   - **Repositório:** o mesmo. **Branch:** `preparacao-piloto`.
   - O arquivo `netlify.toml` na raiz já diz para publicar só `apps/landing`; não precisa mexer no build.
2. **Nome do site:** em *Project configuration → Change project name*, use por exemplo `ademicon-piloto`. Isso gera `ademicon-piloto.netlify.app`.
3. **Variáveis de ambiente** (*Project configuration → Environment variables*):
   ```env
   GESTAO_API_URL=https://gestao.seudominio.com.br
   LANDING_SERVICE_API_KEY=<a chave impressa no passo 1.4>
   LANDING_BASE_DOMAIN=ademicon-piloto.netlify.app
   TRUSTED_PROXY_HOPS=1
   ```
4. Clique em **Deploy** e abra `https://ademicon-piloto.netlify.app`. O site mestre deve aparecer.

---

## 4. Conferir as duas pontas ligadas

1. Na gestão, entre como Super Admin, vá em **Colaboradores → Adicionar colaborador** e cadastre um consultor de teste.
   - O link próprio deve aparecer como `https://ademicon-piloto.netlify.app/c/<nome>`.
2. Abra esse link, faça uma simulação e deixe um contato de teste. O lead deve chegar **nesse consultor**.
3. Abra o site mestre e deixe outro contato. Esse lead entra na **divisão igual**.
4. Apague os leads de teste antes de liberar para a equipe.

## Atualizar depois
Faça push no branch `preparacao-piloto`. A Hostinger e a Netlify fazem o redeploy sozinhas.
Se uma mudança tiver migration nova, rode `npx prisma migrate deploy` com a URL do Supabase, como no passo 1.4.

## Monitorar
Cadastre `https://gestao.seudominio.com.br/api/v1/health` num monitor gratuito, como o UptimeRobot, com alerta. Assim vocês sabem antes do cliente se algo cair.

## Quando tiver domínio próprio para a landing
Na Netlify, vá em *Domain management* e adicione `seudominio.com.br`. Depois, na gestão, troque as variáveis:
- `LANDING_URL_TEMPLATE=https://seudominio.com.br/c/{subdomain}`;
- `LANDING_CENTRAL_URL=https://seudominio.com.br`.

Os links dos consultores mudam sozinhos.
