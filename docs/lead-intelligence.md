# Lead Intelligence V2

Tudo aqui é **sinal por regra, explicável**. Nenhum número é apresentado como probabilidade de compra.

## Lead Score e temperatura (V1, mantido)

`src/modules/lead-scoring/scoring-engine.ts`. Regras com pontos e faixas configuráveis:
**Frio 0–40 · Morno 41–70 · Quente 71–100**. Morno e Quente vão para um consultor; Frio fica em nutrição.
A operação optou por três faixas; o prompt sugeria quatro (COLD/WARM/QUALIFIED/HOT) — o equivalente a "QUALIFIED" é o status `QUALIFIED` do lead.

## Sub-scores (V2)

`src/modules/lead-intelligence/subscores.ts` — cada dimensão vai de 0 a 100 e guarda os fatores que a compõem.

| Dimensão | O que mede | Fatores (pontos) |
|---|---|---|
| **Fit** | O lead tem o perfil atendido? | produto 25 · valor 25 · cidade atendida por PJ 25 (só cidade: 12) · objetivo 10 · prazo 5 · telefone+e-mail 10 |
| **Intenção** | Quão perto de decidir | intenção alta 50 / média 25 · pediu contato 25 · simulou 15 · IntentEvents (compra 35, contato/ligação 25, urgência 20, simulação 20…) × confiança · desistência −40 |
| **Engajamento** | Conversa de verdade | 12 por mensagem do cliente (máx. 60) · respondeu ao assistente 20 · ida e volta até 20 |
| **Comportamento** | Sinais de compra observados | por tipo de BuyingSignal × confiança (simulação 30, pediu contato 30, WhatsApp 20, voltou ao site 20, preço 15…) |
| **Recência** | Decaimento temporal | ≤1 dia 100 · ≤7 80 · ≤14 60 · ≤30 35 · ≤60 15 · depois 0 (degraus configuráveis) |

**Índice de prioridade** = média ponderada (pesos padrão: fit 0,25 · intenção 0,30 · engajamento 0,15 · comportamento 0,15 · recência 0,15), configurável em `settings.intelligence.weights`. É usado para ordenar Recovery Center e NBA.

### Decaimento e ciclo de vida

`lifecycle`: `ACTIVE` → (sem interação há `nurtureDays`, padrão 30) `NURTURE` → (`reactivationDays`, padrão 60) `REACTIVATION`.
Nenhum lead é excluído. Quando chega um sinal novo, o lead volta para `ACTIVE`, é registrado um `IntentEvent RENEWED_INTEREST`, o consultor é notificado e o playbook de reativação é escolhido.

## Sinais de compra e intenção

`src/modules/lead-intelligence/signal-detector.ts` (regras em português, sempre com **evidência** — o trecho que justificou).

- **BuyingSignal** (`type, source, confidence, evidence, createdAt`): simulation_requested, price_question, product_question, returned_to_site, whatsapp_clicked, replied, requested_contact, accepted_consultant, high_engagement.
  Fontes: mensagens do cliente, simulador, landing e rastreamento (visitante já identificado que volta ao site ou clica no WhatsApp).
- **IntentEvent** (`type, evidence, confidence, origin RULE|AI, leadId, conversationId, messageId`): PURCHASE_INTENT, URGENCY, FINANCIAL_INTEREST, SIMULATION_REQUEST, CONTACT_REQUEST, WHATSAPP_REQUEST, CALL_REQUEST, COMPARISON, OBJECTION, QUESTION, DROPOUT, RETURN_INTENT, RENEWED_INTEREST, SPECIALIST_NEEDED.

Nenhum atributo sensível é inferido; as regras olham apenas para o que o cliente escreveu sobre a compra.

## Next Best Action

`src/modules/lead-intelligence/nba-engine.ts`. Regras em ordem de urgência (a primeira vira a ação principal):

1. Cliente aguardando resposta com atendimento humano → **Responder no WhatsApp** (crítica após 15 min)
2. Pediu ligação/contato → **Ligar / Contatar agora**
3. Morno/quente sem consultor → **Distribuir para consultor** (dono: gestor da PJ)
4. Caso de empresa/frota/imóvel comercial → **Transferir para especialista**
5. Pediu simulação e ainda não recebeu → **Enviar simulação**
6. Oportunidade parada/em risco → **Follow-up**
7. Sinal de desistência → **Encerrar** (confirmar e registrar motivo, sem insistir)
8. Ciclo de vida → **Reativar** / **Nutrir**
9. Sem contato há 3+ dias → **Follow-up**; sem tarefa aberta → **Criar tarefa**; nada pendente → **Aguardar**

Cada recomendação guarda: ação, prioridade, **motivo**, **sinais reais usados**, confiança (fixa por regra, sobe levemente com mais evidências), responsável, **melhor horário** (respeita o silêncio do cliente) e **validade**. Opt-out gera apenas "Aguardar".
Persistência: no máximo **uma NBA aberta por lead** (`NextBestAction`); a anterior fica `SUPERSEDED`, e as vencidas viram `EXPIRED` no job horário.

## Quando recalcula

Eventos: mensagem recebida/enviada (humano), handoff, score, distribuição, simulação, oportunidade criada/movida, tarefa atrasada, merge. Também o job `intelligence.batch` (horário) aplica decaimento e expira NBAs. Manualmente: botão **Recalcular** no lead (`POST /api/v1/leads/:id/intelligence/refresh`).

## Duplicidade avançada

`src/modules/leads/match-engine.ts`. A ingestão já funde automaticamente por identidade exata (telefone, e-mail, CNPJ, ID externo). A varredura (`duplicates.scan`) compara por nome (Jaro-Winkler + tokens), final do telefone, usuário do e-mail, domínio corporativo, empresa e cidade:
`MATCH_EXACT ≥ 100 · MATCH_HIGH ≥ 75 · MATCH_MEDIUM ≥ 50 · MATCH_LOW ≥ 30`. Abaixo de exato, **só revisão humana** (Prospecção → Duplicidades): Mesclar (histórico preservado, o outro fica marcado como mesclado), Manter ambos, Ignorar.

## Playbooks comerciais

`src/modules/playbooks`. Versão = segmento (temperatura, produto, origem, região, PJ, consultor, campanha, status, intenção) + passos (`ACTION`, `WAIT`, `CONDITION`).
Selecionado na distribuição e na reativação; um playbook por lead por vez (mudança de contexto cancela o anterior com registro). Ações: notificar, criar tarefa, recalcular NBA, criar oportunidade, handoff e **template aprovado somente com opt-in, fora do silêncio e dentro do limite semanal**.
