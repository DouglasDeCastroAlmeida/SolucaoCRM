#!/usr/bin/env bash
# {AC-008.5} 05-cron: só instala linhas de scripts que existem; não apaga linhas alheias
# quando o crontab falha por outro motivo; idempotente.
set -uo pipefail
source "$(dirname "$0")/_admin-lib.sh"
CRON="$ADMIN/05-cron.sh"
admin_ambiente; trap 'rm -rf "$T"' EXIT
export CRM_DEPLOY_DIR="$T/crm-deploy"; mkdir -p "$CRM_DEPLOY_DIR"
export TAB="$T/tab"
fake crontab 'if [ "$3" = -l ]; then
  if [ -n "${FAKE_CRON_ERRO:-}" ]; then echo "crontab: cannot open spool" >&2; exit 1; fi
  if [ -f "$TAB" ]; then cat "$TAB"; else echo "no crontab for deploy" >&2; exit 1; fi
else echo ESCREVEU >> "$CHAMADAS"; cat > "$TAB"; fi'

echo "AC-008.5: alvo ausente -> pula com aviso"
: > "$CRM_DEPLOY_DIR/backup-externo.sh"
bash "$CRON" >"$T/o" 2>&1; rc=$?
afirma "sai 0 (sem crontab prévio)" test "$rc" -eq 0
afirma "instalou o backup" grep -q 'backup-externo.sh' "$TAB"
afirma "não instalou medir-memoria (ausente)" bash -c "! grep -q medir-memoria '$TAB'"
afirma "avisa que pulou medir-memoria" grep -qi 'medir-memoria.*\(ausente\|pul\)' "$T/o"

echo "AC-008.5: com os dois alvos e linha alheia -> idempotente"
: > "$CRM_DEPLOY_DIR/medir-memoria.sh"; echo '0 1 * * * /outra' > "$TAB"
bash "$CRON" >"$T/o" 2>&1; cp "$TAB" "$T/tab1"; bash "$CRON" >"$T/o" 2>&1
afirma "mantém a linha alheia" grep -q '/outra' "$TAB"
afirma "duas linhas marcadas" test "$(grep -c '# crm-solucao' "$TAB")" -eq 2
afirma "segunda execução não muda nada" cmp -s "$TAB" "$T/tab1"
afirma "backup às 03:17" grep -q '^17 3 \* \* \* /opt\|^17 3 \* \* \* '"$CRM_DEPLOY_DIR"'/backup-externo.sh' "$TAB"

echo "AC-008.5: crontab -l falha por outro motivo -> aborta sem reescrever"
cp "$TAB" "$T/tab2"; : > "$CHAMADAS"
FAKE_CRON_ERRO=1 bash "$CRON" >"$T/o" 2>&1; rc=$?
afirma "sai != 0" test "$rc" -ne 0
afirma "não reescreveu o crontab" bash -c "! grep -q ESCREVEU '$CHAMADAS'"
afirma "crontab intacto" cmp -s "$TAB" "$T/tab2"

fim admin-cron
