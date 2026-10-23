#!/usr/bin/env bash
# T-010 {AC-006.1, AC-012.2}: backup antes do deploy em prod; log sem segredos.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"

echo "AC-006.1: prod tira backup ANTES de mexer nas tags"
monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B"
bash "$DEPLOY" prod "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "AC-006.1: sai 0" test "$rc" -eq 0
afirma "AC-006.1: backup rodou" grep -q BACKUP_RODOU "$FAKE_LOG"
ordem="$(grep -nE 'BACKUP_RODOU|^UP_INICIO' "$FAKE_LOG" | head -1)"
afirma "AC-006.1: backup veio antes do primeiro up" bash -c "echo '$ordem' | grep -q BACKUP_RODOU"
afirma "AC-006.1: resultado do backup registrado no log do deploy" grep -Eqi "backup.*(concluído|ok|sucesso)" "$DEPLOY_LOG"

echo "AC-012.2: nenhum valor de segredo no log nem na saída"
afirma "AC-012.2: senha falsa ausente da saída" bash -c "! grep -q SENHA_FALSA_123 '$T/out'"
afirma "AC-012.2: senha falsa ausente do log" bash -c "! grep -q SENHA_FALSA_123 '$DEPLOY_LOG'"
limpa

echo "AC-006.1: hml não tira backup"
monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B"
bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1
afirma "hml: backup NÃO rodou" bash -c "! grep -q BACKUP_RODOU '$FAKE_LOG'"
limpa

echo "AC-006.1: falha do backup aborta antes de mexer nas tags"
monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B" FAKE_BACKUP_RC=3
antes="$(cat "$CRM_DIR/.env")"
bash "$DEPLOY" prod "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "backup falho: sai != 0" test "$rc" -ne 0
afirma "backup falho: não é 10 nem 11 (nada foi tocado)" test "$rc" -ne 10 -a "$rc" -ne 11
afirma "backup falho: .env intacto" test "$(cat "$CRM_DIR/.env")" = "$antes"
afirma "backup falho: nenhum up" bash -c "! grep -q '^UP_INICIO' '$FAKE_LOG'"
afirma "AC-012.2: segredo ausente também no caminho de falha" bash -c "! grep -q SENHA_FALSA_123 '$T/out' && ! grep -q SENHA_FALSA_123 '$DEPLOY_LOG'"
limpa

[ "$FALHAS" -eq 0 ] && echo "deploy-backup-segredos: OK" || { echo "deploy-backup-segredos: $FALHAS falha(s)"; exit 1; }
