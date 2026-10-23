#!/usr/bin/env bash
# T-008 {AC-005.5}: dois deploys no mesmo ambiente não se sobrepõem; ambientes
# diferentes não se bloqueiam.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"

monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B $SHA_C" FAKE_UP_SLEEP=1

echo "AC-005.5: mesmo ambiente — o segundo espera"
: > "$FAKE_LOG"
bash "$DEPLOY" hml "$SHA_B" >"$T/o1" 2>&1 &
p1=$!
# espera o primeiro estar DENTRO do up (condição, não tempo fixo)
for _ in $(seq 1 100); do grep -q UP_INICIO "$FAKE_LOG" && break; sleep 0.05; done
bash "$DEPLOY" hml "$SHA_C" >"$T/o2" 2>&1 &
p2=$!
wait "$p1"; r1=$?; wait "$p2"; r2=$?
afirma "AC-005.5: os dois terminam com 0" test "$r1" -eq 0 -a "$r2" -eq 0
seq_log="$(grep -E '^UP_(INICIO|FIM)' "$FAKE_LOG" | awk '{print $1}' | tr '\n' ' ')"
afirma "AC-005.5: sequência INICIO FIM INICIO FIM (sem sobreposição)" test "$seq_log" = "UP_INICIO UP_FIM UP_INICIO UP_FIM "
afirma "AC-005.5: o segundo avisou que esperava" grep -qi "aguardando" "$T/o2"
afirma "AC-005.5: versão final é a do segundo deploy" test "$(env_tag)" = "$SHA_C"

echo "AC-005.5: ambientes diferentes não se bloqueiam"
limpa; monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B $SHA_C"
mkdir -p "$T/crm-prod/hostgator-setup-kit"
cp "$CRM_DIR/.env" "$T/crm-prod/.env"; cp "$CRM_DIR"/docker-compose.*.yml "$T/crm-prod/"
: > "$FAKE_LOG"
# o hml fica SEGURANDO o up até o prod também estar no up (condição, não tempo)
FAKE_UP_BLOQUEIA_ATE="$T/libera" bash "$DEPLOY" hml "$SHA_B" >"$T/o1" 2>&1 &
p1=$!
for _ in $(seq 1 300); do grep -q UP_INICIO "$FAKE_LOG" && break; sleep 0.1; done
CRM_DIR="$T/crm-prod" BACKUP_CMD="true" DEPLOY_LOG="$T/p.log" bash "$DEPLOY" prod "$SHA_C" >"$T/o2" 2>&1 &
p2=$!
for _ in $(seq 1 300); do [ "$(grep -c '^UP_INICIO' "$FAKE_LOG")" -ge 2 ] && break; sleep 0.1; done
dois_no_up="$(grep -c '^UP_INICIO' "$FAKE_LOG")"; fins="$(grep -c '^UP_FIM' "$FAKE_LOG")"
: > "$T/libera"
wait "$p1"; r1=$?; wait "$p2"; r2=$?
afirma "AC-005.5: prod entrou no up enquanto o hml ainda estava no dele" test "$dois_no_up" -ge 2 -a "$fins" -eq 0
afirma "AC-005.5: os dois terminam com 0" test "$r1" -eq 0 -a "$r2" -eq 0

limpa
[ "$FALHAS" -eq 0 ] && echo "deploy-lock: OK" || { echo "deploy-lock: $FALHAS falha(s)"; exit 1; }
