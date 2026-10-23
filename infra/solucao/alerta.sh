#!/usr/bin/env bash
# alerta.sh — registra um alerta operacional. Mensagem em $1 (ou stdin se $1 vazio).
#   (a) acrescenta "AAAA-MM-DDTHH:MM:SSZ mensagem" em $DATA_DIR/alertas.log (últimas 1000 linhas)
#   (b) `logger -t crm-alerta`, se existir
#   (c) ALERTA_EXTRA_CMD (opcional; futuro e-mail/Sentry) recebe a mensagem em stdin
# Segredos: mascara valor de nome sensível (chave=valor, "chave: valor", com esquema Bearer/Basic/Token
# ou entre aspas), senha em URL (://usuario:***@) e tokens soltos reconhecíveis (ghp_, sk-, AGE-SECRET-KEY-,
# JWT). A chave PÚBLICA age1... não é segredo e passa.
# Mensagem limitada a 500 caracteres, sem quebras de linha. SEMPRE sai 0. umask 077; recusa escrever se
# DATA_DIR ou alertas.log for symlink (avisa no logger). A escrita+rotação é serializada com flock
# quando existe; sem flock, duas rodadas simultâneas podem perder uma linha (risco aceito).
# Variáveis: DATA_DIR (/opt/crm-deploy/dados) ALERTA_EXTRA_CMD
set +x
set -uo pipefail
umask 077

DATA_DIR="${DATA_DIR:-/opt/crm-deploy/dados}"
if [ -n "${1:-}" ]; then m="$1"; else m="$(cat 2>/dev/null || true)"; fi
NOME='[A-Za-z0-9_-]*(TOKEN|SECRET|PASSWORD|PASSWD|SENHA|KEY|CHAVE|API|CREDENTIAL|AUTH)[A-Za-z0-9_-]*'
SEP='[[:space:]]*[=:][[:space:]]*'
VALOR='("[^"]*"|'"'"'[^'"'"']*'"'"'|(Bearer|Basic|Token|Digest)[[:space:]]+[^[:space:]]+|[^[:space:]]+)'
m="$(printf '%s' "$m" | tr '\r\n\t' '   ' | tr -d '\000-\010\013\014\016-\037' \
  | sed -E \
    -e 's#(://[^/:@[:space:]]+):[^/@[:space:]]+@#\1:***@#g' \
    -e "s#(${NOME}${SEP})${VALOR}#\1***#Ig" \
    -e 's#ghp_[A-Za-z0-9]{20,}#***#g' \
    -e 's#sk-[A-Za-z0-9_-]{16,}#***#g' \
    -e 's#AGE-SECRET-KEY-[A-Za-z0-9]+#***#g' \
    -e 's#eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+#***#g' \
  | cut -c1-500)"
linha="$(date -u +%Y-%m-%dT%H:%M:%SZ) $m"

aviso() { command -v logger >/dev/null 2>&1 && logger -t crm-alerta -- "$1" >/dev/null 2>&1; true; }

grava_log() {
  local log="$DATA_DIR/alertas.log" tmp
  printf '%s\n' "$linha" >> "$log" || return 0
  tmp="$(mktemp "$log.XXXXXX")" || return 0
  if tail -n 1000 "$log" > "$tmp"; then mv -f "$tmp" "$log"; else rm -f "$tmp"; fi
}

if [ -L "$DATA_DIR" ]; then
  aviso "alerta.sh: DATA_DIR e symlink; log recusado"
else
  mkdir -p "$DATA_DIR" 2>/dev/null || true
  if [ -L "$DATA_DIR/alertas.log" ]; then
    aviso "alerta.sh: alertas.log e symlink; log recusado"
  elif [ -d "$DATA_DIR" ]; then
    if command -v flock >/dev/null 2>&1 && [ ! -L "$DATA_DIR/.alertas.lock" ]; then
      ( flock -w 5 9 || true; grava_log ) 9>"$DATA_DIR/.alertas.lock" 2>/dev/null || true
    else
      grava_log 2>/dev/null || true
    fi
  fi
fi

aviso "$m"
if [ -n "${ALERTA_EXTRA_CMD:-}" ]; then
  printf '%s\n' "$m" | timeout 20 "$ALERTA_EXTRA_CMD" >/dev/null 2>&1 || true
fi
exit 0
