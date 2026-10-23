#!/usr/bin/env bash
# {AC-008.5} alerta.sh: grava linha datada, mascara segredo, trunca em 1000 linhas,
# gancho que falha não derruba, sempre sai 0, mensagem limitada a 500 caracteres.
set -uo pipefail
source "$(dirname "$0")/_admin-lib.sh"
AL="$REPO_ROOT/infra/solucao/alerta.sh"
admin_ambiente; trap 'rm -rf "$T"' EXIT
export DATA_DIR="$T/dados" LOG="$T/dados/alertas.log"
fake logger 'echo "logger $*" >> "$CHAMADAS"'

echo "alerta grava a linha"
bash "$AL" "memoria baixa" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "cria DATA_DIR e log com data ISO + mensagem" grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z memoria baixa$' "$LOG"
afirma "chamou logger -t crm-alerta" grep -q 'logger -t crm-alerta' "$CHAMADAS"
echo "via stdin" | bash "$AL" >/dev/null 2>&1
afirma "aceita stdin quando \$1 vazio" grep -q ' via stdin$' "$LOG"

echo "segredo mascarado"
bash "$AL" "falha TOKEN=SEGREDO_FALSO_789 e senha: x" >"$T/o" 2>&1
afirma "segredo fora do log" bash -c "! grep -q SEGREDO_FALSO_789 '$LOG'"
afirma "segredo fora da saída" bash -c "! grep -q SEGREDO_FALSO_789 '$T/o'"
afirma "segredo fora do logger" bash -c "! grep -q SEGREDO_FALSO_789 '$CHAMADAS'"
afirma "mantém o nome da variável" grep -q 'TOKEN=' "$LOG"

echo "mensagem longa e quebras"
longa="$(printf 'a%.0s' $(seq 1 800))"
bash "$AL" "$longa" >/dev/null 2>&1
afirma "linha cortada em 500 caracteres de mensagem" bash -c "tail -1 '$LOG' | awk '{ exit !(length(\$2) == 500) }'"
n0="$(wc -l < "$LOG")"
bash "$AL" $'linha1\nlinha2\rfim' >/dev/null 2>&1
afirma "quebra de linha não injeta linha" test "$(wc -l < "$LOG")" -eq $((n0 + 1))

echo "trunca em 1000 linhas"
for i in $(seq 1 1100); do echo "2026-01-01T00:00:00Z antiga $i"; done > "$LOG"
bash "$AL" "ultima" >/dev/null 2>&1
afirma "1000 linhas" test "$(wc -l < "$LOG")" -eq 1000
afirma "a última é a nova" bash -c "tail -1 '$LOG' | grep -q ' ultima$'"
afirma "descartou as mais velhas" bash -c "! grep -q 'antiga 1\$' '$LOG'"

echo "gancho ALERTA_EXTRA_CMD"
fake extra 'cat > "$T_EXTRA"; exit 7'
export T_EXTRA="$T/extra.out"
ALERTA_EXTRA_CMD="$T/bin/extra" bash "$AL" "com gancho" >/dev/null 2>&1; rc=$?
afirma "gancho falhando não derruba (sai 0)" test "$rc" -eq 0
afirma "gancho recebeu a mensagem em stdin" grep -q 'com gancho' "$T_EXTRA"
afirma "alerta gravado mesmo assim" bash -c "tail -1 '$LOG' | grep -q ' com gancho\$'"
ALERTA_EXTRA_CMD="/nao/existe" bash "$AL" "gancho ausente" >/dev/null 2>&1; rc=$?
afirma "gancho inexistente sai 0" test "$rc" -eq 0


echo "AC-012.2: mascaramento reforçado"
: > "$LOG"; : > "$CHAMADAS"
JWT="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.assinaturaZZZ"
bash "$AL" "h Authorization: Bearer abc123SECRET fim" >/dev/null 2>&1
bash "$AL" "db postgres://u:pw123@h/db ok" >/dev/null 2>&1
bash "$AL" "aws_secret_access_key = zzz9 fim" >/dev/null 2>&1
bash "$AL" "senha=\"com espaco SEGREDO_Q\" fim" >/dev/null 2>&1
bash "$AL" "x ghp_abcdefghijklmnopqrstuvwxyz0123 y" >/dev/null 2>&1
bash "$AL" "x sk-abcdefghijklmnop_qrstuv-12 y" >/dev/null 2>&1
bash "$AL" "x AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQ y" >/dev/null 2>&1
bash "$AL" "x $JWT y" >/dev/null 2>&1
bash "$AL" "pub age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq ok" >/dev/null 2>&1
for s in abc123SECRET pw123 zzz9 SEGREDO_Q ghp_abcdefgh sk-abcdefghijklmnop AGE-SECRET-KEY-1QQQ assinaturaZZZ; do
  afirma "log sem $s" bash -c "! grep -q '$s' '$LOG'"
  afirma "logger sem $s" bash -c "! grep -q '$s' '$CHAMADAS'"
done
afirma "mantém usuário da URL" grep -q '://u:\*\*\*@h/db' "$LOG"
afirma "age1 (chave pública) não é mascarada" grep -q 'age1qqqq' "$LOG"
afirma "texto vizinho preservado" grep -q 'Authorization: \*\*\* fim' "$LOG"

echo "AC-012.2: symlink e permissões"
rm -rf "$T/d2"; mkdir "$T/d2"; : > "$T/alvo"; ln -s "$T/alvo" "$T/d2/alertas.log"
: > "$CHAMADAS"
DATA_DIR="$T/d2" bash "$AL" "nao escreva" >/dev/null 2>&1; rc=$?
afirma "log symlink: sai 0" test "$rc" -eq 0
afirma "log symlink: alvo intacto" test ! -s "$T/alvo"
afirma "log symlink: avisa no logger" grep -qi 'symlink' "$CHAMADAS"
rm -rf "$T/real" "$T/d3"; mkdir "$T/real"; ln -s "$T/real" "$T/d3"
DATA_DIR="$T/d3" bash "$AL" "nao escreva" >/dev/null 2>&1; rc=$?
afirma "dir symlink: sai 0" test "$rc" -eq 0
afirma "dir symlink: nada escrito" test -z "$(ls -A "$T/real")"
rm -rf "$T/d4"; DATA_DIR="$T/d4" bash "$AL" "perm" >/dev/null 2>&1
afirma "log criado sem acesso a grupo/outros" bash -c "[ \"\$(stat -c %a '$T/d4/alertas.log')\" = 600 ]"
echo "DATA_DIR impossível"
DATA_DIR="/proc/nao/da" bash "$AL" "x" >/dev/null 2>&1; rc=$?
afirma "ainda sai 0" test "$rc" -eq 0

fim alerta
