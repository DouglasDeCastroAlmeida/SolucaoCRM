#!/usr/bin/env bash
# alerta.sh — registra um alerta operacional. Mensagem em $1 (ou stdin se $1 vazio).
#   (a) acrescenta "AAAA-MM-DDTHH:MM:SSZ mensagem" em $DATA_DIR/alertas.log (últimas 1000 linhas)
#   (b) `logger -t crm-alerta`, se existir
#   (c) ALERTA_EXTRA_CMD (opcional; futuro e-mail/Sentry) recebe a mensagem em stdin
# Nunca recebe nem imprime segredos: valores de chaves sensíveis (chave=valor) são mascarados.
# Mensagem limitada a 500 caracteres, sem quebras de linha. SEMPRE sai 0: alertar nunca derruba
# quem chama. Variáveis: DATA_DIR (/opt/crm-deploy/dados) ALERTA_EXTRA_CMD
set +x
set -uo pipefail

DATA_DIR="${DATA_DIR:-/opt/crm-deploy/dados}"
if [ -n "${1:-}" ]; then m="$1"; else m="$(cat 2>/dev/null || true)"; fi
m="$(printf '%s' "$m" | tr '\r\n\t' '   ' | tr -d '\000-\010\013\014\016-\037' \
  | sed -E 's/([A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|SENHA|KEY|CHAVE|API|CREDENTIAL|AUTH)[A-Za-z0-9_]*[=:] *)[^ ]+/\1***/Ig' \
  | cut -c1-500)"
linha="$(date -u +%Y-%m-%dT%H:%M:%SZ) $m"

{
  mkdir -p "$DATA_DIR" && log="$DATA_DIR/alertas.log" \
    && printf '%s\n' "$linha" >> "$log" \
    && tmp="$(mktemp "$log.XXXXXX")" \
    && tail -n 1000 "$log" > "$tmp" && mv -f "$tmp" "$log"
} 2>/dev/null || true

if command -v logger >/dev/null 2>&1; then logger -t crm-alerta -- "$m" >/dev/null 2>&1 || true; fi
if [ -n "${ALERTA_EXTRA_CMD:-}" ]; then
  printf '%s\n' "$m" | timeout 20 "$ALERTA_EXTRA_CMD" >/dev/null 2>&1 || true
fi
exit 0
