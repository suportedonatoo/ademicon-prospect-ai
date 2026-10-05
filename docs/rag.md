# RAG — Knowledge Base

## Pipeline

```
Documento (versão ativa) → Chunking → Embedding → Armazenamento vetorial (pgvector)
Pergunta → Embedding + termos lexicais → Busca híbrida → Top-K trechos → Agente → Supervisor
```

- **Documentos versionados** (`KnowledgeDocument` + `KnowledgeVersion`): título, categoria, fonte, responsável, produto, validade, prioridade, status (`DRAFT`/`ACTIVE`/`ARCHIVED`).
- Só documentos **ATIVOS e dentro da validade** são usados. Arquivar remove os chunks.
- Toda edição de conteúdo cria nova versão e reindexa (job `knowledge.index`).

## Chunking

`chunkText(text, size = 700, overlap = 120)` — por parágrafo, com sobreposição. O título entra no texto do embedding (melhora a busca), mas não no trecho entregue ao agente.

## Embeddings

`EMBEDDING_PROVIDER=hash` (padrão): embedding local por hashing de tokens normalizados, 256 dimensões — sem custo e sem dependência externa. É um provider léxico; a qualidade semântica vem da combinação com a busca textual abaixo. A coluna é `vector(256)`; um provider semântico futuro deve usar a mesma dimensão (ou uma migration que altere a coluna e reindexe).

## Busca híbrida

`searchKnowledge(orgId, query, { topK, product })`:

```
score = similaridade_cosseno(pgvector)
      + 1.5 × ts_rank_cd(to_tsvector('portuguese', título + conteúdo), to_tsquery('portuguese', termos))
      + 0.01 × prioridade do documento
      + 0.03 se o produto do documento = produto do lead
```

Os termos da busca textual são apenas letras/dígitos com 3+ caracteres unidos por OR — nenhuma sintaxe de `tsquery` vinda do usuário chega ao banco.

## Uso pelos agentes

- Documentos da categoria `POLITICAS` orientam o sistema e **não** são citados ao cliente.
- O Supervisor usa o conteúdo dos trechos recuperados como fonte da verdade para números.
- Sem trecho relevante → resposta segura + `KnowledgeGap`.

## Conteúdo do seed

Os documentos de demonstração explicam consórcio de forma genérica (como funciona, sorteio/lance, carta de crédito, objeções) e trazem o aviso de que condições reais devem ser confirmadas. **Não contêm** taxas, prazos, preços ou regras oficiais da Ademicon — isso deve ser cadastrado pela operação a partir de fontes oficiais.

## Ciclo de vida dos documentos (V2)

`DRAFT → REVIEW → APPROVED → PUBLISHED → EXPIRED / ARCHIVED` (transições validadas no servidor). **Só PUBLISHED e dentro da vigência (`validFrom`/`validUntil`) entra no índice.** Despublicar/arquivar remove os trechos do RAG; o job `operations.scan` expira documentos vencidos. Cada resposta registra `documentId`, `chunkId` e relevância (AI Trace).
