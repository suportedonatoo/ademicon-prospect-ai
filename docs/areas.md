# As três áreas do sistema

Cada perfil entra direto na sua área, com menu próprio (`src/components/nav.ts` → `navFor` / `homeFor`).

| Área | Quem | Página inicial | Menu |
|---|---|---|---|
| **Super Admin** | equipe que constrói a plataforma | `/superadmin` | Colaboradores, Configurar APIs, Saúde do sistema, Google Ads e Meta Ads, Treinamento (+ "menu completo") |
| **Admin Ademicon** | gestão (perfil ADMIN) | `/gestao` | Painel, Anúncios (grupo e individual), Leads, Inbox, Pipeline, Landing (funil), Relatórios, Treinamento |
| **Consultor** | perfil CONSULTANT | `/meu-painel` | Meu painel, Inbox (WhatsApp + Instagram), Meus leads, Minhas vendas, Tarefas, Prospectar no Google, Treinamento, Meu perfil |

Outros perfis (gestor de PJ, marketing, auditor…) continuam com o menu completo.

## Painel da gestão (`/gestao`)
Leads recebidos (quentes/mornos/frios), origem (orgânico × anúncio em grupo × individual), canais, vendas e
**CVR** (vendas ÷ leads recebidos), alertas (lead sem consultor, sem contato > 2 h) e desempenho de cada
consultor (recebidos, em aberto, quentes, sem contato, **tempo de resposta** — mediana do lead entregue até a 1ª
mensagem do consultor —, vendas, valor vendido, CVR, último acesso).
Períodos: hoje, 7 dias, 30 dias, este mês.

## Anúncios patrocinados (`/gestao/anuncios`)
- A gestão cadastra o anúncio e marca **quem pagou**: 1 consultor = **individual**; vários = **grupo**.
- O sistema gera o **link do anúncio** (página central com `utm_campaign`) para usar como URL final no Google/Meta.
  Informando o **ID da campanha**, os leads de formulário do Google/Meta e as métricas de custo também são ligados.
- Leads do anúncio vão **só para quem pagou**, em divisão igual (contando os leads daquele anúncio).
  Indisponível fica fora da vez; se nenhum patrocinador puder, o lead vai mesmo assim (eles pagaram).
- Resultado por patrocinador: leads, vendas, valor vendido e **parte do investimento** (custo real do Google/Meta, ou a
  verba cadastrada, dividido igualmente); e do anúncio: CVR, investido, custo por lead.

## Ordem de distribuição do lead
1. Veio de **anúncio patrocinado** → quem pagou (individual ou grupo).
2. Chegou pelo **link próprio** do consultor (bio), escreveu direto no **WhatsApp dele** ou foi **prospectado por ele** → esse consultor.
3. **Orgânico** (página mestre) → divisão igual entre todos. Só leads orgânicos contam nessa fila: leads pagos e o que o consultor trouxe sozinho não deixam ninguém "atrás".

## Duas frentes de página
- **Página mestre** (`central`): a página da Ademicon; quem deixa contato entra na divisão igual.
- **Link próprio de cada consultor** (`<nome>.<domínio>`, gerado no cadastro): página **idêntica** à mestre, sem nada do consultor; quem deixa contato por ela vira lead dele (`routingHint = LINK:<id>`, método `CONSULTANT_LINK`).
  Cada perfil mostra os **2 links para publicar** (site mestre + link próprio), no Perfil e no Meu painel. Em Colaboradores: copiar / trocar o link (só Super Admin). O site mestre é o domínio principal (ou `LANDING_CENTRAL_URL`). A gestão vê o total em "Links próprios dos consultores".
  O link não pode repetir subdomínio de unidade, de outro consultor nem um reservado (`www`, `api`, `central`…). Consultor desligado: o link para de abrir.
  Para gerar os links que faltam num banco existente: `npx tsx --env-file=.env scripts/gerar-links.ts`.
  **Produção:** precisa de DNS curinga (`*.dominio`) e certificado SSL curinga apontando para a landing.

## Foto do colaborador
Escolhida no "Adicionar colaborador" (opcional) ou clicando na foto em Colaboradores / Perfil. JPG, PNG ou WEBP até 3 MB, conferida pelo conteúdo do arquivo.
Troca: Super Admin ou o próprio consultor. Aparece só dentro do sistema — nunca na página pública. Fica no storage (`STORAGE_LOCAL_DIR`, pasta `fotos/`).

## Meu painel (`/meu-painel`)
Leads em aberto separados em 🔥 quentes, mornos e frios (com atalho para a conversa), CVR do período e do mês,
vendas, e os anúncios que o consultor pagou com o que trouxeram para ele.

## Prospectar no Google (consultor)
Busca empresas (Google Maps / Bing Maps) e consulta CNPJ. Cada consultor vê só as buscas dele, e a empresa
convertida vira lead **dele** (sem mensagens automáticas — o primeiro contato é humano).

## Divulgação (ajuda o consultor a gerar contato)
- **Kit do dia** (`/divulgacao`, consultor): 3 postagens prontas por dia, já com o link dele e o primeiro nome. Muda todo dia e cada consultor recebe uma ordem diferente (evita 10 textos iguais no mesmo grupo). Botões **Copiar texto** e **Compartilhar no WhatsApp** (abre o WhatsApp com o texto; a pessoa escolhe para quem envia — nada de disparo em massa).
- **Modelos do kit** (`/gestao/divulgacao`, Admin): a gestão cria, edita e **aprova**. Só aprovado vai para o kit; editar o texto tira do kit até aprovar de novo. Os 8 modelos de exemplo entram **não aprovados** (textos genéricos, sem taxa/valor/promessa) para a Ademicon revisar.
- **Canais rastreados**: todo consultor já ganha 3 (Status do WhatsApp, Instagram, Grupos) e pode criar outros ("Grupo Brasileiros em Lisboa"), levando para o link próprio ou para o site mestre.
- **Indicação**: o consultor gera um link para quem vai indicar (cliente, amigo); vem com mensagem pronta. Lead indicado é do consultor e aparece como "Indicado por …" no detalhe do lead.
- **Link curto**: `<link>/?c=<código>` (letra da rede + 10 hex: `w-`, `i-`, `g-`, `f-`, `o-`, `n-` = indicação). A landing repassa o `c` e a gestão converte em UTM (source/medium/campaign). O código fica em `Lead.utmCampaign`.
- **Resultado**: o consultor vê leads/quentes/vendas por canal e indicação; a gestão vê por consultor e os canais que mais trazem cliente.
