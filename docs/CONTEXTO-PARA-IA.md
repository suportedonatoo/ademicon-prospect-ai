# Contexto do projeto (leia primeiro)

Resumo para quem vai continuar o trabalho, pessoa ou IA, sem o histórico da conversa.

## O que é
**Ademicon Prospect AI**: sistema de prospecção e qualificação de leads para **uma unidade real da Ademicon** (consórcio), que atende **brasileiros no Brasil e no exterior**.
- **Piloto:** 10 consultores, depois 30, com possibilidade de chegar a ~200.
- **Motivo:** os consultores recebem poucos leads, e desqualificados. O sistema **não promete milagre**: ainda vai precisar de anúncio. Ele resolve três coisas:
  - o lead chega **qualificado**;
  - a IA atende o frio;
  - o quente chega ao consultor com os dados e a proposta.

## Peças
| Pasta | O quê |
|---|---|
| `/` (raiz) | **Sistema de gestão**: Next.js 15, Prisma 6, Postgres + pgvector. Porta 3500. |
| `apps/landing` | **Landing**: Next.js, **sem banco**. Fala com a gestão pela API, com a chave `LANDING_SERVICE_API_KEY`. Porta 3600. |
| `prisma/` | Schema, migrations, seed de demonstração. |
| `scripts/preparar-piloto.ts` | Cria o banco do piloto **sem dado fictício**. Recusa rodar se o banco já tiver dados. |
| `docs/` | Guias. Comece por `deploy-supabase-hostinger-netlify.md`, `whatsapp-meta.md`, `areas.md` e `pendencias-ademicon.md`. |

## Decisões tomadas pelo dono do projeto
- **Três áreas:**
  - **Super Admin:** só a equipe que constrói o sistema. Cadastra colaboradores e números e configura as APIs.
  - **Admin Ademicon** (`/gestao`): métricas, anúncios, divulgação.
  - **Consultor** (`/meu-painel`).
- **Duas frentes de página:**
  - **Site mestre:** o lead entra na **divisão igual** entre todos.
  - **Link próprio de cada consultor:** página **idêntica**, **sem nada do consultor**; o lead é dele e fica fora da divisão.
  - No piloto o link é por **caminho**: `<site>.netlify.app/c/<slug>`. Subdomínio também é suportado.
- **Anúncios:** em grupo, divididos igualmente entre quem pagou, ou individuais, todos para o dono. O Admin cadastra.
- **CVR** = vendas ÷ leads recebidos.
- **Divulgação:** kit diário de posts, aprovado pela gestão; canais rastreados por link curto `?c=<código>`; link de indicação. **Nunca** disparo em massa no WhatsApp.
- **Foto do colaborador:** só aparece dentro do sistema, nunca na página pública.
- **Modo grátis** no teste interno:
  - IA por roteiro + base de conhecimento (`AI_PROVIDER=mock`).
  - Haiku (`claude-haiku-4-5`) como opção, com chave.
  - CNPJ pela BrasilAPI (real e grátis).
- **WhatsApp no piloto:**
  - API oficial da Meta (`WHATSAPP_PROVIDER=cloud-api`), com **um número dedicado ao bot**.
  - O botão "Continuar no WhatsApp" na landing faz o cliente iniciar a conversa: janela de 24 h grátis.
  - Template de abertura opcional.
  - Números pessoais dos consultores (coexistence) ficam para a fase 2.

## Regras que não podem ser quebradas
- **Nunca inventar dado da Ademicon:** taxas, valores, promessas, contatos, textos oficiais. Conteúdo genérico entra **para revisão**, sem publicar.
- Simuladores estão com `parametersVerified=false`: são **estimativa** até chegar a tabela oficial.
- LGPD: consentimento, opt-out ("PARAR"), horário de silêncio (21h–8h) e limite de contato proativo.
- Página pública nunca mostra nome ou foto do consultor.

## Onde vai rodar (piloto)
- **Banco:** Supabase Free. Usar a URL do Session pooler com `connection_limit=5` e **desligar a Data API**.
- **Gestão:** Hostinger, como Node.js Web App (plano Business/Cloud), com deploy do GitHub. Sem Redis e sem worker: `QUEUE_DRIVER=inline`; as rotinas rodam em `src/instrumentation-node.ts`.
- **Landing:** Netlify. O `netlify.toml` publica `apps/landing`.
- **Alternativa:** um VPS com `docker-compose.prod.yml` + Caddy, já pronto.
- **Repositório:** github.com/Wendelldevelop/repositorioademicon, branch **`preparacao-piloto`**. O `main` está desatualizado.

## Rodar localmente
```bash
docker compose up -d postgres redis      # Postgres na 5434, Redis na 6380
npm install && npx prisma migrate deploy && npm run db:seed   # seed = dados de DEMONSTRAÇÃO
npm run dev                              # gestão: http://localhost:3500
npm --prefix apps/landing install && npm --prefix apps/landing run dev   # landing: http://localhost:3600
```
- **Logins de demonstração** (só no seed): `superadmin@`, `admin@`, `gestor@` e `consultor01@prospect.demo`, todos com a senha `Prospect@2026`.
- **Na landing local:** `?pj=<slug>` ou `/c/<slug>` abre a página de um consultor.
- **Qualidade:**
  - `npx tsc --noEmit -p .`
  - `npx eslint . --max-warnings=0`
  - `npx vitest run` (231 testes passando)
  - `npm run test:completo`
- O Docker Desktop do PC do dono **fecha sozinho** com frequência. Se aparecer "Can't reach database server", reinicie o Docker.

## Estado atual e pendências
**Pronto:**
- landing com chat do visitante;
- lead qualificado, divisão igual e link próprio;
- painéis das 3 áreas;
- Inbox unificado;
- de 1 a 7 números por consultor, com backup;
- divulgação e indicação;
- fotos;
- WhatsApp oficial com janela de 24 h, template de abertura e opt-out;
- kit de deploy.

**Depende da Ademicon** (lista em `docs/pendencias-ademicon.md`):
- marca;
- tabela dos simuladores;
- revisão da base de conhecimento e do kit;
- política de privacidade;
- lista dos consultores.

**Depende do dono:**
- subir Supabase, Hostinger e Netlify;
- configurar a Meta (`docs/whatsapp-meta.md`);
- anotar os números de hoje para comparar depois do piloto.

**Técnico, próximo:**
1. acompanhar o primeiro deploy;
2. fotos num storage externo, porque o disco da Hostinger pode não persistir;
3. e-mail real;
4. Haiku com chave;
5. juntar o branch `preparacao-piloto` no `main`;
6. depois do piloto: mensagens 1 a 1, ranking de divulgação e Google Maps real.
