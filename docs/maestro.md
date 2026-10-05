# Maestro, agentes e governança de IA

## Pipeline de uma resposta

```
Mensagem → Maestro → contexto (lead + conversa) → memória estruturada → Knowledge Base (RAG híbrido)
→ intenção/estágio → agente (Prospect | Qualification) → playbook da IA → regras de negócio
→ AIProvider (Anthropic | Mock) → AI Sales Supervisor → confiança/risco → ação (responder | handoff | gap)
```

Arquivos: `src/modules/ai/maestro/maestro.engine.ts`, `supervisor/`, `memory/`, `providers/`, `confidence.ts`, `cost.ts`.

## AI Trace (AIExecution)

Cada execução registra: entrada, agente, playbook, **versão do prompt**, **modelo que respondeu** (inclui `mock (fallback)` quando o provider principal falha), knowledge usada (`documentId`, `chunkId`, título, relevância), veredito do Supervisor, saída (rascunho × final), **confiança**, **risco**, **requer humano**, **tokens** e **custo estimado**, latência. Feedback humano: GOOD / BAD / INCORRECT / NEEDS_REVIEW.

### Confiança (sinal por regra)

`confidence.ts`: parte de 0,55 + relevância da base; cai com knowledge gap (≤ 0,35), reescrita do Supervisor (−0,15), bloqueio (≤ 0,2) e fallback (−0,1). Risco: HIGH se bloqueado ou confiança < 0,35; MEDIUM se reescrito ou < 0,6. `requiresHuman` = handoff, gap ou risco alto. **Não é probabilidade calibrada.**

### Custo

`cost.ts`: tokens informados pelo provider × preço público do modelo (US$/1M tokens; `claude-opus-5-5` = 4 / 20). Sobrescrevível por `AI_PRICE_INPUT_PER_MTOK` / `AI_PRICE_OUTPUT_PER_MTOK`. Sem tokens (mock) → custo não estimado.

## Versionamento de prompts

`AIPromptVersion` por agente: DRAFT → TESTING → **ACTIVE** → ARCHIVED. Publicar arquiva a anterior e copia instruções/modelo/temperatura para o agente em produção. Histórico em `ConfigHistory` e auditoria (`prompt.changed`). Tela: IA → Prompts.

## AI Lab e Evaluation Lab

- **AI Lab** (`POST /api/v1/ai/lab`): executa RAG → agente → Supervisor com qualquer versão de prompt, **sem gravar conversa nem enviar mensagem**; compara duas versões lado a lado (resposta, fontes, confiança, risco, latência, tokens).
- **Evaluation Lab** (`/api/v1/ai/evals`): datasets padrão — Knowledge Base (conhecida/desconhecida), **Segurança** (promessa de contemplação, valor sem base, **prompt injection**, pedido de dados de terceiros), **Handoff** (explícito, alta intenção, baixa intenção) e **Objeções**. Expectativas verificáveis (`mustHandoff`, `mustNotContain`, `mustContainAny`, `mustBlockOrDefer`, `expectGap`). Métricas: acurácia, groundedness, taxa de alucinação (por regra: o Supervisor precisou remover afirmação sem base), handoff, bloqueio, confiança, latência e custo.

## AI Control Center

IA → AI Control Center: chamadas, custo, tokens, latência, taxa de erro, fallbacks, execuções que exigiram humano, confiança média, lacunas abertas, por modelo, por agente, por risco, feedback e últimas avaliações.

## Segurança do prompt

- Instruções e documentos internos nunca são exibidos ao cliente; o dataset de segurança testa tentativa de extração do prompt.
- O Supervisor bloqueia promessas (aprovação, contemplação, rendimento), valores sem base (preço/taxa/prazo que não estejam na base ou na fala do cliente), fingir ser humano e temas proibidos.
- A IA não executa ações de alto risco sozinha: o Copilot só sugere (o consultor decide), templates proativos exigem opt-in e limites.

## Copilot do consultor

`POST /api/v1/copilot` — Resumir, Sugerir resposta (passa pelo Supervisor e é marcada "revise antes de enviar"), Analisar objeção (com o material aprovado da base), Próxima ação (NBA) e Analisar oportunidade (saúde). Nada é enviado ao cliente automaticamente. Controlado pela flag `AI_COPILOT`.
