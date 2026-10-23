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

echo "AC-010.2: poda de regras ALLOW antigas (ufw falso com 13+ regras, incluindo (v6))"
novo_antigo() { # novo_antigo <porta-do-sshd>
  admin_ambiente; RULES="$T/rules"; export RULES
  printf '%s\n' 22 80 443 3000 3001 3010 3011 3334 5173 5565 8000 8011 8080 8082 8088 9000 80/tcp > "$RULES"
  fake ufw 'echo "ufw $*" >> "$CHAMADAS"
case "$1" in
  allow) grep -qxF "$2" "$RULES" || echo "$2" >> "$RULES" ;;
  --force) if [ "$2" = delete ]; then grep -vxF "$4" "$RULES" > "$RULES.n"; mv "$RULES.n" "$RULES"; fi ;;
  status) echo "Status: active"; echo "To  Action  From"; while read -r r; do echo "$r                         ALLOW       Anywhere"; echo "$r (v6)                    ALLOW       Anywhere (v6)"; done < "$RULES" ;;
  show) echo "Added user rules (see '"'"'ufw status'"'"' for running firewall):"; while read -r r; do echo "ufw allow $r"; done < "$RULES" ;;
esac'
  fake sshd '[ "$1" = -T ] && printf "port '"$1"'\n"; exit 0'
  fake ss 'exit 0'
}
portas_restantes() { sed 's#/.*##' "$RULES" | sort -un | tr '\n' ' '; }

novo_antigo 22
bash "$FW" --manter 9000 >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "ficam só 22, 80, 443 e a mantida 9000" test "$(portas_restantes)" = "22 80 443 9000 "
afirma "remove por spec exata (nunca por número)" bash -c "grep -q 'delete allow 3000' '$CHAMADAS' && ! grep -qE 'delete [0-9]+\$' '$CHAMADAS'"
afirma "nunca remove SSH, 80, 443 nem a mantida" bash -c "! grep -E 'delete allow (22|80|443|9000)(/|\$)' '$CHAMADAS'"
afirma "nunca reset nem disable" bash -c "! grep -qE 'reset|disable' '$CHAMADAS'"
afirma "liga o ufw" grep -q 'enable' "$CHAMADAS"
afirma "avisa que o Docker ignora o ufw (9000)" grep -q 'portas publicadas pelo Docker ignoram o ufw' "$T/o"
afirma "lista o que removeu" grep -q '3000' "$T/o"
: > "$CHAMADAS"; bash "$FW" --manter 9000 >"$T/o" 2>&1
afirma "segunda execução não remove nada" bash -c "! grep -q 'delete' '$CHAMADAS'"
rm -rf "$T"

novo_antigo 22
bash "$FW" >"$T/o" 2>&1
afirma "sem --manter a 9000 também sai" test "$(portas_restantes)" = "22 80 443 "
rm -rf "$T"

novo_antigo 2222
echo 2222 >> "$RULES"
bash "$FW" --manter 9000 --manter 8088 >"$T/o" 2>&1
afirma "SSH na 2222 nunca é removida; 22 antiga sai" test "$(portas_restantes)" = "80 443 2222 8088 9000 "
rm -rf "$T"

novo_antigo 22
bash "$FW" --dry-run --manter 9000 >"$T/o" 2>&1; rc=$?
afirma "dry-run sai 0" test "$rc" -eq 0
afirma "dry-run não removeu nada" bash -c "! grep -q 'delete' '$CHAMADAS'"
afirma "dry-run lista o que seria removido" grep -qiE 'removeria.*3000' "$T/o"
afirma "dry-run lista o que ficaria" grep -qiE 'ficaria.*9000' "$T/o"

fim admin-firewall
