#!/usr/bin/env bash
# AC-005.1: o baseline do banco só é reaplicado quando supabase/baseline.sql MUDA.
# Medido em 24/10/2026: reaplicar na hml (Supabase Cloud, EUA) leva ~12 min e a conexão SSH do pipeline
# caiu no silêncio. Sem mudança no arquivo, pula; com mudança (ou FORCAR_BASELINE=1), aplica de novo.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"

monta_ambiente
mkdir -p "$CRM_DIR/supabase"; echo "create table a();" > "$CRM_DIR/supabase/baseline.sql"
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B $SHA_C"
conta() { grep -c BASELINE_APLICADO "$FAKE_LOG" || true; }

echo "1º deploy: aplica o baseline e grava a marca"
: > "$FAKE_LOG"; bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1
afirma "aplicou 1 vez" test "$(conta)" = 1
afirma "gravou .baseline-aplicado" test -s "$CRM_DIR/.baseline-aplicado"

echo "2º deploy, arquivo igual: pula"
: > "$FAKE_LOG"; bash "$DEPLOY" hml "$SHA_C" >"$T/out" 2>&1
afirma "não reaplicou" test "$(conta)" = 0
afirma "o log diz que pulou" grep -q "Baseline inalterado" "$T/deploy.log"

echo "3º deploy, arquivo mudou: aplica"
echo "create table b();" >> "$CRM_DIR/supabase/baseline.sql"
: > "$FAKE_LOG"; bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1
afirma "reaplicou" test "$(conta)" = 1

echo "FORCAR_BASELINE=1 aplica mesmo igual"
: > "$FAKE_LOG"; FORCAR_BASELINE=1 bash "$DEPLOY" hml "$SHA_C" >"$T/out" 2>&1
afirma "forçou" test "$(conta)" = 1

limpa
[ "$FALHAS" -eq 0 ] && echo "deploy-baseline-pula: OK" || { echo "deploy-baseline-pula: $FALHAS falha(s)"; exit 1; }
