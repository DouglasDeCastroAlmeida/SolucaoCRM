#!/usr/bin/env bash
# AC-005.1/AC-006.3: a checagem de saúde do deploy usa o endereço PÚBLICO do .env
# (NEXT_PUBLIC_APP_URL), não localhost:3000 — a VPS não publica porta nenhuma, então
# localhost fazia todo deploy "falhar" e voltar (medido em 24/10/2026 na hml).
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"

monta_ambiente
unset HEALTH_BASE_URL
echo 'NEXT_PUBLIC_APP_URL="https://hml.exemplo.test"' >> "$CRM_DIR/.env"
# curl que registra a URL consultada e responde saudável
cat > "$T/bin/curl" <<'EOF2'
#!/usr/bin/env bash
url=""; for a in "$@"; do url="$a"; done
echo "CURL $url" >> "$FAKE_LOG"
case "$url" in */app) printf 307 ;; *) printf 200 ;; esac
EOF2
chmod +x "$T/bin/curl"

echo "saúde: usa o endereço público do .env quando HEALTH_BASE_URL não vem"
bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "deploy sai 0" test "$rc" -eq 0
afirma "consultou https://hml.exemplo.test/" grep -q "CURL https://hml.exemplo.test/$" "$FAKE_LOG"
afirma "consultou https://hml.exemplo.test/app" grep -q "CURL https://hml.exemplo.test/app$" "$FAKE_LOG"
afirma "não consultou localhost" bash -c "! grep -q 'CURL http://localhost' '$FAKE_LOG'"

echo "saúde: sem NEXT_PUBLIC_APP_URL cai em localhost:3000 (compatível com o padrão antigo)"
: > "$FAKE_LOG"; sed -i '/^NEXT_PUBLIC_APP_URL=/d' "$CRM_DIR/.env"
bash "$DEPLOY" hml "$SHA_C" >"$T/out" 2>&1
afirma "usou localhost:3000" grep -q "CURL http://localhost:3000/" "$FAKE_LOG"

limpa
[ "$FALHAS" -eq 0 ] && echo "deploy-health-url: OK" || { echo "deploy-health-url: $FALHAS falha(s)"; exit 1; }
