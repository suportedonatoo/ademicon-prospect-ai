# Eventos de domínio

`publish(orgId, name, payload)` (`src/lib/events.ts`) grava um `DomainEvent` e chama os assinantes em processo (`src/modules/subscribers.ts`). Eventos críticos para receita usam **outbox** (`src/lib/outbox.ts`): gravados na mesma transação e despachados depois, com retry e backoff.

| Evento | Publicado por | Principais assinantes |
|---|---|---|
| `lead.created` | LeadEngine | notificação a gestores, webhooks, automações |
| `lead.updated` / `lead.merged` / `lead.scored` | Leads, dedup, scoring | Lead Intelligence (recalcular) |
| `lead.qualified` | processLead | automações |
| `lead.assigned` / `lead.unassigned` | Routing | Lead Intelligence, **playbook do segmento** |
| `lead.unattended` | Follow-up engine | automações |
| `lead.reactivated` | Lead Intelligence (volta de nutrição/reativação) | notificação ao consultor, playbook de reativação |
| `simulation.created` | Simulador / landing | BuyingSignal `simulation_requested` |
| `conversation.created` / `conversation.message_received` / `conversation.message_sent` | Conversas, Maestro, mensageria | IntentEvents + BuyingSignals, tempo real (SSE), NBA |
| `conversation.handoff` / `ai.handoff` | Maestro, takeover | tempo real, NBA |
| `conversation.number_switched` | number-pool (backup) | tempo real, auditoria da conversa |
| `opportunity.created` / `opportunity.stage_changed` | Oportunidades | saúde da oportunidade, NBA |
| `opportunity.closed` | Oportunidades (**outbox**) | cancela playbooks, NBA |
| `opportunity.stalled` | Opportunity Intelligence | notificação ao consultor |
| `campaign.started` / `campaign.paused` | Campanhas | webhooks |
| `ai.execution_started` / `ai.execution_completed` / `ai.knowledge_gap` | Maestro | observabilidade |
| `consent.created` / `consent.revoked` | LGPD | cancela playbooks |
| `task.overdue` | Tarefas | notificação, NBA |
| `integration.error` | Mensageria/providers | notificação a admins |
| `sla.breached` | SLA Engine | automações, webhooks |
| `playbook.executed` | Playbooks | webhooks |

Todos os eventos também alimentam **webhooks de saída** (assinados com HMAC) e o **motor de automações** (gatilho = nome do evento).

## Auditoria (ações)

Além dos eventos, ações sensíveis vão para `AuditLog` (quem, organização, ação, entidade, antes/depois quando aplicável, IP, user agent). V2 adiciona: `nba.resolved`, `duplicate.resolved`, `playbook.changed`, `prompt.changed`, `ai.eval_run`, `experiment.changed`, `flag.changed`, `notification.preferences_changed`, `notification.clicked`, `device.connected`, `device.revoked`, `deep_link.created`, `deep_link.used`, `push.sent`, `push.failed`, `conversation.takeover|ai_paused|ai_resumed|transferred|closed`, `recovery.executed`, `insight.changed`. Mudanças de configuração crítica também ficam em `ConfigHistory` (antes/depois).
