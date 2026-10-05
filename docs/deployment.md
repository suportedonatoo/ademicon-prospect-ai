# Deploy

## Componentes

| Serviço | Imagem / comando | Obrigatório |
|---|---|---|
| App (Next.js) | `Dockerfile` → `prisma migrate deploy && next start -p 3500` | Sim |
| Worker (BullMQ) | mesma imagem → `node --import tsx src/worker.ts` | Sim com `QUEUE_DRIVER=bullmq` |
| PostgreSQL 16 + pgvector | `pgvector/pgvector:pg16` (ou gerenciado com extensão `vector`) | Sim |
| Redis 7 | `redis:7-alpine` (ou gerenciado) | Recomendado (filas, rate limit distribuído) |

## Docker Compose (tudo local)

```bash
cp .env.example .env            # ajuste SESSION_SECRET e demais variáveis
docker compose --profile full up -d --build
docker compose exec app npx tsx prisma/seed.ts   # opcional: dados de demonstração
```

App em `http://localhost:3500`. Healthcheck: `GET /api/v1/health`.

Somente banco e Redis (para desenvolver com `npm run dev`): `npm run db:up`.

## Variáveis de ambiente

Lista completa e comentada em `.env.example`. Em produção, no mínimo:

| Variável | Observação |
|---|---|
| `APP_ENV=production`, `APP_URL` | URL pública (usada em links e verificação de origem). |
| `SESSION_SECRET` | Longo e aleatório (≥ 32 caracteres). |
| `DATABASE_URL`, `REDIS_URL` | Rede privada, TLS quando disponível. |
| `QUEUE_DRIVER=bullmq` | E suba o worker. |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | `mock` funciona sem chave. |
| `WHATSAPP_*`, `GOOGLE_ADS_*`, `META_*`, `*_MAPS_API_KEY`, `COMPANY_REGISTRY_*` | Somente credenciais oficiais e autorizadas; sem elas o sistema usa mocks. |

Nunca coloque segredos em imagem, repositório ou logs; use o cofre de segredos da plataforma de hospedagem.

## Pipeline de CI

`.github/workflows/ci.yml`: install → lint → typecheck → migrations → testes unitários e de integração (Postgres + Redis como serviços) → build → seed + app + teste E2E do fluxo principal.

## Checklist de produção

- [ ] HTTPS no proxy/load balancer; `APP_URL` com `https://`.
- [ ] `prisma migrate deploy` executado (o container do app já faz isso ao subir).
- [ ] Worker rodando e Redis acessível (`/api/v1/health` → `redis: ok`).
- [ ] Backups automáticos do Postgres + teste de restauração.
- [ ] Marca pública configurada em **Configurações** (`publicBrand`). Uso de marca de terceiros apenas com autorização.
- [ ] Knowledge Base revisada pela operação com conteúdo oficial (produtos, condições, políticas).
- [ ] Templates de WhatsApp aprovados na plataforma oficial.
- [ ] Política de privacidade publicada e `privacyUrl` configurada.
- [ ] Usuários de demonstração removidos (o seed é só para ambientes de teste).

## Escala

- App é stateless (sessão no banco) → escalar horizontalmente atrás de load balancer.
- Worker escala por número de réplicas (BullMQ distribui os jobs).
- Busca vetorial: com muitos documentos, criar índice HNSW (ver `database.md`).

## V2 — o que muda no deploy

| Item | Configuração |
|---|---|
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (gere com `npx web-push generate-vapid-keys`; guarde a privada no cofre). HTTPS obrigatório para push fora de `localhost`. |
| Tempo real (SSE) | Proxy sem buffering em `/api/v1/realtime/stream` e timeout de leitura ≥ 60 s. Com várias instâncias, `REDIS_URL` (Pub/Sub) é obrigatório para as notificações chegarem a todas. |
| Jobs recorrentes | O worker agenda `operations.scan` (5 min), `intelligence.batch` (1 h), `duplicates.scan` (6 h), `insights.generate` (diário), `outbox.dispatch` (30 s), `notifications.release` (1 min). `JOB_TIMEOUT_MS` controla o timeout por job. |
| E-mail | `EMAIL_PROVIDER` (`none` padrão). |
| Deep links | `DEEP_LINK_TTL_MINUTES` (padrão 10). `APP_URL` precisa ser a URL pública (é a que vai no QR Code). |
| Extensão | `npm run extension:build` → publicar `apps/extension/dist` nas lojas (Chrome Web Store / Edge Add-ons). |
| Custos de IA | Opcional: `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` para preços negociados. |
| ROI | Configure `roi.revenuePctOfWonValue` na organização para habilitar receita/ROI/ROAS. |

## Backup (estratégia recomendada)

O sistema **não** assume backup automático. Recomendado: backup gerenciado do Postgres com PITR (point-in-time recovery) e retenção ≥ 30 dias; dump lógico diário (`pg_dump -Fc`) criptografado em outro provedor/região; teste de restauração mensal documentado. Redis guarda filas e rate limit — sem dados que não possam ser reconstruídos. Uploads (`STORAGE_PROVIDER=s3`) com versionamento no bucket.

## Migrations

Toda alteração é aditiva por padrão (a V2 só adicionou tabelas/colunas, com backfill no próprio SQL). Antes de aplicar em produção: backup, `prisma migrate deploy` em staging com cópia dos dados, validação e só então produção.
