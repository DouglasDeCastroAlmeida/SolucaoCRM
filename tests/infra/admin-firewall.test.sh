#!/usr/bin/env bash
# {AC-008.5} 02-firewall: libera a porta REAL do sshd antes de ligar o ufw; aborta sem ela.
set -uo pipefail
source "$(dirname "$0")/_admin-lib.sh"
FW="$ADMIN/02-firewall.sh"
trap 'rm -rf "$T"' EXIT

novo() { # novo <porta-do-sshd|-> <registra-show-added: 1|0>
  admin_ambiente; ADDED="$T/added"; : > "$ADDED"; export ADDED
  fake ufw 'echo "ufw $*" >> "$CHAMADAS"
case "$1" in allow) echo "ufw allow $2" >> "$ADDED" ;; esac
if [ "$1 $2" = "show added" ] && [ "'"$2"'" = 1 ]; then echo "Added user rules"; cat "$ADDED"; fi'
  if [ "$1" != - ]; then fake sshd '[ "$1" = -T ] && printf "port '"$1"'\nlistenaddress 0.0.0.0\n"; exit 0'
  else fake sshd 'exit 0'; fi
  fake ss 'exit 0'
}
ordem_ok() { # ordem_ok <porta>: allow <porta>/tcp aparece antes de enable
  local a e; a="$(grep -n "allow $1/tcp" "$CHAMADAS" | head -1 | cut -d: -f1)"; e="$(grep -n 'enable' "$CHAMADAS" | head -1 | cut -d: -f1)"
  [ -n "$a" ] && [ -n "$e" ] && [ "$a" -lt "$e" ]
}

echo "AC-008.5: sshd na 2222 -> libera 2222 (e só então liga)"
novo 2222 1
bash "$FW" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "libera 2222/tcp antes do enable" ordem_ok 2222
afirma "libera 80, 443/tcp e 443/udp" bash -c "grep -q 'allow 80/tcp' '$CHAMADAS' && grep -q 'allow 443/tcp' '$CHAMADAS' && grep -q 'allow 443/udp' '$CHAMADAS'"
afirma "remove a regra da 8000" grep -qE 'delete allow 8000' "$CHAMADAS"
afirma "nunca faz reset" bash -c "! grep -q reset '$CHAMADAS'"
rm -rf "$T"

echo "AC-008.5: --ssh-port explícito soma à detecção"
novo 2222 1
bash "$FW" --ssh-port 2200 >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "libera 2200 antes do enable" ordem_ok 2200
afirma "libera 2222 antes do enable" ordem_ok 2222
rm -rf "$T"

echo "AC-008.5: SSH_PORT por variável"
novo - 1
SSH_PORT=2022 bash "$FW" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "libera 2022 antes do enable" ordem_ok 2022
rm -rf "$T"

echo "AC-008.5: sem porta detectável -> aborta antes do enable"
novo - 1
bash "$FW" >"$T/o" 2>&1; rc=$?
afirma "sai != 0" test "$rc" -ne 0
afirma "não habilitou o ufw" bash -c "! grep -q enable '$CHAMADAS'"
afirma "explica o motivo" grep -qi 'porta' "$T/o"
rm -rf "$T"

echo "AC-008.5: ufw show added sem a porta -> aborta antes do enable"
novo 2222 0
bash "$FW" >"$T/o" 2>&1; rc=$?
afirma "sai != 0" test "$rc" -ne 0
afirma "não habilitou o ufw" bash -c "! grep -q enable '$CHAMADAS'"
rm -rf "$T"

echo "AC-008.5: porta inválida é recusada"
novo 2222 1
bash "$FW" --ssh-port 99999 >"$T/o" 2>&1; afirma "recusa 99999" test "$?" -ne 0
bash "$FW" --ssh-port 'a;b' >"$T/o" 2>&1; afirma "recusa texto" test "$?" -ne 0
afirma "não habilitou o ufw" bash -c "! grep -q enable '$CHAMADAS'"

fim admin-firewall
