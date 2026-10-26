#!/usr/bin/env bash
# AC-010.4 (mudança 002, REQ-006) — o gancho "Send Email" do GoTrue no override
# do kit single-server.
#
# O QUE ESTÁ SOB PROVA: o override entrega ao contêiner `auth` as três chaves
# GOTRUE_HOOK_SEND_EMAIL_* e cada uma tem PADRÃO que não quebra um `.env` que
# nunca ouviu falar do gancho (instalação antiga): desligado, sem URI, sem
# segredo. Sem padrão, o `docker compose` de quem atualiza avisaria "variable is
# not set" e o GoTrue receberia string vazia onde espera booleano.
#
# O CAMINHO: o texto do override (nada sobe, nada é baixado). A expansão
# `${VAR:-padrão}` do compose é a mesma do bash, então o padrão é avaliado por
# `env -i bash` — um ambiente sem nenhuma das variáveis, que é o `.env` antigo —
# e o caso de controle prova que, COM a variável no ambiente, o valor dela vence.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
OVERRIDE="$ROOT_DIR/hostgator-setup-kit/supabase-single-server.override.yml"
FAILS=0

check() {
  local descricao="$1"
  shift
  if "$@"; then
    printf '  ✓ %s\n' "$descricao"
  else
    printf '  ✗ %s\n' "$descricao"
    FAILS=$((FAILS + 1))
  fi
}

# A expressão `${...}` de uma chave, como está no arquivo (vazia se a chave não existe).
expressao() {
  sed -nE "s/^[[:space:]]*$1:[[:space:]]*\"(\\$\{[^\"]*\})\"[[:space:]]*\$/\1/p" "$OVERRIDE" | head -1
}

# O valor que o compose daria à expressão com o ambiente que se passa em "$@".
valor() {
  local expr="$1"
  shift
  env -i "$@" bash -c "printf '%s' \"$expr\""
}

for chave in GOTRUE_HOOK_SEND_EMAIL_ENABLED GOTRUE_HOOK_SEND_EMAIL_URI GOTRUE_HOOK_SEND_EMAIL_SECRETS; do
  check "override mapeia $chave com padrão (\${$chave:-...})" \
    bash -c '[[ "$1" == "\${$2:-"* ]]' _ "$(expressao "$chave")" "$chave"
done

ENABLED="$(expressao GOTRUE_HOOK_SEND_EMAIL_ENABLED)"
URI="$(expressao GOTRUE_HOOK_SEND_EMAIL_URI)"
SECRETS="$(expressao GOTRUE_HOOK_SEND_EMAIL_SECRETS)"

check ".env antigo (sem as variáveis): gancho DESLIGADO" \
  test "$(valor "$ENABLED" PATH="$PATH")" = "false"
check ".env antigo: URI vazia" \
  test -z "$(valor "$URI" PATH="$PATH")"
check ".env antigo: segredo vazio" \
  test -z "$(valor "$SECRETS" PATH="$PATH")"

check "controle: com a variável no .env, o valor dela vence o padrão" \
  test "$(valor "$ENABLED" PATH="$PATH" GOTRUE_HOOK_SEND_EMAIL_ENABLED=true)" = "true"

# O segredo NUNCA vira valor fixo no arquivo versionado.
check "o override não traz segredo escrito (whsec_)" \
  bash -c '! grep -q "whsec_" "$1"' _ "$OVERRIDE"

if [[ "$FAILS" -ne 0 ]]; then
  printf '\n%d teste(s) falharam.\n' "$FAILS"
  exit 1
fi

printf '\nTodos os testes do gancho de e-mail no override passaram.\n'
