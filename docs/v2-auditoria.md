# Auditoria V1 → V2 (Master Build + complementos de Notificações/Mobile e Revenue Intelligence)

Data: 2026-09-30. Base auditada: commit `4a57745` (V1 completa, 111 testes verdes).

## 1. O que a V1 já entrega (reutilizado, não reconstruído)

| Área | Situação na V1 | Onde |
|---|---|---|
| Stack | Next.js 15 + TS + Tailwind 4 + Prisma 6 + Postgres/pgvector + Redis/BullMQ + Zod + Vitest | `package.json`, `docker-compose.yml` |
| Multi-tenant + escopo | `organizationId` em tudo; `Ctx` com escopo ORG/PJ/OWN; helpers `leadScope`… | `src/modules/leads/scope.ts` |
| RBAC | 8 perfis, ~65 permissões, checagem na rota **e** no serviço | `src/modules/roles/permissions.ts`, `src/lib/api.ts` |
| Leads | Ingestão única (validação → normalização → dedup por identidade → enriquecimento → score → roteamento), state machine, merge com histórico | `src/modules/leads/*` |
| Score | Engine pura, explicável, regras e faixas configuráveis (FRIO/MORNO/QUENTE) | `src/modules/lead-scoring` |
| Roteamento | Regras → PJ → consultor (round robin, menor carga, prioridade), `RoutingDecision` com passos | `src/modules/lead-routing` |
| CRM | Pipeline de 10 etapas, oportunidades ≠ leads, atividades, tarefas | `opportunities`, `pipelines`, `tasks` |
| Aquisição | Campanhas, landing pages, simuladores, landings por PJ (subdomínio), attribution (sessões/eventos, first/last/linear) | `campaigns`, `landing-pages`, `landing-service`, `attribution` |
| IA | Maestro, Prospect/Qualification Agents, AI Sales Supervisor, memória estruturada, RAG com pgvector, knowledge gaps, feedback, provider Anthropic/Mock | `src/modules/ai/*`, `knowledge-base` |
| WhatsApp | Provider (mock/cloud-api), números, templates, campanhas com opt-in/limites, webhook assinado | `whatsapp`, `integrations/whatsapp` |
| Integrações | Providers com contrato + Mock explícito (Google Ads, Meta, Maps, Registry, Ademicon Newcon/ComercialNet) | `src/modules/integrations` |
| Event bus / filas | `DomainEvent` + assinantes; fila inline/BullMQ; webhooks de saída com retry | `src/lib/events.ts`, `src/lib/queue.ts` |
| LGPD / auditoria | Consentimento, preferências, opt-out, solicitações do titular, `AuditLog` | `privacy`, `audit` |
| Testes | 111 (unit, integração, E2E fluxo/segurança/tráfego+bot) | `tests/`, `scripts/teste-completo.mjs` |

## 2. Lacunas encontradas (o que a V2 adiciona)

Classificação: **F** = funcionalidade faltante · **D** = dívida técnica · **S** = segurança · **U** = UX

| # | Lacuna | Tipo | Prompt |
|---|---|---|---|
| 1 | Lead Intelligence com sub-scores (Fit, Intent, Engagement, Behavior, Recency) e decaimento temporal | F | M§15, M§19 |
| 2 | `BuyingSignal` e `IntentEvent` como entidades (tipo, evidência, confiança, origem) | F | M§17, C§5 |
| 3 | Next Best Action persistida (ação, motivo, sinais, prioridade, responsável, validade) | F | M§18, C§3 |
| 4 | Lead DNA consolidado | F | M§14 |
| 5 | Saúde/risco da oportunidade (HEALTHY/AT_RISK/STALLED, idade na etapa, velocidade) | F | M§33 |
| 6 | Candidatos a duplicidade com níveis de confiança e revisão humana (Merge/Manter/Ignorar) | F | M§23, C§10 |
| 7 | Lead Recovery Center (filas Recuperar agora/hoje/Nutrir) | F | C§11 |
| 8 | Capacity Intelligence (NORMAL/ALTA/CRÍTICA) usada no roteamento | F | M§37, C§12 |
| 9 | Loss Intelligence (categorias de perda, concorrente, padrões) | F | C§16 |
| 10 | Cockpit do Supervisor e Operation Health Center com status derivado de métricas | F | C§17, C§18, M§79 |
| 11 | Revenue Intelligence: funil completo, inteligência de produto e campanha com qualidade | F | C§22–25 |
| 12 | Busca global multi-entidade + Command Palette (Ctrl+K) com RBAC | F/U | M§12, M§123, C§36–37 |
| 13 | Notificações: prioridade, categoria, preferências, horário de silêncio, métricas de entrega/clique | F | C§31–34 |
| 14 | Tempo real (SSE) para notificações/inbox, sem polling agressivo | F/D | C§35 |
| 15 | Notificações desktop (Notification API) + Web Push (VAPID) + Service Worker + PWA | F | Push§1–2, C§26–27 |
| 16 | Dispositivos conectados (registro, revogação) | F | Push§6, C§30 |
| 17 | "Enviar para meu celular" (push para dispositivo, QR Code e link seguro temporário) | F | Push§4, C§29 |
| 18 | Extensão Chrome/Edge "Ademicon Sales Assistant" (MV3) | F | Push§3, C§28 |
| 19 | Battlecard do consultor na conversa | F/U | C§7 |
| 20 | Playbooks versionados com passos (trigger → condição → ação → espera) | F | C§2 |
| 21 | Versionamento de prompts dos agentes (DRAFT/TESTING/ACTIVE/ARCHIVED) | F | M§54 |
| 22 | AI Lab / AI Evaluation Lab (datasets, execuções, métricas, comparação de versões) | F | M§55–56, C§21 |
| 23 | Custo/tokens por execução de IA e painel de controle de IA | F | M§109, M§152 |
| 24 | Knowledge com ciclo DRAFT→REVIEW→APPROVED→PUBLISHED→EXPIRED→ARCHIVED e `validFrom` | F | M§49, M§117 |
| 25 | Feature flags por organização | F | M§80 |
| 26 | A/B testing (experimentos, variantes, atribuição a resultados de negócio) | F | C§13–14 |
| 27 | Outbox + idempotência de eventos/webhooks de entrada | D | M§149–150 |
| 28 | Organização com `legalName`, logo, timezone, locale, status | F | M§7 |
| 29 | Canais de notificação e-mail/push eram placeholders com TODO | D | M§143 |
| 30 | Seed de demonstração em escala (1.000 leads, 300 oportunidades…) | F | M§85 |
| 31 | Teste explícito de isolamento Tenant A × Tenant B (IDOR) | S | M§90 |
| 32 | CI (GitHub Actions) | D | M§94 |

