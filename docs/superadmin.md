# Super Admin (equipe que mantém a plataforma)

Só o perfil **SUPER_ADMIN** acessa (o Admin do cliente não vê). Ao entrar, o Super Admin cai em `/superadmin`
com menu enxuto; o botão "Menu completo do sistema" mostra todas as áreas (preferência salva em cookie `pa_nav`).

| Opção | Rota | O que faz |
|---|---|---|
| Adicionar colaborador | `/admin/equipe` | Login + consultor + Instagram + **1 a 7** WhatsApp (1º = principal, demais = backup). Individual ou planilha. Entra na divisão igual na hora, empatado com a equipe. |
| Configurar APIs | `/superadmin/apis` | WhatsApp Cloud API, IA (Claude), Google Ads, Meta Ads, Mapas. |
| Saúde do sistema | `/superadmin/saude` | Infraestrutura (banco, Redis, filas, IA, WhatsApp, SLA) + negócio (leads, distribuição, equipe, números, anúncios). |
| Google Ads e Meta Ads | `/superadmin/anuncios` | Status, URL do webhook de leads, campanhas da conta, importar campanhas, sincronizar métricas. |

## Chaves de API
- Tabela `PlatformCredential`, AES-256-GCM (`src/lib/secrets.ts`). Chave: `CREDENTIALS_KEY` ou derivada do `SESSION_SECRET`
  (trocar essas variáveis exige salvar as chaves de novo).
- Prioridade: painel > `.env`. Aplicadas na hora (providers recriados) e recarregadas a cada 2 min em todas as instâncias e no worker.
- O valor nunca volta para a tela (só os 4 últimos caracteres); a auditoria guarda quais chaves mudaram, nunca o valor.

## Google Ads
- Métricas: Google Ads API REST (`customers/{id}/googleAds:search`, GAQL), OAuth2 com refresh token + developer token.
  Precisa de: developer token, client id/secret, refresh token, ID da conta (e do MCC, se houver). Versão configurável (padrão `v21`).
- Leads: formulário de lead → webhook `POST /api/v1/webhooks/google-ads/leads?org=<slug>` com a "Chave" igual a `GOOGLE_ADS_LEAD_FORM_KEY`.

## Meta Ads
- Métricas: Graph API `/{campaign_id}/insights` (diário). Precisa de token (usuário do sistema, `ads_read` + `leads_retrieval`) e ID da conta.
- Leads: webhook `leadgen` em `/api/v1/webhooks/meta/leads?org=<slug>` (verificação `hub.challenge` com `META_VERIFY_TOKEN`;
  assinatura `X-Hub-Signature-256` com `META_APP_SECRET`); o lead é buscado em `/{leadgen_id}`.

Leads de formulários (Google e Meta) entram com pedido de contato e `routingHint = CENTRAL` → divisão igual. Idempotentes pelo id do lead.
