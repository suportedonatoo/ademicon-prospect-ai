# Provisionamento de PJs (landing + acesso) — roteiro para automatizar

> Status: **manual hoje** (tela Distribuição → PJs). A equipe pretende automatizar este processo
> para oferecer como serviço às PJs. Este documento reúne o que já existe e o que falta.

## Modelo

- **Um único serviço de landing** (`apps/landing`) atende todas as PJs. A PJ é identificada pelo
  subdomínio acessado: `https://<subdominio>.<DOMINIO>` → landing mestre + dados daquela PJ.
- **Cada PJ tem o próprio link**, gerado a partir do subdomínio cadastrado. Não existe site nem
  servidor por PJ.
- Leads que chegam pelo link da PJ ficam **nessa PJ** (distribuídos entre os consultores dela).
- Cada PJ acessa a plataforma de gestão com **login próprio** (perfil Gestor de PJ), vendo só os
  próprios leads.

## Feito UMA vez (infraestrutura, vale para todas as PJs)

| Item | Exemplo | Observação |
|---|---|---|
| Domínio | `consorcio-suaempresa.com.br` | |
| DNS curinga | `*.consorcio-suaempresa.com.br` → servidor | Subdomínio novo funciona sem mexer em DNS |
| Certificado HTTPS curinga | `*.consorcio-suaempresa.com.br` | Let's Encrypt (desafio DNS-01) |
| Servidor | `docker compose --profile full up -d` | Sobe gestão, landing, worker, Postgres, Redis |
| Variáveis (landing) | `LANDING_BASE_DOMAIN=consorcio-suaempresa.com.br` · `GESTAO_API_URL` · `LANDING_SERVICE_API_KEY` · `GESTAO_PUBLIC_URL` · `LANDING_LOGO_URL` | |
| Variáveis (gestão) | `LANDING_URL_TEMPLATE=https://{subdomain}.consorcio-suaempresa.com.br` · `LANDING_SERVICE_API_KEY` (mesmo valor) | |

## Feito POR PJ (hoje manual — alvo da automação)

1. **Cadastrar/editar a PJ** (Distribuição → PJs): código, nome, cidade, cidades atendidas, região.
2. **Landing**: subdomínio, WhatsApp e telefone **reais** da unidade, endereço, título/subtítulo,
   marcar "Landing no ar".
3. **Acesso**: criar o usuário Gestor de PJ (Admin → Usuários, perfil "Gestor de PJ", PJ vinculada)
   e os consultores da unidade (Distribuição → Consultores + usuário com perfil Consultor).
4. **Divulgar o link** da PJ (Aquisição → Landings das PJs, coluna Endereço) para uso nos anúncios
   Google Ads / Meta.

## O que já existe para automatizar

- API REST autenticada por API key (`Authorization: Bearer pk_…`), com OpenAPI em `/api/v1/openapi.json`:
  - `POST /api/v1/pjs` · `PATCH /api/v1/pjs/{id}` — cria/edita PJ, inclusive `subdomain`,
    `landingActive`, `landingTitle`, `landingSubtitle`, `phone`, `whatsapp`, `address`
    (valida formato e unicidade do subdomínio).
  - `POST /api/v1/consultants` — consultores.
  - `POST /api/v1/users` — usuários (o gestor da PJ).
- Criar a API key em Integrações → API com as permissões necessárias (`pj.manage`,
  `consultant.manage`, `user.manage`).

## Ideias pendentes (combinadas, ainda não feitas)

- [ ] Botão **"Copiar link"** por PJ em Aquisição → Landings das PJs.
- [ ] Botão **"Copiar link para Google Ads"** (com parâmetros de rastreamento) por PJ.
- [ ] **Domínio próprio por PJ** (ex.: `consorciojundiai.com.br`) além do subdomínio.
- [ ] Assistente "Nova unidade" que faz os passos 1–4 de uma vez (PJ + landing + gestor + convite
      por e-mail), e/ou endpoint único de provisionamento para a automação externa.
- [ ] Envio automático do link e do acesso para a PJ ao concluir o cadastro.
