# Colocar no ar — opção VPS (servidor próprio com Docker)

> **Escolha atual do piloto:** Supabase + Hostinger + Netlify → siga [deploy-supabase-hostinger-netlify.md](deploy-supabase-hostinger-netlify.md).
> Este guia fica como alternativa (tudo num servidor só).

Tudo roda em **um servidor** com Docker: sistema de gestão, worker, landing, banco, Redis, HTTPS automático e backup diário.
Arquivos: `docker-compose.prod.yml`, `deploy/Caddyfile`, `.env.production.example`, `scripts/preparar-piloto.ts`.

## 1. O que contratar
- **Servidor (VPS) Linux** com Docker. Para o piloto (10 a 30 consultores), sugestão de partida: 2 vCPU, 4 GB de RAM, 40 GB de disco. Dá para aumentar depois.
- **Domínio** (ex.: `seudominio.com.br`). O site mestre fica no domínio principal, cada consultor em `nome.seudominio.com.br` e a gestão em `gestao.seudominio.com.br`.

## 2. DNS (no painel do domínio)
Três registros do tipo **A** apontando para o IP do servidor:

| Nome | Para quê |
|---|---|
| `@` | site mestre |
| `*` | links dos consultores e unidades |
| `gestao` | sistema de gestão |

O HTTPS é automático: o Caddy emite o certificado de cada subdomínio na primeira visita, **só** para endereços que existem (a landing confirma em `/api/tls-ok`). Não precisa de certificado curinga.

## 3. Subir
```bash
git clone https://github.com/Wendelldevelop/repositorioademicon.git && cd repositorioademicon
git checkout preparacao-piloto
cp .env.production.example .env.production   # preencha domínios e segredos (openssl rand -base64 48)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build postgres redis app
```
O app aplica as migrations sozinho ao iniciar.

## 4. Criar o banco do piloto (uma vez)
Estrutura real, **sem nenhum dado fictício**; recusa rodar se o banco já tiver dados.
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec \
  -e PILOTO_MARCA="Ademicon" -e PILOTO_UNIDADE="Nome da unidade" -e PILOTO_CIDADE="Cidade" -e PILOTO_UF="SP" \
  -e PILOTO_SUPERADMINS="voce@empresa.com" -e PILOTO_ADMIN="gestor@unidade.com" -e PILOTO_ADMIN_NOME="Nome" \
  app npx tsx scripts/preparar-piloto.ts
```
Ele imprime **uma vez** as senhas provisórias e a `LANDING_SERVICE_API_KEY`. Coloque a chave no `.env.production` e suba o resto:
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## 5. Conferir
- `https://gestao.seudominio.com.br/api/v1/health` → `database: ok`.
- `https://seudominio.com.br` abre o site mestre.
- Cadastre um consultor em **Super Admin → Colaboradores** e abra o link dele.
- A tela de login **não** pode mostrar "Contas de demonstração" (some com `APP_ENV=production`).
- O sistema **não sobe** em produção com `localhost` nos endereços ou sem `SESSION_SECRET` — de propósito.

## 6. Backup
O serviço `backup` faz `pg_dump` diário em `./backups` e guarda 14 dias. **Copie para fora do servidor** (outro provedor ou drive), senão um problema no disco leva banco e backup juntos.
Restaurar: `pg_restore -h <host> -U prospect -d prospect --clean arquivo.dump`.

## 7. Monitoramento
Cadastre `https://gestao.seudominio.com.br/api/v1/health` num monitor de disponibilidade (ex.: UptimeRobot, gratuito) com alerta por e-mail/WhatsApp. Assim, se cair, vocês sabem antes do cliente.

## Atualizar
```bash
git pull && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
