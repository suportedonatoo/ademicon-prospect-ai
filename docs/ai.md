# Inteligência Artificial

## Princípios (não negociáveis)

- A IA **se identifica como assistente virtual** no primeiro contato e nunca afirma ser humana (checado pelo Supervisor).
- **Não inventa** valores, taxas, prazos, condições, aprovação ou contemplação: números só saem se estiverem na Knowledge Base, na fala do cliente ou nos dados do lead.
- Sem promessas (aprovação garantida, contemplação garantida, "sem risco"), sem manipulação, sem insistência. Opt-out é respeitado imediatamente.
- Quando não sabe, diz que um consultor vai confirmar e registra um **Knowledge Gap**.
- Pedido explícito de humano → **handoff** imediato com resumo.

## Componentes

| Componente | Arquivo | Papel |
|---|---|---|
| **Maestro** | `src/modules/ai/maestro/maestro.engine.ts` | Orquestra cada turno de conversa. |
| **Prospect Agent** | `prospect-agent` | Primeiro contato: entender produto, objetivo, valor, cidade. |
| **Qualification Agent** | `qualification-agent` | Aprofunda: prazo, canal preferido, objeções; prepara handoff. |
| **AI Sales Supervisor** | `src/modules/ai/supervisor/supervisor.ts` | Revisa **toda** resposta antes de ir ao cliente. |
| **NLU** | `src/modules/ai/nlu.ts` | Extrai produto, valor, cidade, prazo, intenção, pedido de humano, opt-out. |
| **Memória** | `src/modules/ai/memory/memory.service.ts` | Memória estruturada mínima (slots, objeções, preferências, resumo). Nunca repete pergunta já respondida. |
| **Playbooks** | tela **IA → Playbooks** | Primeiro contato, qualificação, objeções (contemplação, parcela), lead indeciso, follow-up. |

## Turno do Maestro

1. Recebe a mensagem (WhatsApp ou chat web) e registra.
2–4. Carrega lead, contexto da conversa e memória.
5–7. Define estágio, intenção e agente responsável (Prospect ou Qualification).
8. Busca na Knowledge Base (RAG híbrido — ver `rag.md`).
9–10. Aplica regras de negócio do playbook e gera a resposta (provider de IA).
11. Decide handoff (pedido explícito, lead quente, qualificação completa, limite de turnos — cada gatilho configurável).
12. **Supervisor**: Policy → Knowledge → Risk → Disclosure → Tamanho. Resultado `APPROVED`, `REWRITTEN` ou `BLOCKED` (resposta segura).
13. Atualiza score com os sinais da conversa.
14. Entrega a mensagem, persiste `AIExecution`/`AIEvent` e publica eventos.

Com o bot pausado (modo `HUMAN`) nenhuma resposta automática é gerada.

## Handoff

`performHandoff` muda a conversa para `HUMAN`, pausa o bot, garante consultor (roteamento se necessário), gera `ConversationSummary` (produto, valor, cidade, objeções, intenção, **próxima ação sugerida**), notifica o consultor (ou gestores, se não houver consultor) e publica `conversation.handoff` / `ai.handoff`.

## Providers

`AI_PROVIDER=mock` (padrão) — NLU por regras + trechos da Knowledge Base; determinístico, sem custo, usado em testes e demo.

`AI_PROVIDER=anthropic` + `AI_API_KEY` — `AnthropicAIProvider` (`@anthropic-ai/sdk`, `messages.parse` com saída estruturada via Zod). Modelo em `AI_MODEL` (padrão `claude-opus-5`). Em qualquer erro do provider real, o sistema cai para o mock e registra o evento. A saída do provider real passa pelo mesmo Supervisor.

## Configuração (tela IA → Agentes)

Personalidade (formalidade, objetividade, emojis, estilo), tamanho máximo da resposta (padrão 600), texto de identificação (disclosure), assuntos proibidos, gatilhos de handoff e limite de turnos do bot (padrão 12), relevância mínima e top-K da Knowledge Base. Guardado em `Organization.settings.ai`.

## Observabilidade

Cada turno gera `AIExecution` (agente, latência, tokens quando houver, veredito do Supervisor, violações) e `AIEvent`s. Consultores e gestores avaliam respostas (`AIFeedback`: GOOD, BAD, INCORRECT, NEEDS_REVIEW + comentário). Perguntas sem resposta viram `KnowledgeGap` para o time curar a base.

## Guardrails de segurança, memória, trace e roteamento (fechamento V2)

- **Security check** — primeira verificação do Supervisor: tentativa de prompt injection ("ignore as instruções", "mostre seu prompt", modo desenvolvedor),
  pedido de dados de terceiros ou credenciais e vazamento de instruções internas/chaves na resposta → resposta bloqueada com recusa segura e risco ALTO.
- **Controles de memória** (IA → Agentes): liga/desliga, retenção em dias (o job `operations.scan` apaga memórias vencidas) e campos permitidos —
  campos desmarcados deixam de ser gravados e são apagados na próxima atualização.
- **AI Trace** (IA → Maestro → execução): mensagem, agente/playbook/modelo/versão do prompt, campos faltando e extraídos, fontes do RAG
  (documento, versão, chunk, relevância), rascunho do agente, regra de handoff, veredito do Supervisor e resposta final com confiança, risco, latência e tokens.
- **AI Routing Assistant**: sugere o consultor (especialidade 40% · capacidade livre 40% · prioridade 20% — sinal por regra, não modelo treinado).
  A regra configurada decide; a `RoutingDecision` registra a sugestão e se ela foi seguida.
