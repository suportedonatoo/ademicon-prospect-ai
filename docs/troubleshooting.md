# Troubleshooting

| Sintoma | Causa provável | Como resolver |
|---|---|---|
| `Can't reach database server at localhost:5434` | Docker parado | Abra o Docker Desktop e rode `npm run db:up` |
| Login bloqueado após várias tentativas | Rate limit (10 tentativas / 15 min por conta) | Aguarde; em dev, reiniciar o servidor zera o contador em memória |
| Notificações não aparecem no computador | Permissão do navegador | Notificações e dispositivos → **Ativar notificações no computador**; se "Bloqueadas", libere nas configurações do site |
| "Push não configurado no servidor" | Sem VAPID | `npx web-push generate-vapid-keys` e preencha `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` no `.env` |
| Push não chega no iPhone | iOS só entrega push para app instalado | Safari → Compartilhar → Adicionar à Tela de Início → abrir pelo ícone → ativar push (iOS 16.4+) |
| Push parou de chegar num aparelho | Inscrição expirada (404/410) → dispositivo revogado automaticamente | Ative o push de novo no aparelho |
| Link "Enviar para meu celular" diz "expirado" | Validade de 10 min | Gere um novo; ajuste `DEEP_LINK_TTL_MINUTES` (1–60) |
| Link abre "Acesso não permitido" | Logado com outro usuário no celular | Entre com a mesma conta que gerou o link |
| Extensão mostra "!" no ícone | Token revogado, plataforma fora do ar ou sem permissão de domínio | Reconecte (novo token) e confirme o endereço |
| Tempo real não atualiza (sino/inbox) | Proxy fazendo buffer do SSE | Desative buffering para `/api/v1/realtime/stream` (cabeçalho `X-Accel-Buffering: no` já é enviado); em várias instâncias configure `REDIS_URL` |
| Jobs recorrentes não rodam | `QUEUE_DRIVER=bullmq` sem worker | Rode `npm run worker` (ou use `inline` em dev) |
| Muitos "sla.breach" no seed | Dados de demonstração com datas antigas | Esperado: os leads do seed foram distribuídos há dias |
| ROI/ROAS aparecem como "—" | Percentual de receita não configurado | Defina `roi.revenuePctOfWonValue` nas configurações da organização (fórmula em `docs/revenue-intelligence.md`) |
| AI Control Center sem custo | Provider mock (sem tokens) | Esperado; com `AI_PROVIDER=anthropic` o custo é estimado |
| Build quebra o `next dev` rodando | Mesmo diretório `.next` | Use `NEXT_DIST_DIR=.next-build npm run build` |
| `prisma migrate dev` falha "non-interactive" | Terminal não interativo | Gere o SQL com `prisma migrate diff` e aplique com `npm run db:deploy` |

## Validar push manualmente

1. `.env` com as chaves VAPID; reinicie o servidor.
2. Abra a plataforma no celular (mesma rede: `http://<IP-do-PC>:3500`; em produção use HTTPS — push exige origem segura, exceto `localhost`).
3. Notificações e dispositivos → Ativar push aqui.
4. No computador: abra um lead → **Enviar para meu celular** → escolha o aparelho.
5. Toque na notificação: o lead abre (com login, se necessário).

## Diagnóstico por IDs

Toda resposta da API traz `x-request-id` e `x-trace-id`. Erros inesperados devolvem `errorId` (igual ao `x-request-id`) — procure-o no log (`api.unhandled`).
