#!/usr/bin/env bash
# Envia os backups do ciclo para um bucket S3-COMPATÍVEL privado, criptografados.
# Provedor NÃO fixo (Cloudflare R2, Backblaze B2, MinIO...): usa rclone com backend s3
# configurado por variáveis RCLONE_CONFIG_* (sem arquivo de config).
#
# Variáveis (ambiente ou arquivo 0600 apontado por BACKUP_ENV_FILE; nunca por argumento):
#   BACKUP_DIR                  pasta dos backups (db-*.sql.gz, waha-*.tgz, storage-*.tgz)
#   S3_ENDPOINT | R2_ENDPOINT   endpoint do provedor
#   BUCKET | R2_BUCKET | S3_BUCKET
#   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY (ou R2_*)
#   AGE_RECIPIENT               chave PÚBLICA age (age1...)
#   ALERTA_CMD                  comando que recebe a mensagem em stdin e em $1 (e-mail/Sentry)
#   BACKUP_CMD                  comando que gera o backup (padrão: hostgator-setup-kit/backup.sh)
#   R2_RETENCAO_DIAS | BACKUP_RETENCAO_EXTERNA_DIAS   retenção externa, padrão 30 (regra de
#                               ciclo de vida configurada NO bucket; aqui só é registrada)
# Opção: --gerar  roda BACKUP_CMD antes de enviar.
# Saídas: 0 ok; 1 falha de envio/verificação; 2 configuração/dependência ausente.
#
# RESTAURAR: baixe o objeto e rode  age -d -i chave_privada.txt -o arquivo.sql.gz objeto.age
# (ou use infra/solucao/restaurar-backup-externo.sh). A chave PRIVADA nunca é lida aqui.
set +x
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${BACKUP_ENV_FILE:-}" ]; then
  [ -f "$BACKUP_ENV_FILE" ] || { echo "Arquivo BACKUP_ENV_FILE não existe: $BACKUP_ENV_FILE" >&2; exit 2; }
  modo="$(${STAT_CMD:-stat -c %a} "$BACKUP_ENV_FILE" 2>/dev/null)"; modo="${modo%% *}"; modo="${modo: -3}"
  case "$modo" in
    ?00) ;;
    *) echo "BACKUP_ENV_FILE ($BACKUP_ENV_FILE) tem permissão $modo: grupo/outros não podem ler. Rode: chmod 600 $BACKUP_ENV_FILE" >&2; exit 2 ;;
  esac
  set -a; . "$BACKUP_ENV_FILE"; set +a
fi
BACKUP_DIR="${BACKUP_DIR:-$AQUI/../../backups}"
ENDPOINT="${S3_ENDPOINT:-${R2_ENDPOINT:-}}"
BUCKET="${BUCKET:-${R2_BUCKET:-${S3_BUCKET:-}}}"
AKID="${S3_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
SECRET="${S3_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
RETENCAO_EXT="${R2_RETENCAO_DIAS:-${BACKUP_RETENCAO_EXTERNA_DIAS:-30}}"
LOG="${BACKUP_EXTERNO_LOG:-$BACKUP_DIR/backup-externo.log}"
GERAR=0; [ "${1:-}" = "--gerar" ] && GERAR=1

censura() { # troca o segredo por *** em qualquer texto
  local t; t="$(cat)"
  [ -n "$SECRET" ] && t="${t//"$SECRET"/***}"
  [ -n "$AKID" ] && t="${t//"$AKID"/***}"
  printf '%s\n' "$t"
}
log() { mkdir -p "$(dirname "$LOG")" 2>/dev/null; printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | censura | tee -a "$LOG"; }
alerta() {
  local msg; msg="$(printf '%s' "$1" | censura)"
  log "ALERTA: $msg"
  [ -n "${ALERTA_CMD:-}" ] && printf '%s' "$msg" | bash -c "$ALERTA_CMD" _ "$msg" >/dev/null 2>&1
  return 0
}
config() { log "ERRO de configuração: $1"; alerta "Backup externo não configurado: $1"; exit 2; }

command -v age >/dev/null 2>&1 || config "o programa 'age' não está instalado (instale: apt install age)."
command -v rclone >/dev/null 2>&1 || config "o programa 'rclone' não está instalado (instale: apt install rclone)."
[ -n "${AGE_RECIPIENT:-}" ] || config "defina AGE_RECIPIENT com a chave PÚBLICA age (age1...)."
case "$AGE_RECIPIENT" in
  AGE-SECRET-KEY-*) AGE_RECIPIENT=""; config "isto é uma chave PRIVADA; use a pública age1… em AGE_RECIPIENT." ;;
  age1*) ;;
  *) config "AGE_RECIPIENT deve começar com age1 (chave pública)." ;;
