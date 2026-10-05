# Ademicon Prospect AI — V2 (AI Acquisition & Sales Intelligence Platform)

Plataforma de **prospecção, aquisição, IA e gestão comercial** para consórcio e crédito: capta leads de várias fontes, deduplica, pontua de forma explicável, distribui para PJs e consultores, conversa com o lead por agentes de IA supervisionados, transfere para humano com resumo e acompanha tudo até a venda, com attribution e ROI.

**V2** acrescenta a camada de **Revenue Intelligence e Sales Operations**: Lead DNA com sub-scores e decaimento, sinais de compra e intenção com evidência, **Next Best Action**, Opportunity Intelligence (saúde/risco), Loss Intelligence, Recovery Center, Cockpit do Supervisor, SLA Engine, Capacity Intelligence, Playbooks comerciais versionados, AI Sales Coach, AI Insights, A/B testing, Revenue/Campaign/Product Intelligence, AI Lab + Evaluation Lab, versionamento de prompts, custo de IA, Copilot e Battlecard do consultor, busca global (Ctrl+K), **notificações em tempo real no computador e no celular (Web Push/PWA)**, **“Enviar para meu celular”** e a extensão **Ademicon Sales Assistant** (Chrome/Edge). Auditoria da V1 e plano: [docs/v2-auditoria.md](docs/v2-auditoria.md).

> **Aviso sobre dados e marca.** Todo dado do seed é **fictício**. Não há taxas, prazos, preços, regras ou APIs da Ademicon no sistema: integrações sem documentação oficial são **Mock** ou **Placeholder**, identificadas como tal. O Ademicon foi usado só como referência de conteúdo. A marca exibida nas páginas públicas é configurável (padrão: "Consórcio Planejado"). Usar a marca Ademicon publicamente exige autorização.

## Sumário

