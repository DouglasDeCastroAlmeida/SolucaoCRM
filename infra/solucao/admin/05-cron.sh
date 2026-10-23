#!/usr/bin/env bash
# Ação administrativa 05: cron do usuário deploy. {AC-008.5}
#  - backup externo diário às 03:17
#  - medir-memoria a cada 10 minutos
#  - cria $CRM_DEPLOY_DIR/dados (750 deploy:deploy), onde medir-memoria e alerta.sh gravam
# Só instala a linha de um script que EXISTE em /opt/crm-deploy (ausente: avisa e pula).
# Idempotente: remove as linhas marcadas com "# crm-solucao" e reescreve; as demais ficam
# intactas. Se `crontab -l` falhar por qualquer motivo que não seja "no crontab for", ABORTA
# sem reescrever (para não apagar linhas alheias).
# Uso: 05-cron.sh [--dry-run]     (CRM_DEPLOY_DIR: scripts, padrão /opt/crm-deploy; CRM_PROD_DIR: kit, padrão /opt/crm-prod)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; *) erro "argumento desconhecido: $a"; exit 2 ;; esac; done
cabecalho; exige_root
MARCA='# crm-solucao'
DIR="${CRM_DEPLOY_DIR:-/opt/crm-deploy}"
PROD="${CRM_PROD_DIR:-/opt/crm-prod}"
DADOS="$DIR/dados"
LINHAS=()
adiciona() { # adiciona <agenda> <script> <prefixo> <argumentos>
  if [ -f "$DIR/$2" ]; then
    LINHAS+=("$1 $3$DIR/$2$4 >/dev/null 2>&1 $MARCA")
  else
    msg "aviso: $DIR/$2 ausente; linha de cron pulada (rode esta ação de novo quando o script existir)."
  fi
}
# o backup roda na pasta do kit, com o .env.backup e o alerta, e gera o backup antes de enviar
adiciona "17 3 * * *" backup-externo.sh "cd $PROD && BACKUP_ENV_FILE=$DIR/.env.backup ALERTA_CMD=$DIR/alerta.sh " " --gerar"
adiciona "*/10 * * * *" medir-memoria.sh "ALERTA_CMD=$DIR/alerta.sh DATA_DIR=$DADOS " ""
# o usuário deploy não cria pastas em /opt/crm-deploy (root:root 755): quem cria é esta ação
roda install -d -m 750 -o deploy -g deploy "$DADOS"

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