esac
[ -n "$ENDPOINT" ] || config "defina S3_ENDPOINT (ou R2_ENDPOINT)."
[ -n "$BUCKET" ] || config "defina BUCKET (ou R2_BUCKET / S3_BUCKET)."
[ -n "$AKID" ] && [ -n "$SECRET" ] || config "defina S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY (ambiente ou BACKUP_ENV_FILE)."

export RCLONE_CONFIG_DEST_TYPE=s3 RCLONE_CONFIG_DEST_PROVIDER=Other \
  RCLONE_CONFIG_DEST_ENDPOINT="$ENDPOINT" RCLONE_CONFIG_DEST_ACCESS_KEY_ID="$AKID" \
  RCLONE_CONFIG_DEST_SECRET_ACCESS_KEY="$SECRET"

log "Política de retenção: local 14 por tipo; retenção externa ${RETENCAO_EXT} dias (regra de ciclo de vida do bucket, ajustável por R2_RETENCAO_DIAS)."

if [ "$GERAR" = 1 ]; then
  cmd="${BACKUP_CMD:-bash $AQUI/../../hostgator-setup-kit/backup.sh}"
  bash -c "$cmd" 2>&1 | censura >> "$LOG"
  [ "${PIPESTATUS[0]}" = 0 ] || { alerta "Falha ao gerar o backup local (veja $LOG)."; exit 1; }
fi

mkdir -p "$BACKUP_DIR"
# trava de concorrência: flock; sem flock, diretório com PID (como no deploy.sh)
if command -v flock >/dev/null 2>&1; then
  exec 9>"$BACKUP_DIR/.backup-externo.lock"
  flock -n 9 || { log "Aviso: outra execução em andamento; saindo."; exit 0; }
else
  LOCKD="$BACKUP_DIR/.backup-externo.lock.d"
  if ! mkdir "$LOCKD" 2>/dev/null; then
    if kill -0 "$(cat "$LOCKD/pid" 2>/dev/null)" 2>/dev/null; then
      log "Aviso: outra execução em andamento; saindo."; exit 0
    fi
    rm -rf "$LOCKD"; mkdir "$LOCKD" 2>/dev/null || { log "Aviso: outra execução em andamento; saindo."; exit 0; }
  fi
  echo $$ > "$LOCKD/pid"
fi
# retenção local: só apaga o que já foi enviado (.enviado) além dos 14 mais recentes de cada tipo
for p in 'db-*.sql.gz' 'waha-*.tgz' 'storage-*.tgz'; do
  while IFS= read -r velho; do
    [ -n "$velho" ] || continue
    if [ -e "$velho.enviado" ]; then rm -f "$velho" "$velho.enviado"
    else log "Aviso: $(basename "$velho") passa dos 14 mais recentes mas NÃO foi enviado; mantido."; fi
  done < <( (ls -1t "$BACKUP_DIR"/$p 2>/dev/null || true) | tail -n +15 )
done
for m in "$BACKUP_DIR"/*.enviado; do [ -e "$m" ] && [ ! -e "${m%.enviado}" ] && rm -f "$m"; done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/backup-externo.XXXXXX")"; chmod 700 "$TMP"
trap 'rm -rf "$TMP" "${LOCKD:-}"' EXIT

falhou=0; enviados=0
for f in "$BACKUP_DIR"/db-*.sql.gz "$BACKUP_DIR"/waha-*.tgz "$BACKUP_DIR"/storage-*.tgz; do
  [ -f "$f" ] || continue
  [ -e "$f.enviado" ] && continue
  nome="$(basename "$f").age"
  if [ ! -s "$f" ]; then alerta "Arquivo vazio (0 bytes), não enviado: $(basename "$f")."; falhou=1; continue; fi
  if ! age -r "$AGE_RECIPIENT" -o "$TMP/$nome" "$f" 2>/dev/null; then
    alerta "Falha ao criptografar $(basename "$f")."; falhou=1; continue; fi
  if ! saida="$(rclone copyto "$TMP/$nome" "dest:$BUCKET/$nome" 2>&1)"; then
    rc=$?; alerta "Falha ao enviar $nome ao bucket (rclone saiu com código $rc). Último erro: $(printf '%s' "$saida" | tail -n 1 | censura)"; falhou=1; rm -f "$TMP/$nome"; continue; fi
  if ! saida="$(rclone check "$TMP" "dest:$BUCKET" --one-way --include "$nome" 2>&1)"; then
    alerta "Verificação (tamanho/hash) divergente no destino para $nome."; falhou=1; rm -f "$TMP/$nome"; continue; fi
  touch "$f.enviado"; enviados=$((enviados + 1)); log "Enviado e verificado: $nome"
  rm -f "$TMP/$nome"
done

if [ "$falhou" != 0 ]; then log "Backup externo terminou COM FALHAS."; exit 1; fi
log "Backup externo concluído: $enviados arquivo(s) novo(s)."
exit 0
