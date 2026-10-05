# WhatsApp por consultor: números, Inbox unificado e backup

## Números
- Cada consultor tem **de 2 a 6 números** (`WhatsAppNumber.consultantId`). Ordem (`priority`): 0 = principal, os demais = backup.
- Números sem dono = números da operação (bots/equipe). O número pessoal de um consultor nunca é usado para outro atendimento.
- Cadastro: WhatsApp Hub → Números (agrupado por consultor; aviso de quem tem menos de 2). Telefone do exterior: use `+DDI`.

## Inbox unificado
Todas as conversas de todos os números aparecem no mesmo Inbox, com o nome do número em cada conversa e filtro
"Todos os números". O consultor vê os números e conversas dele; a gestão vê todos (gestor de PJ: da PJ + operação).

## Backup (failover) — `src/modules/whatsapp/number-pool.ts`
- Número **caiu** (desconectado, erro no provedor, pausado): as conversas abertas passam para o próximo número
  saudável do MESMO consultor, com nota de sistema na conversa, e as mensagens na fila são reenviadas.
- Falha no envio: o número é marcado `ERROR` (`lastError`) e a mensagem sai pelo backup (uma tentativa).
- Número no **limite diário não troca** de número (a mensagem fica na fila): não há rodízio para burlar limites.
- Varredura periódica no job `operations.scan` (`scanNumbers`). Consultor é notificado; sem backup, a gestão também.
- Se o lead responder por outro número do consultor, a conversa passa a seguir por ele.

## IA de cada consultor
Perfil → "Minha IA" (`Consultant.aiProfile`): nome do assistente, apresentação, estilo e emojis. Mesmas regras,
Knowledge Base e supervisor. A apresentação **precisa** se identificar como assistente virtual (validado).

## Perfil
`/perfil` — números (principal/backup, status), IA, leads recebidos no mês × média da PJ (divisão igual).
Gestão abre o perfil de qualquer consultor em Distribuição → Consultores.
