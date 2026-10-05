# Segurança

## Autenticação

- **Sessão** por cookie `pa_session` (`httpOnly`, `sameSite=lax`, `secure` em produção), validade de 12 h. No banco fica apenas o **hash SHA-256** do token.
- Senhas com **bcrypt**. Nenhuma senha real no código: o seed usa `SEED_PASSWORD` (padrão só para demo local).
- **Login com rate limit**: 20 tentativas/min por IP e 10 a cada 15 min por conta.
- **API keys** (`pk_…`) para integrações: exibidas uma vez, guardadas como hash, com permissões próprias, revogáveis, `lastUsedAt` registrado.

## Autorização (RBAC)

- 8 perfis de sistema: Super Admin, Administrador, Gestor comercial, Marketing, Administrador de IA, Gestor de PJ, Consultor, Auditor.
- ~70 permissões granulares (`src/modules/roles/permissions.ts`), editáveis por perfil em **Configurações → Perfis** (`role.manage`, auditado).
- **Escopo de dados** por perfil: `ORG`, `PJ` (só a própria PJ) ou `OWN` (só os próprios leads/oportunidades/conversas/tarefas).
- Checagem sempre no **serviço** (`assertCan`), não só na UI; menus escondem o que o perfil não pode usar.

## Multi-tenancy

Toda consulta de negócio filtra `organizationId`. Recurso de outra organização responde **404** (sem revelar existência). Deduplicação nunca cruza tenants. Coberto por testes de integração.

## Proteções da API

- **CSRF**: rotas autenticadas por cookie exigem `Origin`/`Referer` do próprio domínio em métodos que alteram dados.
- **Rate limit** em todas as rotas (Redis, com fallback em memória); rotas públicas por IP.
- **Validação** de toda entrada com Zod; erros padronizados sem stack trace.
- Busca textual sem sintaxe injetável; SQL bruto apenas parametrizado (`$queryRaw` com template).
- Webhooks de saída assinados com HMAC-SHA256 + timestamp.

## Cabeçalhos HTTP

`Content-Security-Policy` restritiva (`default-src 'self'`, `frame-ancestors 'self'`, `form-action 'self'`), `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (câmera/microfone/geolocalização desativados). `X-Powered-By` removido.

## Segredos e logs

- Segredos **somente** por variável de ambiente (`.env`, fora do git). `.env.example` não contém valores reais.
- Logger com **redação automática** de chaves sensíveis (senha, token, secret, authorization, cookie, api key, CPF, CNPJ, telefone, e-mail).
- Conteúdo de conversa não vai para logs de aplicação.

## Auditoria

`AuditLog` registra quem, quando, o quê e de onde (IP/user agent) para: login, alteração de permissões/usuários, exportações, reatribuições, handoff, mudanças na Knowledge Base, integrações, webhooks e ações de LGPD. Tela **Auditoria** (`audit.read`).

## Exportações

Exigem `lead.export`, respeitam o escopo do perfil, são auditadas (filtros e quantidade) e excluem leads anonimizados.

## Webhook do WhatsApp (mensagens recebidas)

Cada entrega precisa da assinatura `X-Hub-Signature-256 = sha256=HMAC-SHA256(App Secret, corpo bruto)`, que a plataforma oficial envia. Configure `WHATSAPP_APP_SECRET`. Sem o segredo, o webhook só aceita mensagens no modo **mock** fora de produção — do contrário, qualquer pessoa poderia mandar mensagens "em nome" de um telefone (lead falso, opt-out indevido de terceiros).

## IP do cliente e proxy

O IP usado no rate limit e na auditoria é o valor do `X-Forwarded-For` acrescentado pelo proxy confiável (`TRUSTED_PROXY_HOPS`, padrão 1, contado da direita). Valores à esquerda são ignorados porque podem ser forjados. Em produção, o app deve ficar **atrás** do proxy/load balancer (não exposto direto).

## Bateria de testes

`npm run test:completo` executa lint, tipos, testes unitários/integração, E2E (fluxo principal, **segurança**, **tráfego pago/orgânico + 20 conversas do bot**), builds e `npm audit`. Os E2E exigem os dois serviços rodando (`Iniciar.bat`).

## Recomendações para produção

- `SESSION_SECRET` longo e aleatório; HTTPS obrigatório (proxy/load balancer).
- Postgres e Redis em rede privada; backups criptografados.
- Rotacionar API keys e segredos de webhook periodicamente.
- Revisar o CSP se forem adicionados scripts de terceiros (ex.: tags de conversão).

## V2 — novos controles

- **Tokens de dispositivo (extensão)**: `dx_…` aleatório de 256 bits, só o hash no banco, revogável; aceito apenas em rotas de leitura rápida (`device: true`).
- **Enviar para meu celular**: código de 16 caracteres (96 bits), só o hash no banco, validade curta, **uso restrito ao mesmo usuário e organização**, nunca transfere a sessão; URL sem dado pessoal nem token permanente. Testado: sem login, outro usuário, outro tenant e expirado.
- **Notificações**: clique redireciona só para caminho interno (sem open redirect); notificação de outro usuário → 404; push com texto neutro na tela bloqueada (padrão).
- **SSE**: exige sessão; eventos de organização carregam só IDs (os dados são buscados pela API com escopo).
- **Cookie `pa_vid`** (experimentos A/B nas landings): identificador anônimo, `httpOnly`, restrito a `/landing`, sem dado pessoal.
- **Idempotência**: webhooks recebidos e mensagens com o mesmo ID externo não geram duplicidades.
- **Outbox** para eventos de receita (fechamento de oportunidade): evento gravado na mesma transação.
- **Feature flags** bloqueiam o recurso na API (não só na tela).
- **IA com ferramentas limitadas**: o Copilot só sugere; playbooks só executam ações internas ou templates aprovados com opt-in; nenhuma ação da IA envia mensagem proativa sem consentimento.
- **Testes de isolamento (IDOR)** para Lead DNA, jornada, battlecard, takeover, NBA, busca global e cockpit entre organizações (`tests/integration/v2.test.ts`).

## Fechamento V2

- **Prompt injection / dados de terceiros**: guardrail no Supervisor da IA (ver `docs/ai.md`), coberto por testes unitários e E2E
  (mensagem de injection via WhatsApp recebe recusa segura).
- **Idempotency-Key**: evita duplicidade em reenvios de integrações (ver `docs/api.md`).
- **Report Builder**: respeita o escopo do perfil (ORG/PJ/OWN); exportação exige `lead.export` e é auditada.
