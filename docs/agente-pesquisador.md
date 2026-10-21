# Agente Pesquisador

Toda manhã, antes da lista do Google Maps, o agente entrega a cada consultor **as melhores empresas da região já pesquisadas**:
nota de 0 a 100 com os motivos, o **nome do decisor** (sócio-administrador), o produto indicado, o roteiro da ligação e a primeira mensagem de WhatsApp pronta.

O problema que ele resolve: a lista do Google Maps traz só nome e telefone da recepção. O consultor liga, cai na secretária e não sabe com quem falar nem por que aquela empresa compraria consórcio.

## Como funciona

```
7h (dias úteis) → runDailyListIfDue
  1. Agente Pesquisador (research-agent.service.ts)
     busca empresas dos segmentos-alvo na cidade da unidade   ← fonte por filtro (Casa dos Dados / exemplo)
     completa o quadro societário                           ← BrasilAPI (grátis), só para quem pode passar da nota
     dá nota explicada                                       ← research.ts, sem IA e sem custo
     fica com as melhores (nota ≥ mínima)
     a IA escreve roteiro e mensagem                         ← Gemini/Claude; sem chave, texto padrão
     entrega N por consultor, em "serpentina" (ninguém fica só com as piores)
  2. Lista diária (daily-list.service.ts)
     leads sem contato + empresas do agente + Google Maps completa até 20
  3. Notificação: "X empresas pesquisadas pelo agente, com decisor e mensagem pronta"
```

O **contato continua humano**: o agente prepara, o consultor liga ou abre o WhatsApp dele com a mensagem já escrita. Nada é disparado automaticamente (WhatsApp proíbe mensagem em frio para lista e a LGPD exige cuidado com o primeiro contato).

## A nota (0–100)

| Critério | Pontos | Por quê |
|---|---|---|
| Segmento | até 35 | Transporte, locadora, construção, agro, saúde, autoescola, atacado… têm motivo claro (frota, máquinas, sede). Lista em `TARGET_SEGMENTS` |
| Porte (capital social) | até 25 | ≥ R$ 1 mi: 25 · ≥ 300 mil: 20 · ≥ 100 mil: 15 · ≥ 30 mil: 8. MEI: 2 |
| Maturidade | até 15 | 1 a 20 anos: 15 · menos de 1 ano (montando estrutura): 12 · mais de 20: 8 |
| Decisor identificado | 15 | Sócio-administrador no quadro societário |
| Canal | até 10 | Celular 10 · fixo 5 · só e-mail 3 |
| Aprendizado | −10 a +10 | Retorno da equipe naquele segmento (mínimo de 5 contatos registrados) |

Empresa inativa ou sem nenhum contato fica com nota 0. A IA **não** dá a nota: só escreve o texto das escolhidas.

## O agente aprende

Os resultados registrados no **SDR** (falou com o decisor, respondeu, sem interesse) e na lista ("Tem interesse", que vira lead, e "Sem interesse") alimentam o aprendizado. A API também aceita o resultado direto (`POST /api/v1/prospecting/:id` com `{ action: "outcome" }`).
Por segmento (CNAE de 4 dígitos), a taxa de retorno ajusta a nota: 30% de retorno é neutro; acima disso o segmento sobe, abaixo desce. "Não atendeu" não diz nada sobre o perfil e fica de fora.

## Ficha da empresa e rede do sócio

Clicando no nome da empresa (lista do dia, fila do SDR ou tabela) abre a **ficha** (`/empresas/:id`):
- **Dados da empresa**: CNPJ, razão social, situação, abertura, capital social, porte, natureza jurídica, regime (Simples/MEI), atividade principal e secundárias, endereço, telefones e e-mail.
- **Sócios**: todos do quadro societário, com cargo, desde quando é sócio, faixa de idade e documento mascarado (dado público da Receita).
- **Ver outras empresas** (por sócio): junta as empresas **já na base** com este sócio (grátis) e a **busca por sócio da fonte** (Casa dos Dados / exemplo). Cada uma vem com nota do agente e mostra se já está com alguém da equipe.
  **Adicionar à minha lista** traz a empresa já pesquisada, com o motivo "Mesmo sócio de …", e já na cadência do SDR. Um decisor com várias empresas é oportunidade maior: a mesma conversa pode render mais de uma carta.

A BrasilAPI preenche os campos extras quando a fonte não traz (sócio desde, faixa etária, natureza jurídica, endereço, CNAEs secundários, Simples/MEI). Esses campos são opcionais: a ficha mostra o que vier.

## SDR (cadência de primeiro contato)

Toda empresa do agente entra na cadência com a 1ª etapa para hoje. O sistema diz **o que fazer e quando**, com a mensagem pronta; o consultor executa e registra o resultado. Nada é disparado automaticamente.

