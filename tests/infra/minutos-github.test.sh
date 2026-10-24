#!/usr/bin/env bash
# {AC-004.5} minutos-github.sh: registra o consumo de minutos do Actions e compara com a cota de 2.000.
set -uo pipefail
source "$(dirname "$0")/_admin-lib.sh"
MG="$REPO_ROOT/infra/solucao/minutos-github.sh"
admin_ambiente; trap 'rm -rf "$T"' EXIT
export GH_USER=dono-teste
# gh falso: resposta em $GH_RESP (arquivo), código em $GH_RC; registra a chamada
fake gh 'echo "gh $*" >> "$CHAMADAS"; [ -f "$GH_RESP" ] && cat "$GH_RESP"; exit "${GH_RC:-0}"'
export GH_RESP="$T/resp.json"

echo "uso baixo"
echo '{"total_minutes_used": 240, "included_minutes": 2000}' > "$GH_RESP"
bash "$MG" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "mostra minutos usados" grep -q '240' "$T/o"
afirma "mostra 12% da cota" grep -q '12%' "$T/o"
afirma "sem aviso abaixo de 80%" bash -c "! grep -qi 'AVISO' '$T/o'"
afirma "consultou a API de billing do usuário" grep -q 'gh api .*users/dono-teste/settings/billing/actions' "$CHAMADAS"

echo "uso alto"
echo '{"total_minutes_used": 1700, "included_minutes": 2000}' > "$GH_RESP"
bash "$MG" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "avisa a partir de 80%" grep -q 'AVISO' "$T/o"
afirma "mostra 85%" grep -q '85%' "$T/o"

echo "cota padrão quando a API não informa"
echo '{"total_minutes_used": 100}' > "$GH_RESP"
bash "$MG" >"$T/o" 2>&1
afirma "usa 2000" grep -q '2000' "$T/o"

echo "sem permissão"
echo '{"message":"Resource not accessible","status":"403"}' > "$GH_RESP"; export GH_RC=1
bash "$MG" >"$T/o" 2>&1; rc=$?
afirma "não quebra (sai 0)" test "$rc" -eq 0
afirma "explica a falta de permissão" grep -qi 'permiss' "$T/o"
afirma "diz como resolver (escopo)" grep -q 'gh auth refresh' "$T/o"
unset GH_RC

echo "dry-run"
: > "$CHAMADAS"
bash "$MG" --dry-run >"$T/o" 2>&1; rc=$?
afirma "dry-run sai 0" test "$rc" -eq 0
afirma "dry-run não chama gh" bash -c "! grep -q '^gh' '$CHAMADAS'"

echo "grava registro"
echo '{"total_minutes_used": 50, "included_minutes": 2000}' > "$GH_RESP"
SAIDA="$T/reg.txt" bash "$MG" >/dev/null 2>&1
afirma "SAIDA recebe o relatório" grep -q '50' "$T/reg.txt"
fim minutos-github
