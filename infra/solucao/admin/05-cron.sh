#!/usr/bin/env bash
# Ação administrativa 05: cron do usuário deploy. {AC-008.5}
#  - backup externo diário às 03:17
#  - medir-memoria a cada 10 minutos
# Só instala a linha de um script que EXISTE em /opt/crm-deploy (ausente: avisa e pula).
# Idempotente: remove as linhas marcadas com "# crm-solucao" e reescreve; as demais ficam
# intactas. Se `crontab -l` falhar por qualquer motivo que não seja "no crontab for", ABORTA
# sem reescrever (para não apagar linhas alheias).
# Uso: 05-cron.sh [--dry-run]     (CRM_DEPLOY_DIR muda a pasta dos scripts; padrão /opt/crm-deploy)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; *) erro "argumento desconhecido: $a"; exit 2 ;; esac; done
cabecalho; exige_root
MARCA='# crm-solucao'
DIR="${CRM_DEPLOY_DIR:-/opt/crm-deploy}"
LINHAS=()
adiciona() { # adiciona <agenda> <script>
  if [ -f "$DIR/$2" ]; then
    LINHAS+=("$1 $DIR/$2 >/dev/null 2>&1 $MARCA")
  else
    msg "aviso: $DIR/$2 ausente; linha de cron pulada (rode esta ação de novo quando o script existir)."
  fi
}
adiciona "17 3 * * *" backup-externo.sh
adiciona "*/10 * * * *" medir-memoria.sh

if [ "$DRY" = 1 ]; then
  msg "[dry-run] faria: instalar no crontab do deploy (substituindo linhas $MARCA):"
  [ "${#LINHAS[@]}" -eq 0 ] || printf '[dry-run]   | %s\n' "${LINHAS[@]}"
else
  if ! atual="$(crontab -u deploy -l 2>&1)"; then
    case "$atual" in
      *"no crontab for"*) atual="" ;;
      *) erro "não consegui ler o crontab do deploy ($atual); nada foi alterado."; exit 1 ;;
    esac
  fi
  { printf '%s\n' "$atual" | grep -vF "$MARCA" | grep -v '^$' || true
    [ "${#LINHAS[@]}" -eq 0 ] || printf '%s\n' "${LINHAS[@]}"; } | crontab -u deploy -
  msg "cron do deploy garantido."
fi
