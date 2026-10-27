# Prova em produção — mudança 007 (agenda: lembretes e confirmação pelo cliente)

Data: 27/10/2026 (UTC). Versão implantada: `45356561` (merge do PR #18), a mesma da homologação.
Deploy: workflow "Deploy em produção" (disparo manual autorizado pelo dono), resultado `success`.

| Verificação | Resultado |
|---|---|
| `https://app.corretora.io/` | 200 |
| `https://app.corretora.io/app` | 307 |
| Colunas novas (migration 0719) | 3 de 3 existem |
| Tipos de agendamento com a confirmação do cliente ligada | 0 (nenhum tipo existente mudou) |

Saída bruta da sonda: `agenda-tipos-inalterados.txt` (`bash tests/infra/vps/sondas.sh agenda-tipos-inalterados`).

## Pendente
- T-024: jornada pela tela na homologação com WhatsApp real. Roteiro: `roteiro-da-verificacao-pelo-dono.md`.