| Etapa | Dia útil | Canal | Objetivo |
|---|---|---|---|
| 1 | 0 | Ligação | Pedir o decisor pelo nome e marcar 15 minutos |
| 2 | 0 | WhatsApp | Apresentação e oferta de simulação |
| 3 | 2 | WhatsApp | Exemplo prático do segmento |
| 4 | 4 | Ligação | Retomar e qualificar |
| 5 | 7 | WhatsApp | Pergunta direta: faz sentido agora? |
| 6 | 10 | WhatsApp | Encerramento, porta aberta |

- **Resultados**: ligação (não atendeu, recepção, decisor, sem interesse, número errado) e WhatsApp (enviada, respondeu, sem interesse, número errado). Cada toque fica no **histórico de contatos**.
- **Falou com o decisor / respondeu** → sai da cadência e vira **conversa**: o consultor preenche a **qualificação** (o que quer comprar, valor, prazo, lance, se falou com quem decide).
- **Qualificada** (o quê + quanto + quando + decisor) → **Passar para lead**: vira lead do consultor com objetivo, valor e prazo preenchidos.
- **Sem interesse / número errado** → descartada. **Sem resposta no fim** → encerrada; volta em 90 dias.
- As mensagens das etapas 3, 5 e 6 são escritas pela IA quando configurada (com o objetivo da etapa); sem IA, modelo padrão. As mesmas regras valem: sem taxa, %, promessa.
- O resultado alimenta o aprendizado do agente (decisor/respondeu = retorno; sem interesse = sem retorno).

**Telas**: consultor → **SDR (fila do dia)** (`/sdr`): o que fazer hoje, conversas primeiro. Gestão → **SDR da equipe**: em cadência, conversando, qualificadas, descartadas/encerradas, contatos e decisores nos últimos 7 dias, por consultor.

## Configurar (gestão)

**Prospecção → Empresas → Agente Pesquisador**:
- **Cidades** no formato `Cidade/UF`. Vazio = cidades das PJs.
- **Empresas por consultor/dia** (padrão 10) e **nota mínima** (padrão 60).
- **Rodar todo dia útil às 7h**: liga o agente na lista diária.
- **Rodar agora**: roda na hora, mesmo desligado (para teste e demonstração).

## Fonte das empresas

| `COMPANY_SEARCH_PROVIDER` | O que faz |
|---|---|
| `sample` (padrão) | Empresas **fictícias** no formato da fonte paga, para ver o agente funcionando. CNPJ começa com 99 (não passa no dígito verificador), aparecem marcadas como "Exemplo fictício" e os botões de ligar e WhatsApp ficam desligados. **Em produção o agente não roda com esta fonte.** |
| `casadosdados` + `COMPANY_SEARCH_API_KEY` | **Placeholder**: aguardando a chave do plano e a documentação oficial da API para implementar `CasaDosDadosProvider.searchCompanies`. |

Configurável também em **Super Admin → Configurar APIs → Mapas e Cadastro de Empresas**.

Para ligar a fonte real basta implementar `searchCompanies` em `src/modules/integrations/company-search/company-search.provider.ts`, devolvendo `CompanyRecord` (CNPJ, razão social, CNAE, data de abertura, capital social, porte, situação, cidade, telefone, e-mail e sócios). O resto do agente não muda.

### Custo estimado da fonte paga (a confirmar com o fornecedor)
10 consultores × ~40 empresas analisadas/dia × 22 dias úteis ≈ 8.800 empresas/mês. Na Casa dos Dados, as fontes públicas citam R$ 0,01 por CNPJ (≈ R$ 88/mês) ou planos a partir de R$ 29,90 (5 mil consultas). Confirmar se a API está no plano e se a pesquisa é cobrada por empresa retornada. O agente faz no máximo 12 buscas de 50 empresas por rodada (`MAX_REQUESTS`).

## Arquivos

| Arquivo | O quê |
|---|---|
| `src/modules/business-prospecting/research.ts` | Segmentos-alvo, nota, motivos, texto padrão, ajuste aprendido |
| `src/modules/business-prospecting/research-agent.service.ts` | Rodada do agente: busca, enriquece, escolhe, distribui, grava |
| `src/modules/integrations/company-search/company-search.provider.ts` | Fonte de exemplo e placeholder da Casa dos Dados |
| `src/modules/ai/providers/pitch.ts` | Instrução e validação do texto da IA (recusa taxa, %, promessa) |
| `src/modules/business-prospecting/sdr.ts`, `sdr.service.ts` | Cadência, resultados, qualificação, passagem para lead, fila e visão da equipe |
| `src/modules/business-prospecting/partner-network.service.ts` | Outras empresas do sócio (base + fonte) e "adicionar à minha lista" |
| `src/app/(app)/empresas/[id]/` | Ficha da empresa (dados, sócios, análise, SDR, histórico) |
| `src/app/(app)/sdr/page.tsx` | Fila do SDR (consultor) e SDR da equipe (gestão) |
| `src/app/(app)/empresas/research-agent.tsx`, `research-card.tsx` | Configuração da gestão e card da empresa |
| `tests/unit/agente-pesquisador.test.ts`, `tests/unit/sdr.test.ts`, `tests/integration/agente-pesquisador.test.ts`, `tests/integration/sdr.test.ts` | Testes |
