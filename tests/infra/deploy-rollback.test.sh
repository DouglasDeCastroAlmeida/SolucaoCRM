#!/usr/bin/env bash
# T-009 {AC-006.2, AC-006.3}: imagem que não sobe -> volta às tags anteriores.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"

echo "AC-006.2: saúde falha após o deploy -> rollback, código 10"
monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A"          # só a versão antiga responde
: > "$FAKE_LOG"
inicio=$SECONDS
bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
dur=$((SECONDS - inicio))
afirma "AC-006.2: sai com 10" test "$rc" -eq 10
afirma "AC-006.2: .env voltou ao SHA anterior (3 imagens)" bash -c "grep -c ':$SHA_A\$' '$CRM_DIR/.env' | grep -qx 3"
afirma "AC-006.2: repetiu o up (2 ups)" bash -c "test \$(grep -c '^UP_INICIO' '$FAKE_LOG') -eq 2"
afirma "AC-006.2: mensagem de rollback em português" grep -qi "voltou à versão anterior" "$T/out"
echo "AC-006.3: tempo medido (${dur}s)"
afirma "AC-006.3: cenário simulado < 120 s" test "$dur" -lt 120
afirma "AC-006.3: o tempo do rollback ficou registrado" grep -Eqi "rollback.*[0-9]+ ?s" "$T/out"
afirma "AC-006.3: a versão anterior volta a responder" test "$(env_tag)" = "$SHA_A"
limpa

echo "AC-006.2: o rollback também falha -> código 11"
monta_ambiente
export FAKE_SAUDAVEL_TAGS=""
bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "AC-006.2: sai com 11" test "$rc" -eq 11
limpa

echo "AC-006.2: 'up' que falha (sem chegar a checar saúde) também volta"
monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A" FAKE_UP_FALHA_TAGS="$SHA_B"
bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "AC-006.2: sai com 10" test "$rc" -eq 10
afirma "AC-006.2: .env voltou" test "$(env_tag)" = "$SHA_A"
limpa

echo "sucesso -> 0"
unset FAKE_UP_FALHA_TAGS
monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B"
bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "sai com 0" test "$rc" -eq 0
limpa

[ "$FALHAS" -eq 0 ] && echo "deploy-rollback: OK" || { echo "deploy-rollback: $FALHAS falha(s)"; exit 1; }
