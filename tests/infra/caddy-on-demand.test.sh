#!/usr/bin/env bash
# {AC-007.6} Caddyfiles: ask global, /api/internal/* barrado ao público, site on_demand
# só no arquivo opt-in (caddy-sites/marcas.caddy), que não existe por padrão.
# Validação sintática real (`caddy validate`) não existe neste repositório: fica para T-045
# (homologação, com o contêiner caddy:2-alpine). Aqui a prova é de texto.
set -uo pipefail
R="$(cd "$(dirname "$0")/../.." && pwd)"
FALHAS=0
afirma() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then echo "  ok  $d"; else echo "  FALHOU  $d"; FALHAS=$((FALHAS+1)); fi; }

for f in Caddyfile Caddyfile.single-server; do
  echo "AC-007.6: $f"
  C="$R/$f"
  afirma "bloco global tem on_demand_tls com ask para o app" \
    bash -c "tr -d '\r' < '$C' | tr '\n\t' '  ' | tr -s ' ' | grep -Fq 'on_demand_tls { ask http://app:3000/api/internal/tls-ask?token={\$TLS_ASK_TOKEN} }'"
  afirma "/api/internal/* responde 404 ao público" \
    bash -c "grep -Eq '@interno path /api/internal/\*' '$C' && grep -Eq 'respond @interno 404' '$C'"
  afirma "o bloqueio vem antes do reverse_proxy catch-all" \
    bash -c "[ \$(grep -n 'respond @interno 404' '$C' | head -1 | cut -d: -f1) -lt \$(grep -n 'reverse_proxy app:3000' '$C' | tail -1 | cut -d: -f1) ]"
  afirma "nenhum site do arquivo usa tls { on_demand }" \
    bash -c "! grep -Eq '^[[:space:]]*on_demand[[:space:]]*$' '$C'"
done

echo "AC-007.6: opt-in"
afirma "marcas.caddy ativo NÃO existe no repositório" test ! -e "$R/caddy-sites/marcas.caddy"
afirma "marcas.caddy está fora do versionamento (gitignore cobre caddy-sites/*)" \
  bash -c "grep -Eq '^caddy-sites/\*$' '$R/.gitignore'"
afirma "o modelo existe e é versionável" bash -c "grep -Eq '^!caddy-sites/marcas.caddy.exemplo$' '$R/.gitignore' && test -f '$R/caddy-sites/marcas.caddy.exemplo'"
afirma "o modelo traz tls { on_demand }" \
  bash -c "tr -d '\r' < '$R/caddy-sites/marcas.caddy.exemplo' | tr '\n\t' '  ' | grep -Eq 'tls *\{ *on_demand *\}'"
afirma "o modelo não termina em .caddy (o glob não o importa)" bash -c "! ls '$R'/caddy-sites/*.caddy | grep -q marcas"
afirma "o modelo também barra /api/internal/*" grep -q 'respond @interno 404' "$R/caddy-sites/marcas.caddy.exemplo"
afirma "o compose passa TLS_ASK_TOKEN ao caddy com default vazio" grep -Fq 'TLS_ASK_TOKEN: ${TLS_ASK_TOKEN:-}' "$R/docker-compose.prod.yml"

echo "validação real do Caddy (só onde há docker; no CI há)"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  for arq in Caddyfile Caddyfile.single-server; do
    afirma "caddy validate aceita $arq com o ask global"       docker run --rm -e TLS_ASK_TOKEN=token-de-teste -e DOMAIN=exemplo.test -e APP_DOMAIN=exemplo.test         -e ACME_EMAIL=teste@exemplo.test -v "$R/$arq:/etc/caddy/Caddyfile:ro" -v "$R/caddy-sites:/etc/caddy/caddy-sites:ro"         caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  done
else
  echo "  (docker ausente: validação real fica para o CI/T-045)"
fi

echo
if [ "$FALHAS" -eq 0 ]; then echo "caddy-on-demand: OK"; else echo "caddy-on-demand: $FALHAS falha(s)"; exit 1; fi
