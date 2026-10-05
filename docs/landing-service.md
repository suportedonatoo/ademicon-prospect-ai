# Serviço de Landing Pages das PJs

A plataforma tem **dois serviços**:

| Serviço | Pasta | Porta (dev) | Papel |
|---|---|---|---|
| **Landing das PJs** | `apps/landing` | 3600 | Página pública de cada PJ com simulador. Capta e qualifica (Frio / Morno / Quente). Não tem banco. |
| **Sistema de gestão** | raiz do repositório | 3500 | CRM, distribuição, IA, pipeline, analytics. Recebe os dados da landing pela API. |

```
Visitante ──► <subdominio>.dominio (apps/landing) ──API key──► /api/v1/landing-service/* (gestão) ──► Postgres
```

## Landing mestre (layout único)

Todas as PJs usam o **mesmo layout mestre** (`apps/landing/src/components/master-page.tsx` + conteúdo em `apps/landing/src/content/master.ts`), com a estrutura da home institucional da marca: produtos → simulador → o que é consórcio → vantagens → como funciona → consórcio x financiamento → dúvidas → sua unidade. Código e textos são próprios; logo e fotos oficiais devem ser fornecidos pela marca (uso autorizado).

O que muda por PJ (Distribuição → PJs → Editar):

- Nome, cidade e cidades atendidas da unidade; título e subtítulo da landing.
- **WhatsApp, telefone e endereço da unidade**: todos os botões de contato da página (topo, card "Sua unidade" e botão flutuante) usam os números da própria PJ. Sem número cadastrado, os botões não aparecem — o sistema não inventa números.
- A **simulação** roda sempre no motor central (sistema de gestão), que valida e grava.

Cliques em WhatsApp/Ligar são registrados e aparecem em **Aquisição → Landings das PJs** (coluna Cliques WhatsApp).

O endereço sem unidade (`localhost:3600` / domínio raiz) mostra **Encontre sua unidade**, com a lista de PJs.

## Login de cada PJ

Cada unidade tem seu gestor na mesma plataforma (`pj01@prospect.demo` a `pj10@prospect.demo` no seed). Ao entrar, ele vê **só** os leads, conversas, tarefas e números da própria PJ. As landings têm o link **Área do parceiro** (variável `GESTAO_PUBLIC_URL` do app de landing).

## Endereço de cada PJ

Cada PJ tem um **subdomínio**, configurado em **Distribuição → PJs → Editar → Landing da PJ**:

- Produção: `https://jundiai-centro.seudominio.com.br` (`LANDING_BASE_DOMAIN=seudominio.com.br` + DNS curinga `*.seudominio.com.br` apontando para o serviço).
- Desenvolvimento: `http://jundiai-centro.localhost:3600` (navegadores resolvem `*.localhost` sozinhos) ou `http://localhost:3600/?pj=jundiai-centro`.

A PJ é sempre identificada pelo **endereço acessado**, nunca por dado enviado pelo navegador (em produção).

## Landing central (endereço principal)

O endereço principal (sem subdomínio, ex.: `consorcioplanejado.com.br` ou `localhost:3600`) é a **landing central**:
uma página única de prospecção e qualificação. A lista "Encontre sua unidade" passou para `/unidades`.

- Mesmo layout e mesmo simulador das PJs; textos e contatos em **Configurações → Landing central**
  (WhatsApp/telefone vazios = sem botão; nunca inventar número).
- "Simular apenas" = FRIO (sem dado pessoal). "Simulação com interesse" = MORNO/QUENTE → lead com `routingHint = CENTRAL`.
- **Divisão igual**: o lead vai para a PJ que recebeu MENOS leads no mês (entre as que têm consultor
  disponível) e, dentro dela, para o consultor que recebeu menos. Empate → rodízio. A cidade não pesa
  (atendimento remoto, inclusive brasileiros no exterior — WhatsApp com `+DDI` é aceito).
