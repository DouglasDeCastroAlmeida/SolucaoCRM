#!/usr/bin/env bash
# Biblioteca dos testes do backup externo: age e rclone FALSOS (PATH controlado).
#   age    -> "criptografa" prefixando AGE-FAKE:<destinatario> + base64; registra -r em $FAKE_LOG.
#   rclone -> bucket simulado em $FAKE_BUCKET; FAKE_RCLONE_FALHA=1 falha (e imprime a chave
#             secreta no stderr, para provar a censura); FAKE_RCLONE_CORROMPE=1 grava truncado.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/infra/solucao/backup-externo.sh"
RESTAURA="$REPO_ROOT/infra/solucao/restaurar-backup-externo.sh"
SEGREDO="SEGREDO_FALSO_456"
FALHAS=0
ok()   { printf '  ok   %s\n' "$1"; }
falha(){ printf '  FALHA %s\n' "$1"; FALHAS=$((FALHAS + 1)); }
afirma() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else falha "$d"; fi; }

monta_ambiente() {
  T="$(mktemp -d)"; mkdir -p "$T/bin" "$T/backups" "$T/bucket"
  FAKE_LOG="$T/fake.log"; : > "$FAKE_LOG"; FAKE_BUCKET="$T/bucket"
  cat > "$T/bin/age" <<'E2'
#!/usr/bin/env bash
mode=enc; rec=""; id=""; out=""; in=""
while [ $# -gt 0 ]; do case "$1" in
  -d) mode=dec ;; -r) rec="$2"; shift ;; -i) id="$2"; shift ;; -o) out="$2"; shift ;; *) in="$1" ;; esac; shift; done
if [ "$mode" = enc ]; then
  echo "age -r $rec" >> "$FAKE_LOG"
  { echo "AGE-FAKE:$rec"; base64 < "$in"; } > "$out"
else
  [ -f "$id" ] || { echo "identidade ausente" >&2; exit 1; }
  tail -n +2 "$in" | base64 -d > "$out"
fi
E2
  cat > "$T/bin/rclone" <<'E2'
#!/usr/bin/env bash
cmd="$1"; shift; pos=(); inc=""
while [ $# -gt 0 ]; do case "$1" in --include) inc="$2"; shift ;; --*) ;; *) pos+=("$1") ;; esac; shift; done
echo "rclone $cmd" >> "$FAKE_LOG"
real() { local p="${1#*:}"; echo "$FAKE_BUCKET/$p"; }
if [ -n "${FAKE_RCLONE_FALHA:-}" ]; then
  echo "ERROR: S3 auth falhou secret=$RCLONE_CONFIG_DEST_SECRET_ACCESS_KEY" >&2; exit 1; fi
case "$cmd" in
  copyto)
    src="${pos[0]}"; dst="${pos[1]}"
    case "$src" in dest:*) mkdir -p "$(dirname "${pos[1]}")"; cp "$(real "$src")" "$dst" ;;
      *) mkdir -p "$(dirname "$(real "$dst")")"
         if [ -n "${FAKE_RCLONE_CORROMPE:-}" ]; then head -c 5 "$src" > "$(real "$dst")"; else cp "$src" "$(real "$dst")"; fi ;; esac ;;
  check) cmp -s "${pos[0]}/$inc" "$(real "${pos[1]}")/$inc" ;;
  size)
    if [ -n "${FAKE_RCLONE_SIZE_LIXO:-}" ]; then echo "isto nao e json"; exit 0; fi
    if [ -n "${FAKE_BUCKET_BYTES:-}" ]; then b="$FAKE_BUCKET_BYTES"; else b=$(find "$FAKE_BUCKET" -type f -exec cat {} + 2>/dev/null | wc -c); fi
    printf "{\"count\":1,\"bytes\":%s}
" "$b" ;;
esac
E2
  chmod +x "$T/bin/"*
  printf '#!/usr/bin/env bash\ncat >> "%s/alerta.txt"; echo " | $1" >> "%s/alerta.txt"\n' "$T" "$T" > "$T/alerta.sh"; chmod +x "$T/alerta.sh"
  export T FAKE_LOG FAKE_BUCKET BACKUP_DIR="$T/backups" S3_ENDPOINT="https://s3.exemplo.test" \
    BUCKET="bkt" S3_ACCESS_KEY_ID="AKIAFALSO" S3_SECRET_ACCESS_KEY="$SEGREDO" \
    AGE_RECIPIENT="age1chavepublicafalsa" ALERTA_CMD="$T/alerta.sh" \
    BACKUP_EXTERNO_LOG="$T/ext.log"
  unset BACKUP_ENV_FILE BACKUP_CMD
  export PATH="$T/bin:$PATH"
}
cria_backup() { # cria_backup <n> -> n de cada tipo, do mais velho ao mais novo
  local i s
  for i in $(seq 1 "$1"); do s=$(printf '%02d' "$i")
    echo "db $s"      > "$BACKUP_DIR/db-202601$s-000000.sql.gz"
    echo "waha $s"    > "$BACKUP_DIR/waha-202601$s-000000.tgz"
    echo "storage $s" > "$BACKUP_DIR/storage-202601$s-000000.tgz"
    touch -d "2026-01-$s" "$BACKUP_DIR/"*"202601$s-000000"* 2>/dev/null
  done
}
limpa() { rm -rf "${T:-/nonexistent-xyz}"; }
