# Distribuição de leads (LeadRoutingEngine)

## Fluxo

```
Lead qualificado → regras ativas (por prioridade) → PJs elegíveis → consultores elegíveis
→ capacidade → método → consultor → RoutingDecision (passo a passo, auditável)
```

O núcleo é puro (`src/modules/lead-routing/routing-engine.ts`, testado em `tests/unit`); a orquestração com banco está em `routing.service.ts`.

## Regras (`RoutingRule`)

Configuradas na tela **Distribuição → Regras** (rule builder). Cada regra tem:

| Campo | Descrição |
|---|---|
| `priority` | Menor número é avaliado primeiro. |
| `conditions` | `products`, `regionIds`, `cities`, `ufs`, `sources`, `minScore` — todas as informadas precisam casar. |
| `pjIds` | PJs que recebem os leads da regra (vazio = todas as ativas). |
| `method` | `ROUND_ROBIN`, `LEAST_LOAD` (menor carga), `PRIORITY` (prioridade do consultor), `SPECIFIC_CONSULTANT`. |
| `capacity` | Teto de leads abertos por consultor para esta regra (senão usa o do consultor). |

## Elegibilidade do consultor

Um consultor é descartado (e o motivo fica registrado) quando: está fora das PJs da regra, inativo, indisponível, sem especialização no produto do lead, ou com capacidade atingida.

## Fallback

Se nenhuma regra resolver: PJs que atendem a cidade/UF do lead (`citiesServed`); se nenhuma atende, todas as PJs ativas — por round-robin. Sem consultor elegível, o lead fica `NO_ELIGIBLE`, aguardando distribuição manual.

## Registro

Toda decisão gera `RoutingDecision` com os passos (regra avaliada, condições ok/não atende, candidatos descartados e motivo, método, carga). Visível na ficha do lead e na tela **Distribuição**. Reatribuição manual (`lead.assign`) também gera decisão e auditoria.

## Follow-up e SLA

`followup.scan` procura leads distribuídos há mais de `followUp.hoursWithoutContact` horas (padrão 24) sem interação, cria tarefa para o consultor e publica `lead.unattended` — que pode disparar automações (ex.: notificar gestor, redistribuir).


## Divisão igual (EQUAL_SPLIT) — padrão

Quem recebeu **menos leads no mês corrente** (fuso de São Paulo) recebe o próximo; empate → rodízio entre os
empatados. Ao fim do período todos ficam com a mesma quantidade (diferença máxima de 1); quem ficou
indisponível é compensado quando volta. Usada em:

1. **WhatsApp do consultor** (`routingHint = OWNER:<id>`): quem escreve direto no número de um consultor vira lead dele.
2. **Landing central** (`routingHint = CENTRAL`): PJ com menos leads no mês → consultor com menos leads nela.
3. **Landing da PJ** (`originPjId`): consultores da PJ.
4. Regras com método "Divisão igual".
5. **Fallback** (nenhuma regra atendeu): igual à landing central — todas as PJs ativas, sem filtro por cidade.

Capacidade, disponibilidade, especialização e horário de trabalho continuam filtrando os candidatos.