## 3. Ordem de implementação

1. **Domínio**: migration única e aditiva (nada é apagado) com as novas entidades.
2. **Engines puras** (testáveis sem banco): sub-scores/decaimento, NBA, saúde de oportunidade, capacidade, níveis de duplicidade, playbook runner, horário de silêncio.
3. **Serviços + API** `/api/v1/*` com RBAC, escopo e auditoria.
4. **UI**: Cockpit, Recovery, Revenue, Perdas, Duplicidades, Saúde, Notificações/Dispositivos, Command Palette, Battlecard, AI Lab, Experimentos, Flags.
5. **Notificações multi-dispositivo**: SSE, Service Worker, Web Push, "Enviar para meu celular", extensão.
6. **Seed em escala, testes, docs, CI.**

Regras mantidas: nenhum dado/API da Ademicon inventado (Mock explícito), nenhuma métrica sem cálculo, sinais heurísticos rotulados como "sinal por regra".

## 4. Complementos finais (fechamento da V2 contra o prompt)

Segunda auditoria, item a item do prompt V2, encontrou 9 pontos ainda ausentes — todos implementados e testados:

| # | Item | Prompt | Onde |
|---|---|---|---|
| 1 | Guardrails de segurança da IA em produção: prompt injection, pedido de dados de terceiros/credenciais e vazamento de instruções → recusa segura (antes só existia no AI Lab) | §8, §62, M§113 | `ai/supervisor/supervisor.ts` (`securityCheck`) |
| 2 | `Idempotency-Key` nas rotas que criam registros ou enviam mensagens (leads, oportunidades, tarefas, aquisição, mensagens, produtos) | §51, M§150 | `lib/idempotency.ts`, `authed({ idempotent: true })` |
| 3 | Atribuição multi-toque com 5 modelos: primeiro/último toque, linear, **posição (40/20/40)** e **decaimento no tempo** | §24 | `attribution/models.ts`, tela Attribution |
| 4 | **AI Trace** por execução (mensagem → Maestro → memória → RAG com versão/relevância → agente → regras → supervisor → resposta) | §57 | `/ia/maestro/[id]` |
| 5 | **Controles de memória da IA**: liga/desliga, retenção em dias (limpeza automática) e campos permitidos | §99 | Configurações da IA, `memory.service.ts` |
| 6 | **AI Routing Assistant**: sugestão de consultor com motivo e confiança; a regra decide e a decisão registra se a sugestão foi seguida | §96 | `routing-engine.ts` (`recommendConsultant`), `RoutingDecision.aiRecommendation` |
| 7 | **Catálogo de produtos** por organização (novos produtos sem alterar código; validação em leads e consultores) | §92 | `Product`/`ProductCategory`, Admin → Produtos |
| 8 | **Report Builder**: entidade, colunas, filtros, agrupamento, período, relatórios salvos, exportação CSV/XLSX auditada | §78 | Inteligência → Relatórios |
| 9 | **Análise de coortes** por mês de entrada | §2 | Revenue Intelligence → Coortes |

Migration aditiva `20260930180000_v2_catalogo_idempotencia_routing_ia` (preenche o catálogo com os 5 produtos existentes por organização).

Correções encontradas no caminho:
- O seed terminava o trabalho mas o processo não encerrava (conexão Redis aberta) — agora encerra explicitamente.
- E2E de conversas: lead quente sem consultor elegível (capacidade esgotada) é comportamento correto — o teste agora exige a decisão `NO_ELIGIBLE` registrada.
