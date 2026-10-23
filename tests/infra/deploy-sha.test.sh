#!/usr/bin/env bash
# T-007 {AC-005.3}: deploy.sh só aceita SHA de 40 hex; recusa `latest`; é idempotente.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"

monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B"

echo "AC-005.3: aceita SHA de 40 hex"
bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "AC-005.3: SHA válido sai 0" test "$rc" -eq 0
afirma "AC-005.3: .env passou a apontar o SHA" test "$(env_tag)" = "$SHA_B"
afirma "AC-005.3: as três imagens usam o SHA" bash -c "grep -c ':$SHA_B\$' '$CRM_DIR/.env' | grep -qx 3"
afirma "AC-003.1: hml passa -f docker-compose.hml.yml (sem Caddy próprio)" grep -q "docker-compose.hml.yml" "$FAKE_LOG"

echo "AC-005.3: recusa o que não é SHA de 40 hex"
for ruim in latest stable main 1.2.3 abc123 "${SHA_B:0:39}" "${SHA_B}a" "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ" "${SHA_B^^}"; do
  antes="$(cat "$CRM_DIR/.env")"; : > "$FAKE_LOG"
  bash "$DEPLOY" hml "$ruim" >"$T/out" 2>&1; rc=$?
  afirma "AC-005.3: recusa '$ruim' (saída != 0)" test "$rc" -ne 0
  afirma "AC-005.3: '$ruim' não mexeu no .env" test "$(cat "$CRM_DIR/.env")" = "$antes"
  afirma "AC-005.3: '$ruim' não chamou docker" test ! -s "$FAKE_LOG"
done

echo "AC-005.3: ambiente inválido e argumentos faltando"
bash "$DEPLOY" staging "$SHA_B" >/dev/null 2>&1; afirma "ambiente desconhecido recusado" test "$?" -ne 0
bash "$DEPLOY" hml >/dev/null 2>&1; afirma "sem SHA recusado" test "$?" -ne 0

echo "AC-005.3: idempotente (mesmo SHA não muda o .env nem recria)"
: > "$FAKE_LOG"; antes="$(cat "$CRM_DIR/.env")"
bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "repetir o SHA sai 0" test "$rc" -eq 0
afirma ".env idêntico" test "$(cat "$CRM_DIR/.env")" = "$antes"
afirma "nenhum 'up' repetido" bash -c "! grep -q ' up ' '$FAKE_LOG'"
afirma "usa compose do prod.yml sem single-server em hml" bash -c "! grep -q single-server '$FAKE_LOG'"

echo "prod usa single-server no compose"
FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B $SHA_C" bash "$DEPLOY" prod "$SHA_C" >"$T/out" 2>&1
afirma "prod passa -f docker-compose.single-server.yml" grep -q "docker-compose.single-server.yml" "$FAKE_LOG"

limpa
[ "$FALHAS" -eq 0 ] && echo "deploy-sha: OK" || { echo "deploy-sha: $FALHAS falha(s)"; exit 1; }
