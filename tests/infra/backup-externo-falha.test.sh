#!/usr/bin/env bash
# T-015: AC-007.5 (+ round-trip de restauração, prepara AC-007.4)
. "$(dirname "${BASH_SOURCE[0]}")/_backup-lib.sh"
echo "backup-externo: falha, alerta e restauração"
monta_ambiente; cria_backup 2
FAKE_RCLONE_FALHA=1 bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 1 ] && ok "falha de envio -> exit 1" || falha "rc=$rc"
[ -s "$T/alerta.txt" ] && ok "AC-007.5 alerta disparado" || falha "AC-007.5 sem alerta"
grep -rq "$SEGREDO" "$T/out.txt" "$T/ext.log" "$T/alerta.txt" && falha "segredo vazou (saída/log/alerta)" || ok "sem segredo em saída, log e alerta"
limpa
monta_ambiente; cria_backup 1
FAKE_RCLONE_CORROMPE=1 bash "$SCRIPT" >"$T/out.txt" 2>&1; rc=$?
[ "$rc" = 1 ] && [ -s "$T/alerta.txt" ] && ok "AC-007.5 verificação divergente -> exit 1 + alerta" || falha "divergência rc=$rc"
ls "$BACKUP_DIR"/*.enviado >/dev/null 2>&1 && falha "marcou .enviado sem verificar" || ok "não marca .enviado quando falha"
limpa
monta_ambiente; cria_backup 1
bash "$SCRIPT" >/dev/null 2>&1
echo "AGE-SECRET-KEY-FALSA" > "$T/id.txt"; mkdir "$T/saida"
alvo="db-20260101-000000.sql.gz"
bash "$RESTAURA" --objeto "$alvo.age" --identidade "$T/id.txt" --destino "$T/saida" >"$T/r.txt" 2>&1; rc=$?
[ "$rc" = 0 ] && cmp -s "$T/saida/$alvo" "$BACKUP_DIR/$alvo" && ok "round-trip devolve o original byte a byte" || { falha "round-trip rc=$rc"; cat "$T/r.txt"; }
bash "$RESTAURA" --objeto "$alvo.age" --identidade "$T/id.txt" --destino "$T/saida" >/dev/null 2>&1
[ "$?" != 0 ] && ok "não sobrescreve" || falha "sobrescreveu"
limpa
monta_ambiente
bash "$RESTAURA" --objeto "../x.age" --identidade "$T/id.txt" --destino "$T" >/dev/null 2>&1; r1=$?
bash "$RESTAURA" --objeto "a/b.age" --identidade "$T/id.txt" --destino "$T" >/dev/null 2>&1; r2=$?
[ "$r1" = 2 ] && [ "$r2" = 2 ] && ok "restaurar recusa --objeto com / ou .." || falha "traversal $r1 $r2"
echo "SEGREDO=1" > "$T/env"
STAT_CMD="echo 644" BACKUP_ENV_FILE="$T/env" bash "$RESTAURA" --objeto x.age --identidade "$T/env" --destino "$T" >/dev/null 2>&1
[ "$?" = 2 ] && ok "restaurar recusa env com permissão aberta" || falha "restaurar perm"
limpa
[ "$FALHAS" = 0 ] || { echo "$FALHAS falha(s)"; exit 1; }; echo "tudo ok"
