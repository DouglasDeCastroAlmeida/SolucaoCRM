#!/usr/bin/env bash
# T-014: AC-007.1, AC-007.2, AC-007.6
. "$(dirname "${BASH_SOURCE[0]}")/_backup-lib.sh"
echo "backup-externo: criptografia, envio e retenção"
monta_ambiente
cria_backup 2
bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 0 ] && ok "AC-007.1 sai 0 com banco, WAHA e Storage" || { falha "AC-007.1 rc=$rc"; cat "$T/out.txt"; }
for p in 'db-*.sql.gz.age' 'waha-*.tgz.age' 'storage-*.tgz.age'; do
  n=$(ls "$FAKE_BUCKET/bkt/"$p 2>/dev/null | wc -l)
  [ "$n" = 2 ] && ok "AC-007.1 $p enviado" || falha "AC-007.1 $p: $n arquivos enviados"
done
todos=1
for f in "$FAKE_BUCKET"/bkt/*.age; do
  [ "$(head -c 9 "$f")" = "AGE-FAKE:" ] || todos=0
  orig="$BACKUP_DIR/$(basename "$f" .age)"
  [ ! -f "$orig" ] || ! cmp -s "$f" "$orig" || todos=0
done
[ "$todos" = 1 ] && ok "AC-007.2 todo objeto no bucket está criptografado" || falha "AC-007.2 objeto em texto aberto"
grep -q 'age -r age1chavepublicafalsa' "$FAKE_LOG" && ok "AC-007.2 age recebeu a chave PÚBLICA (-r)" || falha "AC-007.2 destinatário"
grep -qiE 'retenção externa.*(30|R2_RETENCAO_DIAS)' "$T/ext.log" && ok "AC-007.6 retenção externa registrada em log" || falha "AC-007.6 log sem retenção externa"
grep -rq "$SEGREDO" "$T/out.txt" "$T/ext.log" && falha "AC-012.2 segredo no log" || ok "AC-012.2 sem segredo em log/saída"
[ -z "$(ls -d /tmp/backup-externo.* 2>/dev/null)" ] && ok "diretório temporário apagado" || falha "temporário sobrou"
n0=$(grep -c '^age -r' "$FAKE_LOG"); bash "$SCRIPT" >/dev/null 2>&1
[ "$(grep -c '^age -r' "$FAKE_LOG")" = "$n0" ] && ok "segunda rodada não reenvia o já enviado (.enviado)" || falha "reenviou"
limpa

# retenção local: 16 de cada, todos já enviados -> sobram 14
monta_ambiente; cria_backup 16; touch "$BACKUP_DIR"/*.sql.gz.enviado 2>/dev/null
for f in "$BACKUP_DIR"/db-* "$BACKUP_DIR"/waha-* "$BACKUP_DIR"/storage-*; do case "$f" in *.enviado) ;; *) touch "$f.enviado" ;; esac; done
bash "$SCRIPT" >"$T/out.txt" 2>&1
for p in 'db-*.sql.gz' 'waha-*.tgz' 'storage-*.tgz'; do
  n=$(ls "$BACKUP_DIR"/$p | wc -l)
  [ "$n" = 14 ] && ok "AC-007.6 retenção local 14 de $p" || falha "AC-007.6 $p sobrou $n"
done
[ ! -e "$BACKUP_DIR/db-20260101-000000.sql.gz" ] && ok "AC-007.6 o mais antigo (enviado) foi removido" || falha "AC-007.6 antigo ficou"
limpa
# não enviados nunca são apagados
monta_ambiente; cria_backup 16
FAKE_RCLONE_FALHA=1 bash "$SCRIPT" >"$T/out.txt" 2>&1
n=$(ls "$BACKUP_DIR"/db-*.sql.gz | wc -l)
[ "$n" = 16 ] && ok "retenção não apaga arquivo não enviado" || falha "apagou não enviado ($n de 16)"
grep -q 'NÃO foi enviado' "$T/ext.log" && ok "avisa acúmulo de não enviados" || falha "sem aviso de acúmulo"
limpa

# lock de concorrência
monta_ambiente; cria_backup 1
if command -v flock >/dev/null 2>&1; then
  ( exec 9>"$BACKUP_DIR/.backup-externo.lock"; flock -n 9; sleep 15 ) & segura=$!; sleep 1
else
  mkdir "$BACKUP_DIR/.backup-externo.lock.d"; sleep 15 & segura=$!; echo $segura > "$BACKUP_DIR/.backup-externo.lock.d/pid"
fi
bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
kill $segura 2>/dev/null
[ "$rc" = 0 ] && grep -q 'outra execução em andamento' "$T/out.txt" && [ ! -d "$FAKE_BUCKET/bkt" ] && ok "lock: segunda execução sai 0 sem enviar" || falha "lock rc=$rc"
limpa

# arquivo vazio
monta_ambiente; : > "$BACKUP_DIR/db-20260101-000000.sql.gz"
bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 1 ] && [ -s "$T/alerta.txt" ] && [ ! -e "$BACKUP_DIR/db-20260101-000000.sql.gz.enviado" ] && [ ! -d "$FAKE_BUCKET/bkt" ] && ok "arquivo de 0 bytes: não envia, alerta, exit 1" || falha "vazio rc=$rc"
limpa

# BACKUP_ENV_FILE com permissão aberta
monta_ambiente; cria_backup 1; echo "X=1" > "$T/env"
STAT_CMD="echo 644" BACKUP_ENV_FILE="$T/env" bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 2 ] && grep -q 'chmod 600' "$T/out.txt" && ok "env com permissão 644 -> exit 2" || falha "perm 644 rc=$rc"
STAT_CMD="echo 600" BACKUP_ENV_FILE="$T/env" bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 0 ] && ok "env com permissão 600 aceito" || falha "perm 600 rc=$rc"
limpa

# AGE_RECIPIENT
monta_ambiente; cria_backup 1
AGE_RECIPIENT="AGE-SECRET-KEY-1ABCDEF" bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 2 ] && grep -q 'chave PRIVADA' "$T/out.txt" && [ ! -d "$FAKE_BUCKET/bkt" ] && ok "chave privada em AGE_RECIPIENT -> exit 2, nada enviado" || falha "privada rc=$rc"
AGE_RECIPIENT="qualquercoisa" bash "$SCRIPT" >/dev/null 2>&1; [ "$?" = 2 ] && ok "AGE_RECIPIENT sem prefixo age1 -> exit 2" || falha "prefixo"
limpa

monta_ambiente; unset AGE_RECIPIENT; cria_backup 1
bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 2 ] && grep -q 'AGE_RECIPIENT' "$T/out.txt" && ok "config ausente -> exit 2 com mensagem" || falha "exit 2 (rc=$rc)"
limpa
[ "$FALHAS" = 0 ] || { echo "$FALHAS falha(s)"; exit 1; }; echo "tudo ok"
