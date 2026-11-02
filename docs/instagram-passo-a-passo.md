# Instagram: passo a passo da configuração (do zero)

Com isto feito, cada consultor conecta o próprio Instagram em **Meu perfil → Conectar Instagram**. As mensagens do Direct da conta dele viram leads dele no Inbox, a IA responde, e os comentários com palavra-chave viram mensagem no Direct (`docs/instagram-comentarios.md`).

Quem faz: alguém com acesso de administrador ao Meta for Developers (a conta da Stack Solution) e ao painel do Super Admin.

## 1. Antes de começar
- **Conta profissional:** cada consultor precisa de Instagram **Comercial** ou **Criador de conteúdo** (Instagram → Configurações → Tipo de conta e ferramentas).
- **Política de privacidade:** a Meta exige um link público de política de privacidade para criar o app (pode ser uma página no site da Stack Solution).

## 2. Criar o app na Meta
1. Acesse https://developers.facebook.com/apps e clique em **Criar app**.
2. Caso de uso: **Gerenciar mensagens e conteúdo no Instagram** (API do Instagram com Login do Instagram).
3. Tipo: **Empresa**. Dê um nome (ex.: "Prospect AI") e ligue ao portfólio empresarial da Stack Solution, se houver.
4. Em **Configurações do app → Básico**, preencha o link da política de privacidade e salve.

## 3. Chaves do app → Configurar APIs
No app, abra **API do Instagram → Configuração da API com login do Instagram**:
1. Copie o **ID do app do Instagram** e o **Chave secreta do app do Instagram**. Atenção: são os do Instagram, diferentes do ID/segredo do app da Meta no topo da página.
2. Na plataforma (Super Admin) → **Configurar APIs → Instagram Direct**, cole em:
   - **ID do app do Instagram (login dos consultores)**
   - **Segredo do app do Instagram**
3. Em **Configurar APIs → Meta Ads (Facebook e Instagram)**, preencha **Token de verificação do webhook** com uma frase que você inventar (ex.: `prospect-ig-2026`). Guarde: ela vai no passo 5.

Os campos "Token da página" e "ID da conta profissional" são para uma conta única da unidade e **não** são necessários para a conexão por consultor.

## 4. Endereço de retorno do login
Ainda em **Configuração da API com login do Instagram → Configurar login empresarial do Instagram**, em **URIs de redirecionamento do OAuth**, adicione exatamente:

```
https://stacksolution.com.br/api/v1/instagram/callback
```

## 5. Webhook (para as mensagens chegarem)
Na mesma página, em **Configurar webhooks**:
1. **URL de retorno de chamada:** `https://stacksolution.com.br/api/v1/webhooks/instagram`
2. **Verificar token:** a mesma frase do passo 3.
3. Clique em **Verificar e salvar**. Se falhar, a tentativa aparece em **Integrações → Webhooks** na plataforma, dizendo se o token bateu.
4. Assine os campos **`messages`** e **`comments`**.

## 6. Liberar os consultores (app em desenvolvimento)
Enquanto o app não passa pela Análise da Meta, só contas **testadoras** conseguem conectar:
1. No app: **Funções do app → Funções → Adicionar pessoas → Testador do Instagram**, e informe o @ de cada consultor.
2. Cada consultor aceita: Instagram → Configurações → **Apps e sites → Convites de testador** → Aceitar (é o módulo C22 do treinamento).
3. Depois, o consultor vai em **Meu perfil → Instagram → Conectar Instagram**, entra com a conta e autoriza.

## 7. Liberar para qualquer conta (produção)
Para não depender de convite de testador:
1. Faça a **verificação da empresa** no portfólio empresarial da Meta.
2. Em **Análise do app**, peça **Acesso avançado** para `instagram_business_basic`, `instagram_business_manage_messages` e `instagram_business_manage_comments`. A Meta pede um vídeo curto mostrando o uso (conectar a conta, receber uma DM no Inbox, responder).
3. Com a aprovação, coloque o app em modo **Ao vivo**.

## 8. Testar
1. Com um consultor conectado, mande uma DM de outra conta para o Instagram dele.
2. Em segundos a conversa aparece no Inbox (canal Instagram) como lead dele, e a IA responde.
3. Se não chegar: confira em **Integrações → Webhooks** se a Meta está chamando o endereço, e se o campo `messages` está assinado.

## Regras da Meta que o sistema já segue
- Resposta livre só até 24 h depois da última mensagem do cliente.
- Comentário com palavra-chave: uma mensagem no Direct por comentário, em até 7 dias.
