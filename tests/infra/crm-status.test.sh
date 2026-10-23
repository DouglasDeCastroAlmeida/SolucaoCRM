#!/usr/bin/env bash
# T-019 {AC-008.3}: crm-status mostra estado e logs SEM segredos, aceita só argumentos
# de uma allowlist e nunca lê .env.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"
STATUS="$REPO_ROOT/infra/solucao/crm-status.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"; export FAKE_LOG="$T/docker.log"; : > "$FAKE_LOG"

cat > "$T/bin/docker" <<'EOF2'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
case "$1" in
  ps)
    if [[ " $* " == *'{{.Names}}'* && " $* " != *table* ]]; then printf 'crm-prod-app-1\ncrm-hml-app-1\noutro-app-1\n'
    else printf 'NAMES\tSTATUS\tIMAGE\ncrm-prod-app-1\tUp 5 minutes (healthy)\tghcr.io/x/app:abc\ncrm-hml-app-1\tUp 2 hours\tghcr.io/x/app:def\n'; fi ;;
  logs)
    echo "2026-10-22T10:00:00Z servidor iniciado na porta 3000"
    echo "SUPABASE_SERVICE_ROLE_KEY=abc123"
    echo "request Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJh"
    echo "conectando em postgres://usuario:SENHA_FALSA_789@db.interno:5432/crm"
    echo "password: hunter2"
    echo "token github ghp_abcdefghijklmnopqrstuvwxyz0123456789"
    echo "anthropic sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV_wxyz"
    echo "jwt solto eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJh fim"
    echo "-----BEGIN PRIVATE KEY-----"
    echo "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7"
    echo "-----END PRIVATE KEY-----"
    echo "{\"password\":\"abc999json\"}"
    echo "{\"Cookie\": \"sid=cookieval1\"}"
    echo "{\"token\":\"tokenzzz1\"}"
    echo "db_password = \"hunter two\""
    echo "PASSWORD = senhaX9"
    echo "apikey=chaveapi77"
    echo "Cookie: sid=cookiehdr2; theme=dark"
    echo "Set-Cookie: sess=setcookie3; Path=/"
    echo "Authorization: Basic dXNlcjpwYXNz"
    echo "Authorization: Token tok_abcdef123456"
    echo "acesso user9:passw9@host9.local/db"
    echo "API_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef"
    echo "{\"client_secret\": \"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5\"}"
    echo "healthcheck ok status=200" ;;
esac
EOF2
chmod +x "$T/bin/docker"; export PATH="$T/bin:$PATH"

SEGREDOS=(abc123 SENHA_FALSA_789 hunter2 ghp_abcdefghijklmnop sk-ant-api03 eyJhbGciOiJIUzI1NiJ9 MIIEvQIBADANBgkq "BEGIN PRIVATE KEY" c2lnbmF0dXJh abc999json cookieval1 tokenzzz1 "hunter two" "two\"" senhaX9 chaveapi77 cookiehdr2 setcookie3 dXNlcjpwYXNz tok_abcdef123456 passw9 0123456789abcdef0123456789abcdef QUJDREVGR0hJ)
nao_aparece() { # nao_aparece <texto> <arquivo...>
  local s="$1"; shift; ! grep -qF -- "$s" "$@"
}

echo "AC-008.3: sem argumento mostra estado e logs sem segredos"
bash "$STATUS" >"$T/out" 2>"$T/err"; rc=$?
afirma "AC-008.3: sai 0" test "$rc" -eq 0
for s in "${SEGREDOS[@]}"; do
  afirma "AC-008.3: '$s' não aparece" nao_aparece "$s" "$T/out" "$T/err"
done
afirma "AC-008.3: nome do container aparece" grep -q 'crm-prod-app-1' "$T/out"
afirma "AC-008.3: status aparece" grep -q 'Up 5 minutes' "$T/out"
afirma "AC-008.3: linha normal de log aparece" grep -q 'servidor iniciado na porta 3000' "$T/out"
afirma "AC-008.3: healthcheck normal aparece" grep -q 'healthcheck ok status=200' "$T/out"
afirma "AC-008.3: container fora dos projetos não aparece" nao_aparece 'outro-app-1' "$T/out"

echo "AC-008.3: logs <container> também é mascarado"
: > "$FAKE_LOG"
bash "$STATUS" logs crm-prod-app-1 50 >"$T/out" 2>&1; rc=$?
afirma "AC-008.3: logs sai 0" test "$rc" -eq 0
for s in "${SEGREDOS[@]}"; do afirma "AC-008.3: logs '$s' não aparece" nao_aparece "$s" "$T/out"; done
afirma "AC-008.3: logs mantém linha normal" grep -q 'servidor iniciado' "$T/out"
afirma "AC-008.3: logs passou --tail 50 ao docker" grep -qE -- '--tail[ =]50' "$FAKE_LOG"

echo "AC-008.3: allowlist de argumentos"
recusa() { : > "$FAKE_LOG"; bash "$STATUS" "$@" >"$T/out" 2>&1; local rc=$?
  afirma "AC-008.3: recusa '$*'" test "$rc" -ne 0
  afirma "AC-008.3: '$*' não chamou docker logs/inspect/exec" nao_aparece 'docker logs' "$FAKE_LOG"
  afirma "AC-008.3: '$*' não chamou docker inspect/exec" bash -c "! grep -qE 'docker (inspect|exec)' '$FAKE_LOG'"; }
recusa inspect crm-prod-app-1
recusa exec crm-prod-app-1 env
recusa logs outro-app-1
recusa logs 'crm-prod-app-1; id'
recusa logs 'crm-prod-app-1' 501
recusa logs 'crm-prod-app-1' abc
recusa logs 'crm-prod-app-1' 10 extra
recusa ps extra
recusa '$(id)'
recusa logs

echo "AC-008.3: nunca lê .env nem usa eval"
afirma "AC-008.3: sem eval no script" bash -c "! grep -vE '^\s*#' '$STATUS' | grep -qE '\beval\b'"
afirma "AC-008.3: sem referência a .env no código" bash -c "! grep -vE '^\s*#' '$STATUS' | grep -qE '\.env|env-file|docker (inspect|exec)|compose config'"

echo
if [ "$FALHAS" -eq 0 ]; then echo "crm-status: OK"; else echo "crm-status: $FALHAS falha(s)"; exit 1; fi
