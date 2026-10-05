# LGPD e privacidade

A plataforma foi desenhada para operar dentro da LGPD (Lei 13.709/2018). Este documento descreve os mecanismos técnicos; a definição de bases legais, encarregado (DPO) e política de privacidade é responsabilidade da operação e do jurídico.

## Entidades

| Entidade | Uso |
|---|---|
| `Consent` | Consentimento por canal (WhatsApp, e-mail) com finalidade, texto apresentado, versão da política, origem, IP e data. Status `GRANTED`/`REVOKED`. |
| `CommunicationPreference` | Canais permitidos, melhor horário, frequência. |
| `PrivacyEvent` | Linha do tempo imutável: consentimento concedido/revogado, opt-out, preferências, solicitações, anonimização. |
| `DataRequest` | Solicitações do titular: `ACCESS`, `CORRECTION`, `DELETION`, `PORTABILITY`, `OPPOSITION`, com prazo (padrão 15 dias, configurável). |

## Consentimento e contato proativo

- Formulários públicos (landing/simulador) exibem checkbox de opt-in **desmarcado por padrão**, com texto e link para a política; o texto e a versão são gravados junto do consentimento.
- Quem inicia a conversa pelo WhatsApp é respondido no mesmo canal (finalidade: atendimento); isso não autoriza campanhas.
- `canContactProactively` bloqueia contato quando: há opt-out, lead bloqueado, sem telefone, **sem opt-in** para o canal, preferência contrária, **horário de silêncio** (21h–8h, America/Sao_Paulo) ou **limite semanal** atingido (padrão 3). Campanhas e follow-ups passam por essa checagem.

## Opt-out

"Não quero mais receber mensagens" (e variações) na conversa → opt-out imediato: consentimentos revogados, IA pausada, `PrivacyEvent`, confirmação ao titular e nenhuma mensagem proativa posterior. Também pode ser feito pelo consultor na ficha do lead.

## Minimização

- Memória da IA guarda apenas slots de negócio (produto, valor, cidade, prazo, objeções, preferências) — não a conversa inteira.
- Logs com redação de dados pessoais; conteúdo de conversas fora dos logs.
- Prospecção de empresas apenas com dados públicos/autorizados de pessoa jurídica.

## Direitos do titular

Tela **LGPD** (`privacy.read` / `privacy.manage`): abertura e acompanhamento de solicitações com prazo. Concluir uma solicitação de **exclusão** anonimiza o lead: nome substituído, contatos e identificadores removidos, memória e resumos apagados, conteúdo das mensagens substituído, lead bloqueado e marcado como excluído — preservando apenas dados agregados para métricas. Tudo auditado.

## Retenção

Recomendado definir com o jurídico um prazo de retenção para leads sem relacionamento (ex.: anonimizar após N meses sem interação) e implementar como automação agendada.
