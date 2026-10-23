#!/usr/bin/env bash
# T-045: AC-007.7 — o envio mede o bucket antes e recusa acima do teto (BUCKET_TETO_GB, padrão 7)
. "$(dirname "${BASH_SOURCE[0]}")/_backup-lib.sh"
echo "backup-externo: teto de espaço do bucket"
enviou() { [ -n "$(find "$FAKE_BUCKET" -name "*.age" 2>/dev/null)" ]; }

monta_ambiente; cria_backup 1
FAKE_BUCKET_BYTES=1000000000 bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 0 ] && enviou && ok "abaixo do teto envia normalmente" || falha "abaixo do teto rc=$rc"
grep -q 'rclone size' "$FAKE_LOG" && ok "mediu o bucket com rclone size" || falha "não mediu"
limpa

monta_ambiente; cria_backup 1
FAKE_BUCKET_BYTES=8000000000 bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 1 ] && ok "acima do teto -> exit 1" || falha "acima rc=$rc"
! enviou && ! grep -q 'rclone copyto' "$FAKE_LOG" && ok "acima do teto: nada enviado" || falha "enviou acima do teto"
[ -s "$T/alerta.txt" ] && ok "acima do teto: alerta disparado" || falha "sem alerta"
grep -q '7' "$T/alerta.txt" && grep -qE '8([.,]0)? ?GB' "$T/alerta.txt" && ok "alerta traz GB usados e teto" || { falha "alerta sem GB"; cat "$T/alerta.txt"; }
grep -rq "$SEGREDO" "$T/out.txt" "$T/ext.log" "$T/alerta.txt" && falha "segredo vazou" || ok "sem segredo no alerta/log"
ls "$BACKUP_DIR"/*.enviado >/dev/null 2>&1 && falha "marcou .enviado" || ok "não marca .enviado"
limpa

monta_ambiente; cria_backup 1
head -c 2000000 /dev/zero > "$BACKUP_DIR/db-20260102-000000.sql.gz"
BUCKET_TETO_GB=1 FAKE_BUCKET_BYTES=999000000 bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 1 ] && ! enviou && [ -s "$T/alerta.txt" ] && ok "uso + novos arquivos acima do teto recusa" || falha "uso+novos rc=$rc"
limpa

monta_ambiente; cria_backup 1
BUCKET_TETO_GB=2 FAKE_BUCKET_BYTES=1500000000 bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 0 ] && enviou && ok "BUCKET_TETO_GB customizado respeitado" || falha "teto custom rc=$rc"
limpa

monta_ambiente; cria_backup 1
FAKE_RCLONE_SIZE_LIXO=1 bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 1 ] && ! enviou && [ -s "$T/alerta.txt" ] && ok "medição com lixo: recusa e alerta" || falha "lixo rc=$rc"
limpa

monta_ambiente; cria_backup 1
FAKE_RCLONE_FALHA=1 bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 1 ] && ! enviou && [ -s "$T/alerta.txt" ] && ok "medição falha: recusa e alerta" || falha "size erra rc=$rc"
limpa
[ "$FALHAS" = 0 ] || { echo "$FALHAS falha(s)"; exit 1; }; echo "tudo ok"
