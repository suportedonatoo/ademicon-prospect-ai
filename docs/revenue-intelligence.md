# Revenue Intelligence, Operação e Perdas

## Revenue Intelligence (`/revenue`)

Serviço: `src/modules/revenue/revenue.service.ts`. Todos os números vêm do banco, com os filtros globais (período, região, PJ, consultor, produto, origem, campanha) e o escopo do usuário.

| Visão | Conteúdo |
|---|---|
| Funil de receita | Impressões → cliques → visitas → simulações → leads → qualificados → quentes → contatados → oportunidades → propostas → negociação → conversões; taxa de passagem e fonte de cada etapa; tempo médio lead→oportunidade e lead→conversão |
| Onde perdemos | Mesmo funil por origem, campanha, produto, região, PJ ou consultor + a **maior queda relativa** entre etapas |
| Campaign Intelligence | Gasto, cliques, CTR, CPC, leads, CPL, qualificados, CPQL, quentes, oportunidades, CPO, conversões, CAC, receita, ROI, ROAS + qualidade do lead (score médio, % qualificado, % quente) e da oportunidade (taxa, taxa de ganho, valor médio) |
| Product Intelligence | Procura, intenção média, qualificação, conversão, volume ganho, principais objeções, cidades, PJs e campanhas por produto |
| Comercial | Lead→Qualificado→Oportunidade→Proposta→Fechado com taxa, tempo médio e drop-off |
| IA × Humano | Leads atendidos pela IA, qualificados só pela IA, handoffs, intervenção humana e taxa de oportunidade com x sem IA (comparação observacional) |

### Origem das métricas de mídia

Impressões, cliques e gasto só vêm de `CampaignMetric` (provider real, importação ou seed). Cada campanha informa **"métricas demo/mock"** quando a origem é o provider mock.

### Fórmula de ROI (configurável)

```
Receita atribuída = Σ valor das oportunidades GANHAS × revenuePctOfWonValue / 100
ROI  = (Receita − Investimento) / Investimento
ROAS = Receita / Investimento
```

`settings.roi.revenuePctOfWonValue` é `null` por padrão: **sem esse percentual o sistema não calcula receita, ROI nem ROAS** (não há receita inventada). O "Volume ganho" (valor das cartas) é sempre exibido separadamente.

## Opportunity Intelligence

`src/modules/opportunities/health-engine.ts` — por regra:

- idade na etapa × SLA da etapa (`settings.opportunityHealth.stageSlaDays`), dias sem atividade, tarefas atrasadas, próximo passo agendado, cliente aguardando resposta, lead esfriou.
- **STALLED**: sem atividade ≥ `stallDays` (14) ou idade na etapa > 2× o SLA. **AT_RISK**: índice < 60. **HEALTHY**: demais.
- Velocidade = etapas avançadas por semana. Transição para STALLED publica `opportunity.stalled` e notifica o consultor.

## Loss Intelligence (`/perdas`)

Ao mover para **Perdido**, a categoria (preço, concorrente, prazo, sem interesse, sem contato, desistência, produto, outro), o motivo e o concorrente são obrigatórios/registrados em `LossRecord`. A tela agrupa por categoria, etapa, produto, consultor e concorrente; o padrão dominante vira AI Insight `LOSS_PATTERN`.

## Recovery Center (`/recuperacao`)

Filas **Recuperar agora · Recuperar hoje · Nutrir** a partir de: quentes não atendidos (SLA de primeira resposta), conversas abandonadas (cliente escreveu por último há 1h+), oportunidades paradas/em risco, propostas sem retorno (3+ dias), leads reaquecidos (3 dias) e leads esquecidos (3+ dias sem interação e sem tarefa). "Recuperar" cria uma tarefa e registra auditoria.

## Cockpit do Supervisor (`/cockpit`)

"Onde preciso intervir agora?": quentes (e sem consultor), SLA (estourados e escalados), conversas aguardando consultor, consultores com capacidade alta/crítica, oportunidades abertas/paradas, tarefas vencidas e NBAs críticas — tudo no escopo do usuário, atualizado em tempo real.

## SLA Engine

`src/modules/sla/sla.service.ts` (job `operations.scan`, a cada 5 min):
- **Resposta ao lead**: morno/quente distribuído sem ação humana em `leadResponseMinutes` (15).
- **Handoff**: conversa humana com o cliente esperando além de `handoffMinutes` (10).
- Estouro → notifica o consultor; persistindo além de `escalateAfterMinutes` (60) → gestores + tarefa urgente + evento `sla.breached`. Cada estouro é tratado uma única vez por nível.

## Capacity Intelligence (`/distribuicao/capacidade`)

Carga = máx(leads ativos / limite de leads, oportunidades abertas / limite de oportunidades). NORMAL < 80% ≤ ALTA < 100% ≤ CRÍTICA; indisponível/inativo à parte.
Com a flag `ADVANCED_ROUTING`, o roteamento também respeita o limite de oportunidades e **prefere quem está no horário de trabalho** (se ninguém estiver, todos seguem elegíveis para o lead não parar).

## AI Sales Coach (`/coach`)

Por consultor: leads recebidos, 1ª resposta média, conversas abandonadas, follow-ups feitos e vencidos, oportunidades sem atividade, ganhas/perdidas, objeções e etapas de perda — com sugestões e evidência. É ferramenta de desenvolvimento, **sem ranking** e sem uso para decisão trabalhista automatizada.

## AI Insights (`/insights`)

Regras sobre dados reais (job diário + botão): qualificados sem follow-up, oportunidades paradas, fonte com volume e baixa qualificação, aumento de CPL (14×14 dias, só com gasto real), objeção recorrente, perguntas sem resposta, queda de conversão lead→oportunidade (30×30 dias), padrão de perda, volume de alta intenção. Cada insight guarda `sourceData`, período e confiança (pelo tamanho da amostra). Sem dados suficientes, o insight não é criado.

## Experimentos A/B (`/experimentos`)

Variantes com peso; atribuição **determinística** por visitante (cookie anônimo `pa_vid`, sem dado pessoal) nas landings; variantes podem trocar headline, subtítulo e CTA. O lead herda a variante e as oportunidades contam para ela. Resultado por variante: exposições, leads, qualificados, oportunidades, conversões, receita (se configurada) e IC 95% da métrica principal. **Vencedor só com ≥100 exposições por variante e intervalos sem sobreposição.**
