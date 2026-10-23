#!/usr/bin/env bash
# Baixa um objeto do bucket S3-compatível e descriptografa com a chave PRIVADA age.
# Uso: restaurar-backup-externo.sh --objeto nome.sql.gz.age --identidade chave.txt --destino pasta
# Mesmas variáveis de conexão do backup-externo.sh (S3_ENDPOINT, BUCKET, chaves; BACKUP_ENV_FILE).
# Nunca sobrescreve arquivo existente.
set +x
set -uo pipefail
OBJ=""; ID=""; DEST=""
while [ $# -gt 0 ]; do case "$1" in
  --objeto) OBJ="$2"; shift ;; --identidade) ID="$2"; shift ;; --destino) DEST="$2"; shift ;;
  *) echo "Argumento desconhecido: $1" >&2; exit 2 ;; esac; shift; done
[ -n "$OBJ" ] && [ -n "$ID" ] && [ -n "$DEST" ] || { echo "Uso: --objeto <nome.age> --identidade <arquivo> --destino <pasta>" >&2; exit 2; }
[ -f "$ID" ] || { echo "Arquivo de identidade (chave privada) não encontrado: $ID" >&2; exit 2; }
[ -d "$DEST" ] || { echo "Pasta de destino não existe: $DEST" >&2; exit 2; }
command -v age >/dev/null 2>&1 && command -v rclone >/dev/null 2>&1 || { echo "Instale 'age' e 'rclone'." >&2; exit 2; }
case "$OBJ" in */*|*..*) echo "--objeto deve ser só o nome do arquivo (sem / nem ..)." >&2; exit 2 ;; esac
if [ -n "${BACKUP_ENV_FILE:-}" ]; then
  [ -f "$BACKUP_ENV_FILE" ] || { echo "Arquivo BACKUP_ENV_FILE não existe: $BACKUP_ENV_FILE" >&2; exit 2; }
  modo="$(${STAT_CMD:-stat -c %a} "$BACKUP_ENV_FILE" 2>/dev/null)"; modo="${modo%% *}"; modo="${modo: -3}"
  case "$modo" in ?00) ;; *) echo "BACKUP_ENV_FILE tem permissão $modo: grupo/outros não podem ler. Rode: chmod 600 $BACKUP_ENV_FILE" >&2; exit 2 ;; esac
  set -a; . "$BACKUP_ENV_FILE"; set +a; fi
BUCKET="${BUCKET:-${R2_BUCKET:-${S3_BUCKET:-}}}"
export RCLONE_CONFIG_DEST_TYPE=s3 RCLONE_CONFIG_DEST_PROVIDER=Other \
  RCLONE_CONFIG_DEST_ENDPOINT="${S3_ENDPOINT:-${R2_ENDPOINT:-}}" \
  RCLONE_CONFIG_DEST_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}" \
  RCLONE_CONFIG_DEST_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
SAIDA="$DEST/${OBJ%.age}"
[ ! -e "$SAIDA" ] || { echo "Já existe $SAIDA; não vou sobrescrever." >&2; exit 1; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/restaurar.XXXXXX")"; chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT
rclone copyto "dest:$BUCKET/$OBJ" "$TMP/obj.age" >/dev/null 2>&1 || { echo "Falha ao baixar $OBJ do bucket." >&2; exit 1; }
age -d -i "$ID" -o "$SAIDA" "$TMP/obj.age" || { rm -f "$SAIDA"; echo "Falha ao descriptografar (chave errada?)." >&2; exit 1; }
echo "Restaurado em $SAIDA"
