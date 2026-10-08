# Configurar IA: treinamento e reuniões no Google Agenda

Menu **Configurar IA** (consultor). A gestão abre a IA de qualquer consultor por `/configurar-ia?c=<id>`.

## 1. Perfil da IA
Nome do assistente, apresentação, estilo e emojis. Vale com "Usar IA personalizada" marcado. A apresentação sempre diz que é um assistente virtual.

## 2. Treinar a IA
- Texto livre de como o consultor trabalha, por exemplo: "sou um corretor extrovertido, gosto de agendar reuniões…". Até 2.000 caracteres, com sugestões prontas para clicar.
- O texto entra nas instruções da IA. **As regras da empresa e o supervisor têm prioridade**: a IA não promete contemplação, não inventa valores e não esconde que é IA.
- **Testar a IA:** um chat de teste na própria tela que usa o texto antes de salvar. Não envia nada a ninguém e não marca reunião.

## 3. Agenda e reuniões
- **Preferências:**
  - a IA pode ou não marcar reuniões;
  - tipo: online (Google Meet), ligação ou presencial, com endereço;
  - duração;
  - antecedência mínima;
  - dias e horário em que aceita reunião.
- **Google Agenda:** o consultor clica em **Conectar Google Agenda** e autoriza.

### Como a IA marca
1. O cliente fala em marcar ("podemos marcar uma reunião?", "dá pra conversar amanhã?").
2. A IA oferece **3 horários livres**:
   - só dentro do expediente configurado;
   - fora do que está ocupado no Google Agenda e das reuniões já marcadas no sistema.
3. O cliente escolhe a opção ("a segunda opção", "2", "a primeira") ou diz um horário ("amanhã às 16h", "sexta 10h30").
   - Se o horário estiver ocupado, a IA avisa e oferece outros.
4. A reunião é marcada:
   - **evento no Google Agenda** do consultor, com link do **Google Meet** se for online e convite para o e-mail do cliente, se houver;
   - **tarefa** de reunião no sistema;
   - **aviso** ao consultor;
   - **confirmação automática ao cliente** na mesma conversa, com dia, hora e link.

### Pelo Maestro (consultor)
No campo **Maestro** do menu lateral, ou com Ctrl+K:
- "**agenda com Maria Souza amanhã às 15h**": marca e manda a confirmação ao cliente;
- "**marca com Carlos sexta 10h**": se estiver ocupado, mostra os horários livres;
- "**minhas reuniões**": lista as próximas reuniões.

### Sem Google Agenda conectado
A reunião continua sendo marcada: vira tarefa, o cliente recebe a confirmação, e o consultor é avisado para conectar a agenda.

## Configuração no Google Cloud (uma vez, pela equipe da plataforma)
1. Em console.cloud.google.com, crie um projeto e ative a **Google Calendar API**.
2. Em **Tela de consentimento OAuth**:
   - tipo **Externo**;
   - nome do app, e-mail de suporte e a URL da Política de Privacidade (`/privacidade`);
   - escopos: `openid`, `email`, `.../auth/calendar.events` e `.../auth/calendar.freebusy`.
   - No modo **Teste**, só e-mails cadastrados como testadores conectam (até 100). Para todos, publique o app; o Google pede a verificação dos escopos de agenda.
3. Em **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**:
   - URI de redirecionamento autorizado: `https://<gestão>/api/v1/google/calendar/callback`.
4. No sistema, em **Super Admin → Configurar APIs → Google Agenda**, cole o **Client ID** e o **Client Secret**.
5. O fuso usado é `APP_TIMEZONE`, por padrão `America/Sao_Paulo`.

## Testes
- `tests/unit/when.test.ts`: datas e horas em português, fuso e escolha de opção.
- `tests/integration/agenda-ia.test.ts` (simula o Google):
  - treinamento entrando nas instruções da IA;
  - oferta de horários respeitando o que está ocupado;
  - escolha do horário criando o evento com Meet, a tarefa e a confirmação;
  - horário ocupado;
  - Maestro;
  - funcionamento sem Google Agenda.
