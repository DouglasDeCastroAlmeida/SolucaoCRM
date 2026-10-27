# Prova em produção — subprojeto 1 (T-047, T-048)

Data: 27/10/2026 (UTC). Deploy pelo fluxo "Deploy em produção" (workflow_dispatch, run 40432290120), SHA `b4380118051b441a0b22a182c7adb56a39e07cf9`, só com a marca padrão: gancho de e-mail e HTTPS sob demanda **desligados** (sem `AUTH_HOOK_SECRET`, `TLS_ASK_TOKEN` nem `marcas.caddy` na produção). Sem backup manual antes, por decisão do dono (a instalação ainda não tem dados; o backup diário das 03:17 UTC segue valendo).

## Medido depois do deploy

| Conferência | Resultado |
|---|---|
| Workflow de deploy | `success` |
| `https://app.corretora.io/` | 200 |
| `https://app.corretora.io/app` | 307 |
| Sonda `producao` (`tests/infra/vps/sondas.sh producao`) | AC-002.1 a AC-002.4 PASS: 200, 307, `/api/v1/health` healthy, Studio não exposto, voice-agent parado |
| Login de produção | título `Entrar · DeskcommCRM` (mesma aparência de antes) |
| Banco de produção (migrations 0717 e 0718) | 1 marca (a padrão, `is_default`), 1 organização de 1 ligada a ela, função `fn_copiar_pacote_para_org` presente |
| Serviços do app | app, worker, scheduler, caddy, redis, srh, waha de pé e saudáveis; os serviços do Supabase seguem de pé há 3 dias |
| Caddy | recriado (v2.11.7), config validada antes do deploy |
| Homologação e hosts de teste | `hml` 200/307; `marca-a.corretora.io/login` 200 |

## Observações

- O reinício do Caddy é compartilhado com os demais sites da VPS e dura segundos; todos responderam 200 logo depois.
- Rollback pelo `deploy.sh` não foi necessário.