- As landings das PJs continuam: lead da landing da PJ fica na PJ, também com divisão igual entre os consultores.
- Chave reservada `central` (não pode ser subdomínio de PJ). Simulação central só vale para a central.
- Relatório: linha "Central" em Aquisição → Landings das PJs.

## Qualificação

| Temperatura | Quando | O que acontece no sistema de gestão |
|---|---|---|
| **Frio** | Só simulou | Grava a `Simulation` (heat `FRIO`, canal, PJ). **Não cria lead** e não guarda dado pessoal. |
| **Morno** | Simulou + deixou contato ("Quero receber contato") | Cria/atualiza o lead (`landingHeat=MORNO`, `originPjId`), distribui para um consultor **da própria PJ** (rodízio) e cria tarefa de contato em 24 h. |
| **Quente** | Simulou + deixou contato + "Quero ser chamado agora" | Igual ao Morno, com `landingHeat=QUENTE`, sinal "pediu contato" no score e tarefa **urgente** de retorno em 15 min. |

- Contato exige autorização (checkbox desmarcado por padrão); texto e IP ficam como evidência do consentimento.
- Temperatura só sobe (Morno → Quente) e o lead é deduplicado por telefone/e-mail.
- Sem consultor disponível na PJ, o lead fica na PJ e o gestor da PJ é notificado.

## Google orgânico x pago

A visita envia o que o navegador informa: UTMs, `gclid`/`gbraid`/`wbraid` (auto-tagging do Google Ads), `fbclid` e o site de origem (referrer). A classificação (`src/modules/attribution/channel.ts`, testada) é:

- **Google Ads (pago)**: tem identificador de clique de anúncio, ou `utm_source=google` com meio pago (ou sem meio).
- **Google orgânico**: veio de um domínio de busca do Google sem marcador de anúncio, ou `utm_medium=organic`.

O canal fica na sessão, na simulação e vira a **origem do lead** (`GOOGLE_ADS` / `GOOGLE_ORGANIC`). Onde ver:

- **Aquisição → Landings das PJs**: comparação orgânico x pago (visitas, simulações, leads, quentes, vendas) e funil por PJ.
- **Leads**: filtro *Origem → Google (orgânico + pago)* ou cada um, e filtro *Landing PJ → Quente/Morno*.

Não há raspagem de resultados do Google: só rastreamos quem chega às landings.

## API (sistema de gestão)

Autenticação: `Authorization: Bearer <LANDING_SERVICE_API_KEY>` — chave com a permissão `landing.service` (nada mais).

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/api/v1/landing-service/sites/{subdomain}` | Conteúdo da landing + produtos do simulador |
| `POST` | `/api/v1/landing-service/sites/{subdomain}/track` | Visita → sessão com canal |
| `POST` | `/api/v1/landing-service/sites/{subdomain}/simulate` | Simulação Fria |
| `POST` | `/api/v1/landing-service/sites/{subdomain}/interest` | Contato → lead Morno/Quente |

O navegador fala só com o serviço de landing (`/api/track`, `/api/simulate`, `/api/interest`), que aplica limite por IP e repassa ao sistema de gestão. A chave nunca chega ao navegador.

## Rodando

```bash
# 1. chave compartilhada (uma vez): gere e coloque o MESMO valor em
#    .env (LANDING_SERVICE_API_KEY) e apps/landing/.env.local
node -e "console.log('pk_'+require('crypto').randomBytes(24).toString('base64url'))"
npm run db:seed                       # cria a API key e os subdomínios das 10 PJs
npm run dev                           # gestão  → http://localhost:3500
cd apps/landing && npm install && npm run dev   # landing → http://jundiai-centro.localhost:3600
```

Em produção a chave também pode ser criada em **Integrações → API** com a permissão `landing.service`.

Subdomínios do seed: `jundiai-centro`, `jundiai-eloy-chaves`, `campinas-cambui`, `campinas-barao`, `sp-paulista`, `sp-tatuape`, `osasco`, `barueri-alphaville`, `sorocaba`, `itu`.