1. [Stack](#stack)
2. [Requisitos](#requisitos)
3. [Como rodar](#como-rodar)
4. [Usuários de demonstração](#usuários-de-demonstração)
5. [Cenários de demonstração](#cenários-de-demonstração)
6. [Módulos](#módulos)
7. [Arquitetura](#arquitetura)
8. [IA, Knowledge Base e Supervisor](#ia-knowledge-base-e-supervisor)
9. [Integrações e mocks](#integrações-e-mocks)
10. [Segurança e LGPD](#segurança-e-lgpd)
11. [API](#api)
12. [Testes](#testes)
13. [Deploy](#deploy)
14. [Scripts](#scripts)
15. [Estrutura de pastas](#estrutura-de-pastas)
16. [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)

## Stack

| Camada | Tecnologia |
|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript 5.9, Tailwind CSS 4 |
| Banco | PostgreSQL 16 + pgvector, Prisma 6 |
| Filas / cache | Redis 7 + BullMQ; modo `inline` dispensa Redis em desenvolvimento |
| IA | Provider Mock, determinístico e sem custo; provider Anthropic (`@anthropic-ai/sdk`) opcional |
| Validação | Zod, com OpenAPI gerado a partir dos schemas |
| Testes | Vitest: unitários, integração com banco real e E2E via HTTP |
| Infra | Dockerfile, docker-compose, GitHub Actions |

## Requisitos

- Node.js 22 ou superior
- Docker, para Postgres (com pgvector) e Redis
- Portas: **3500** (app), **5434** (Postgres), **6380** (Redis)

## Como rodar

```bash
npm install
cp .env.example .env        # os padrões funcionam localmente, sem nenhuma chave externa
npm run db:up               # Postgres + Redis via Docker
npm run db:deploy           # aplica as migrations
npm run db:seed             # dados de demonstração (~1 min)
npm run dev                 # http://localhost:3500
```

Para usar filas reais, defina `QUEUE_DRIVER=bullmq` no `.env` e rode `npm run worker` em outro terminal.

Para subir tudo em containers (app + worker + landing + banco + Redis), use `docker compose --profile full up -d --build`.

### Landing das PJs (segundo serviço)

Cada PJ tem sua landing com simulador em `apps/landing` (porta 3600), um serviço separado que envia os leads ao sistema de gestão pela API. Com o gestão rodando:

```bash
cd apps/landing
npm install
npm run dev                 # http://jundiai-centro.localhost:3600
```

A chave compartilhada (`LANDING_SERVICE_API_KEY`) e todo o fluxo Frio / Morno / Quente estão em [docs/landing-service.md](docs/landing-service.md).

### O que o seed cria

O seed é executado pelos engines reais, não por inserção direta. Ele cria:

- 1 organização, 10 PJs e 30 consultores (+ consultor de demonstração)
- 1.000 leads, 300 oportunidades, 300 conversas e 1.000+ mensagens (`SEED_LEADS` ajusta o volume)
- 30 campanhas (métricas **mock**, identificadas), 20 landing pages e 15 simuladores
- 50 documentos na Knowledge Base (todos os status do ciclo de vida), 100 knowledge gaps, 100 automações (3 ativas + modelos)
- V2 gerada **pelos motores reais**: sinais de compra e intenções a partir das mensagens, sub-scores, ciclo de vida e NBA de todos os leads, saúde das oportunidades (inclui paradas), perdas classificadas, candidatos a duplicidade, 3 playbooks, prompts v1, 4 datasets do AI Lab avaliados, 2 experimentos A/B e os AI Insights que as regras encontram (nenhum inventado)
- os 8 cenários de demonstração

## Usuários de demonstração

A senha de todos é `Prospect@2026`. Ela pode ser trocada pela variável `SEED_PASSWORD` antes do seed.

| E-mail | Perfil | Escopo |
|---|---|---|
| `superadmin@prospect.demo` | Super Admin | Organização |
| `admin@prospect.demo` | Administrador | Organização |
| `gestor@prospect.demo` | Gestor comercial | Organização |
| `marketing@prospect.demo` | Marketing | Organização |
| `ia@prospect.demo` | Administrador de IA | Organização |
| `auditor@prospect.demo` | Auditor (somente leitura) | Organização |
| `pj01@prospect.demo` … `pj10@prospect.demo` | Gestor de PJ (um por unidade: pj01 = PJ01 … pj10 = PJ10) | Própria PJ |
| `consultor@prospect.demo` | Consultor de teste com acesso total (Super Admin, vinculado ao cadastro de consultor da PJ01) | Organização |
| `consultor01@prospect.demo` … `consultor30@prospect.demo` | Consultor | Próprios leads |

## Cenários de demonstração

Os 8 cenários aparecem no Dashboard, cada um com link direto para o lead:

1. **Lead frio**: chega pelo Instagram só com nome e telefone e fica em nutrição.
2. **Lead qualificado**: percorre Google Ads → landing → simulador → pedido de contato, e a regra "Imóveis · Jundiaí" o distribui.
3. **Lead quente**: simulou, deu opt-in e respondeu ao Qualification Agent; score ≥ 71.
4. **Transferido para consultor**: a objeção é respondida com a Knowledge Base e vem o handoff com resumo.
5. **Convertido em oportunidade**: Meta Lead Ads → oportunidade movida até "Proposta".
6. **Lead perdido**: tem motivo de perda registrado.
7. **Lead duplicado**: a mesma pessoa chega por 3 fontes e resulta em 1 lead com o histórico de merges.
8. **Sem informação suficiente para a IA**: a pergunta fora da base vira resposta segura e Knowledge Gap.

Páginas públicas para testar como cliente:

- `/landing/jundiai-imoveis`
- `/simulador/simulador-imovel`

## Módulos

| Menu | Funcionalidades |
|---|---|
| **Dashboard** | KPIs com filtros globais (período, PJ, consultor, fonte, produto, campanha), funil, cenários |
| **Prospecção** | Leads (lista, ficha com Lead DNA, timeline, score explicado e decisões de roteamento); Empresas (fontes autorizadas); Importar (CSV/XLSX com validação e relatório); Fontes |
| **Aquisição** | Campanhas; Landing Pages (builder com preview desktop/mobile e UTM); Simuladores configuráveis (Imóvel, Veículo, Moto, Serviços, Bens Móveis); Attribution |
| **CRM** | Pipeline Kanban de 10 etapas; Oportunidades com histórico; Atividades; Tarefas |
| **WhatsApp** | Inbox (IA ou humano, takeover e devolução); Números; Templates; Campanhas com opt-in, frequência e pausa |
| **Inteligência** | Lead Intelligence (score com temperatura **Frio / Morno / Quente**, filtro por temperatura, **ver a conversa** e **consultor assumir** — pausa a IA); Analytics (marketing, comercial, gestão); ROI |
| **IA** | Maestro (observabilidade, feedback, gaps); Agentes e configuração; Knowledge Base versionada; Playbooks |
| **Distribuição** | PJs; Consultores (capacidade, disponibilidade, produtos); Regras (rule builder) |
| **Integrações** | Providers (status mock/real/placeholder); Webhooks; API keys |
| **Administração** | Usuários, Perfis e permissões, Configurações (marca pública, scoring, mensagens), LGPD, Auditoria, **Feature Flags**, **Histórico de configuração** |
| **Operação (V2)** | **Cockpit do Supervisor** (onde intervir agora), **Recovery Center** (recuperar agora/hoje/nutrir), **Central de notificações** (métricas de entrega/clique/ação) |
| **Inteligência (V2)** | **Revenue Intelligence** (funil completo, onde perdemos, campanhas com qualidade, produtos, comercial, IA × humano), **Loss Intelligence**, **AI Insights**, **Sales Coach** |
| **Lead / Oportunidade (V2)** | **Next Best Action** com motivos, **Lead DNA** (fit, intenção, engajamento, comportamento, recência), sinais e intenções com evidência, **Customer Journey**; **Opportunity Intelligence** (saúde, idade na etapa, velocidade), categoria da perda; **Duplicidades** com revisão humana |
| **Conversas (V2)** | **Battlecard**, **Copilot** (resumo, sugestão revisável, objeção, próxima ação), pausar/devolver/transferir/encerrar (auditado), tempo real |
| **IA (V2)** | **AI Control Center** (custo, tokens, latência, erros, confiança), **AI Lab** (comparar versões, sem afetar produção), **Evaluation Lab** (segurança, handoff, objeções, KB), **Prompts** versionados, **Playbooks comerciais** |
| **Aquisição e Distribuição (V2)** | **Experimentos A/B** (headline/CTA das landings, resultado por oportunidades), **Capacity Intelligence**, roteamento por limite de oportunidades e horário de trabalho |
| **Mobile e extensão (V2)** | Notificações no computador, **Web Push/PWA** no celular, horário de silêncio, dispositivos conectados, **Enviar para meu celular** (push, QR Code, link seguro) e extensão **Ademicon Sales Assistant** |

## Arquitetura

Monólito modular por domínio (`src/modules/*`), multi-tenant (`organizationId` em tudo) e com escopo de dados por perfil. Eventos de domínio circulam pelo Event Bus até notificações, automações e webhooks. Há também uma fila (inline ou BullMQ).

```
Fonte → LeadEngine (validação → normalização → dedup → enriquecimento)
      → Scoring explicável → Routing (regra → PJ → consultor)
      → Maestro (Prospect/Qualification Agent) → Supervisor → Handoff
      → Opportunity → Pipeline → Attribution / Analytics / ROI
```

**Dois serviços:** landing das PJs (`apps/landing`, capta e qualifica: Frio / Morno / Quente) → sistema de gestão (este app). Leads da landing ficam na PJ dona da landing, e a origem separa **Google orgânico** de **Google Ads (pago)**.

Detalhes: [docs/architecture.md](docs/architecture.md) · [docs/database.md](docs/database.md) · [docs/events.md](docs/events.md) · [docs/queues.md](docs/queues.md) · [docs/revenue-intelligence.md](docs/revenue-intelligence.md) · [docs/troubleshooting.md](docs/troubleshooting.md) · [docs/routing.md](docs/routing.md) · [docs/landing-service.md](docs/landing-service.md) · [docs/provisionamento-pj.md](docs/provisionamento-pj.md)

## IA, Knowledge Base e Supervisor

- A IA **se identifica como assistente virtual** e nunca afirma ser humana.
- **Não inventa números**: todo valor, taxa ou prazo precisa estar na Knowledge Base, na fala do cliente ou nos dados do lead.
- O **AI Sales Supervisor** revisa toda resposta (política, conhecimento, risco, identificação e tamanho) e reescreve ou bloqueia o que viola as regras.
- **RAG híbrido**: busca vetorial com pgvector combinada com busca textual em português; só entra conteúdo de documentos ativos e dentro da validade.
- O **handoff** acontece a pedido do cliente ou por gatilhos configuráveis e gera um resumo com a próxima ação sugerida.

- **V2**: confiança/risco/“exige humano” por execução, tokens e custo estimado, modelo que respondeu (inclusive fallback), versões de prompt (DRAFT → TESTING → ACTIVE), AI Lab e Evaluation Lab com prompt injection e pedidos de dados sensíveis.

Detalhes: [docs/ai.md](docs/ai.md) · [docs/maestro.md](docs/maestro.md) · [docs/rag.md](docs/rag.md) · [docs/lead-intelligence.md](docs/lead-intelligence.md)

## Integrações e mocks

| Integração | Padrão | Real (com credenciais oficiais) |
|---|---|---|
| WhatsApp | Mock: grava sem enviar | Cloud API (`WHATSAPP_*`) |
| Google Ads, Meta e Instagram | Mock | `GOOGLE_ADS_*`, `META_*` |
| Maps e dados cadastrais | Mock | `*_MAPS_API_KEY`, `COMPANY_REGISTRY_*` |
| IA | Mock | `AI_PROVIDER=anthropic` + `AI_API_KEY` |
| Newcon e ComercialNet | **Placeholder** | Aguardando documentação oficial e autorização |
| Web Push (celular/navegador) | Real com chaves VAPID | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| E-mail | Não configurado (`log` em dev) | Provider (Gmail API, Microsoft Graph, SMTP) |
| Google / Microsoft Calendar | Não configurado | OAuth + app aprovado |

O sistema não faz scraping e não contorna limites de plataformas. Veja [docs/integrations.md](docs/integrations.md).

## Segurança e LGPD

**Controle de acesso:**
- RBAC com 8 perfis e cerca de 70 permissões.
- Escopo de dados por perfil: organização, PJ ou os próprios registros.
- Isolamento entre tenants.

**Proteção da aplicação:**
- Sessões httpOnly com o token guardado como hash.
- Proteção CSRF.
- Rate limit, inclusive no login.
- CSP e cabeçalhos de segurança.
- Logs com redação de dados sensíveis.
- Auditoria das ações sensíveis.

**LGPD:**
- Consentimento por canal com a versão da política.
- Opt-out imediato.
- Horário de silêncio e limite semanal de contatos.
- Solicitações do titular com prazo.
- Anonimização.

**V2:** tokens de dispositivo revogáveis (extensão), links “Enviar para meu celular” de uso restrito ao próprio usuário e com expiração, cliques de notificação sem open redirect, push neutro na tela bloqueada, idempotência de webhooks, outbox para eventos de receita, feature flags aplicadas na API e testes de isolamento entre organizações nos recursos novos.

Detalhes: [docs/security.md](docs/security.md) · [docs/lgpd.md](docs/lgpd.md) · [docs/notifications.md](docs/notifications.md)

## API

A API REST versionada fica em `/api/v1`, com OpenAPI em `/api/v1/openapi.json` e documentação navegável em `/api-docs`. Autenticação por sessão ou API key (`Authorization: Bearer pk_…`). Webhooks de saída são assinados com HMAC. Veja [docs/api.md](docs/api.md).

## Testes

```bash
npm test               # unitários + integração (cria o banco prospect_test automaticamente)
npm run test:unit
npm run test:integration
npm run test:e2e       # fluxo principal via HTTP; requer app rodando + seed
```

**Unitários:** scoring, roteamento, dedup e normalização, permissões e máquina de estados, Supervisor de IA, attribution e automações.

**Integração**, com banco real:
- criação e deduplicação de leads
- simulação → score → roteamento
- conversa com handoff, Knowledge Gap e opt-out
- oportunidade e analytics
- multi-tenancy e escopo por perfil

**E2E:** Google Ads → landing → simulador → dedup → Maestro → handoff → login → lead pontuado e distribuído → oportunidade até FECHADO → analytics e attribution. Por fim, checagens de 401, 403 e CSRF.

**V2 (`tests/unit/v2-engines.test.ts`, `tests/integration/v2.test.ts`, `tests/e2e/v2-golden-path.test.ts`):** sub-scores e decaimento, detecção de intenção/sinais, NBA, saúde da oportunidade, capacidade, duplicidade, horário de silêncio, playbooks, recovery; webhook idempotente, perdas, merge com histórico, notificações (dedupe, silêncio, clique), deep links e token de extensão, **IDOR entre organizações**, human override auditado, ciclo da Knowledge Base, AI Lab/Evaluation/prompt, painéis sem ROI inventado, flags e outbox; e o **golden path** completo via HTTP (campanha → landing → simulação → lead → NBA → notificação → conversa → handoff → oportunidade → conversão → revenue → insights).

## Deploy

Imagem única (`Dockerfile`) para o app e o worker. O container do app aplica as migrations ao subir. O CI (`.github/workflows/ci.yml`) roda install, lint, typecheck, testes, build e E2E. Checklist de produção em [docs/deployment.md](docs/deployment.md).

## Scripts

| Script | Ação |
|---|---|
| `npm run dev` / `build` / `start` | App na porta 3500 |
| `npm run worker` | Worker BullMQ |
| `npm run lint` / `typecheck` | Qualidade |
| `npm run db:up` / `db:migrate` / `db:deploy` / `db:seed` / `db:reset` | Banco |
| `npm run extension:build` | Gera a extensão em `apps/extension/dist` |
| `npm run test:completo` | Bateria completa (lint, tipos, testes, E2E, builds, audit) |

## Estrutura de pastas

```
prisma/            schema, migrations, seed (+ seed/ com conteúdo e cenários)
src/app/(app)/     telas autenticadas
src/app/api/v1/    API REST
src/app/landing, simulador   páginas públicas
src/components/    UI compartilhada (shell, gráficos, widgets públicos)
src/modules/       domínios (leads, lead-scoring, lead-routing, ai, knowledge-base, …)
src/lib/           infraestrutura (db, redis, filas, eventos, logger, api, openapi)
src/jobs, worker.ts   jobs assíncronos
tests/             unit, integration, e2e
docs/              documentação técnica
apps/landing/      serviço de landing das PJs (Next.js, sem banco; fala com a API de gestão)
apps/extension/    extensão Chrome/Edge "Ademicon Sales Assistant" (MV3, JS puro)
public/            service worker (Web Push), manifest do PWA e ícone
mvp/               MVP anterior (vanilla JS), mantido como referência
```

## Limitações conhecidas e próximos passos

- **Integrações reais**: dependem de credenciais oficiais; Newcon e ComercialNet dependem de documentação oficial.
- **Embeddings**: o provider padrão é léxico (hash). Um provider semântico pode entrar pela mesma interface.
- **Índice HNSW do pgvector**: ainda não foi criado (veja `docs/database.md`).
- **Parâmetros dos simuladores**: sem parâmetros verificados, o simulador mostra apenas crédito ÷ prazo. Taxas reais devem ser cadastradas pela operação a partir de fonte oficial.
- **Retenção automática de dados (LGPD)**: precisa ser definida com o jurídico antes de virar automação.
- **ROI/receita**: exige o percentual de receita sobre o volume ganho (`roi.revenuePctOfWonValue`); sem ele o sistema mostra só volume, CPL/CPQL/CPO/CAC.
- **Push no iPhone**: só para o app instalado na tela de início (iOS 16.4+); entrega real depende de HTTPS em produção e das chaves VAPID.
- **Extensão**: pronta para carregar em modo desenvolvedor; publicação nas lojas depende da conta da empresa.
- **E-mail e calendário**: abstrações prontas, sem provedor configurado.
- **Temperatura**: três faixas (Frio/Morno/Quente) por decisão da operação; o status `QUALIFIED` cumpre o papel da faixa “qualificado” sugerida no prompt.
- **Report builder genérico** e **data warehouse** separado não foram criados: exportação CSV/XLSX de leads e os painéis cobrem o volume atual (ver docs/revenue-intelligence.md).
- **Teste de carga** em escala de produção (100 mil mensagens) não foi executado localmente.

### Fechamento da V2

Itens do prompt V2 completados na auditoria final (detalhes em [docs/v2-auditoria.md](docs/v2-auditoria.md)):
guardrails de segurança da IA (prompt injection), `Idempotency-Key`, atribuição multi-toque com 5 modelos, AI Trace por execução,
controles de memória da IA, AI Routing Assistant, catálogo de produtos (Admin → Produtos), Report Builder (Inteligência → Relatórios)
e análise de coortes (Revenue Intelligence → Coortes).
