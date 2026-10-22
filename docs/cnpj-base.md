# Base CNPJ (Dados Abertos da Receita)

Base local de empresas, estabelecimentos, sócios e Simples, importada todo mês dos Dados Abertos CNPJ.
É o que permite consultar CNPJ sem depender de serviço externo e, nas próximas fases, casar resultados do
Google com CNPJ, detectar gatilhos (comparando com o mês anterior) e montar grupos econômicos.

## Onde fica

- Tabelas no schema **`cnpj`** do Postgres, **fora do Prisma** (estrutura em `src/modules/cnpj/ddl.ts`):
  `empresa`, `estabelecimento`, `socio`, `simples`, `cnae`, `municipio`, `natureza`, `qualificacao`, `meta`.
- Mês anterior em **`cnpj_anterior`** (mesma estrutura). A Fase 4 compara os dois.
- Registro de cada importação na tabela `CnpjImport` (Prisma) e cache da BrasilAPI em `CnpjCache`.
- Índices: CNPJ, CNPJ básico, município, CNAE, (município, data de abertura), telefone (últimos 8 dígitos),
  nome fantasia e razão social por trigramas (`pg_trgm`), sócio por (nome, documento).

## Como importar

```bash
npm run cnpj:importar -- --mes 2026-10 --ufs SP --dir /dados/cnpj/2026-10 --baixar
```

1. `--baixar` busca os ZIPs do mês em `CNPJ_DATA_URL` (padrão: `https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj`). Sem ele, a pasta precisa ter os ZIPs.
2. Cada arquivo vai por **COPY** (streaming, direto do `unzip -p`) para uma tabela de carga e é convertido para as tabelas finais no schema `cnpj_next`.
3. `--ufs` mantém só os estabelecimentos dessas UFs (e as empresas, sócios e Simples deles). **Sem `--ufs` é o Brasil inteiro: dezenas de GB no banco.**
4. Índices criados depois da carga, `ANALYZE`, e **troca atômica** numa transação: `cnpj` → `cnpj_anterior`, `cnpj_next` → `cnpj`. Quem consulta vê o mês antigo inteiro ou o novo inteiro.
5. Falhou no meio: a base em uso não muda e o erro fica em `CnpjImport`.

Requisitos: comando `unzip`, extensão `pg_trgm` e **conexão direta** ao Postgres (o COPY não passa pelo pooler em modo transação).
Cron sugerido no servidor: dia 20 de cada mês, 3h (comando no cabeçalho de `scripts/importar-cnpj.ts`).

**Tamanho:** a base do Brasil inteiro não cabe no Supabase Free (500 MB). Para o piloto: VPS (`docker-compose.prod.yml`) com `--ufs` da unidade.

## Consulta (`CnpjProvider`)

`src/modules/cnpj/cnpj.provider.ts`, em camadas, atrás de uma interface só:

1. memória do processo (LRU, 10 min) — consulta repetida em milissegundos;
2. **base local** (schema `cnpj`);
3. **cache da BrasilAPI** no banco (30 dias);
4. **BrasilAPI**.

Substitui por dentro a consulta de CNPJ que já existia: "Consultar CNPJ", Agente Pesquisador e ficha da empresa passam a usar a base local quando ela existir, sem mudança nas telas. O status aparece em Integrações.

**CNPJ alfanumérico**: desde jul/2026 a Receita emite CNPJ com letras nas 12 primeiras posições. A validação (`cnpj-id.ts`) já aceita (exemplo oficial `12.ABC.345/01DE-35`).

## Layout dos arquivos

Em `src/modules/cnpj/layout.ts`, conforme o dicionário de dados da Receita (CSV sem cabeçalho, `;`, aspas, LATIN1).
**Conferir na primeira carga real**: se a Receita mudar alguma coluna, só esse arquivo muda.

## Testes

`tests/fixtures/cnpj/2026-09` e `2026-10`: amostra no formato da Receita (LATIN1, com acentos), com matriz e filial,
empresa de MG (fica fora com `--ufs SP`), CNPJ alfanumérico e empresa baixada.
`tests/integration/cnpj-base.test.ts` importa os dois meses (CSV e ZIP), confere o mês anterior, a consulta completa,
a falha sem efeito na base em uso, o fallback com cache e o tempo de consulta.
