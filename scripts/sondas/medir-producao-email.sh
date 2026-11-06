#!/usr/bin/env bash
# Mudança 005 (T-045, AC-009.4): mede a produção pela VPS e imprime um JSON para a sonda-producao-email.mjs.
# SÓ LÊ: SELECTs no banco e `grep -c` no log do worker. Não imprime segredo.
# Uso: bash scripts/sondas/medir-producao-email.sh <usuario@ip> [desde] > medido.json
#   desde = janela do log do worker, no formato do `docker logs --since` (padrão 24h; use o horário do deploy).
set -euo pipefail
ALVO="${1:?uso: medir-producao-email.sh usuario@ip [desde]}"
DESDE="${2:-24h}"
[[ "$DESDE" =~ ^[0-9A-Za-z:.+-]+$ ]] || { echo "janela invalida" >&2; exit 2; }

PSQL="docker exec -i crm-prod-supabase-db-1 psql -U postgres -d postgres -At"

# O Postgres resolve o nome da tabela ANTES de executar o CASE, então um `case when to_regclass(...)`
# não basta: antes da migration 0727 (ainda não implantada) a tabela não existe e o SELECT inteiro erra.
# Por isso a existência é perguntada à parte, e a contagem só entra no SQL quando a tabela existe.
existe() {
  local r
  r=$(ssh -o BatchMode=yes "$ALVO" "$PSQL" <<<"select to_regclass('public.$1') is not null")
  [[ "$r" == "t" ]]
}
contagem() { if existe "$1"; then echo "(select count(*) from public.$1)"; else echo "0"; fi; }
IGNORADOS=$(contagem email_ignorados)
REMETENTES=$(contagem email_remetentes_ignorados)

SQL="select json_build_object(
  'caixas_email', (select count(*) from public.channel_sessions where provider = 'email'),
  'canais_ativos_nao_email', (select count(*) from public.channel_sessions where archived_at is null and provider <> 'email'),
  'organizacoes_total', (select count(*) from public.organizations),
  'conversas_email', (select count(*) from public.conversations where channel = 'email'),
  'ignorados', $IGNORADOS,
  'remetentes_ignorados', $REMETENTES
)::text"

BANCO=$(ssh -o BatchMode=yes "$ALVO" "$PSQL" <<<"$SQL")
CONEXOES=$(ssh -o BatchMode=yes "$ALVO" "docker logs --since '$DESDE' crm-prod-worker-1 2>&1 | grep -ciE 'imap|email_leitura|ImapFlow' || true")
CONEXOES=$(printf '%s' "$CONEXOES" | tr -dc '0-9')
CONEXOES="${CONEXOES:-0}"

printf '%s' "$BANCO" | CONEXOES="$CONEXOES" node -e '
const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
d.conexoes_de_email_no_worker = Number(process.env.CONEXOES);
console.log(JSON.stringify(d));
'
