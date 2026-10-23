#!/usr/bin/env bash
# {AC-007.7/AC-008.5} 07-ferramentas-backup: instala age e rclone só se faltarem; Debian/Ubuntu apenas.
set -uo pipefail
source "$(dirname "$0")/_admin-lib.sh"
AC="$ADMIN/07-ferramentas-backup.sh"
admin_ambiente; export T; trap 'rm -rf "$T"' EXIT
# (hermético: usa FERRAMENTAS_BIN_DIR, então roda igual com ou sem age/rclone reais instalados)
fake_registra apt-get apt dpkg
fake apt-cache 'echo "apt-cache $*" >> "$CHAMADAS"; echo "$1 $2"; echo "  Candidate: ${FAKE_CANDIDATE:-1.2.3}"'
instala_fake() { # o apt-get falso "instala" criando o binário
  fake apt-get 'echo "apt-get $*" >> "$CHAMADAS"; for p in "$@"; do case "$p" in age|rclone) printf "#!/usr/bin/env bash\necho \"%s v1.2.3\"\n" "$p" > "$T/bin/$p"; chmod +x "$T/bin/$p";; esac; done'
}
instala_fake
export FERRAMENTAS_BIN_DIR="$T/bin"   # hermético: o age/rclone reais da máquina não contam
export OS_RELEASE_FILE="$T/os-release"
printf 'ID=ubuntu\nID_LIKE=debian\nVERSION_ID="26.04"\n' > "$OS_RELEASE_FILE"

echo "--dry-run não executa nada"
bash "$AC" --dry-run >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "nenhum apt chamado" bash -c "! grep -qE '^(apt-get|apt|dpkg) ' '$CHAMADAS'"
afirma "anuncia dry-run" grep -qi 'dry-run' "$T/o"

echo "instala age e rclone quando faltam"
: > "$CHAMADAS"
bash "$AC" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "apt-get install age" grep -qE 'apt-get install.* age' "$CHAMADAS"
afirma "apt-get install rclone" grep -qE 'apt-get install.* rclone' "$CHAMADAS"
afirma "imprime versão do age" grep -q 'age v1.2.3' "$T/o"
afirma "imprime versão do rclone" grep -q 'rclone v1.2.3' "$T/o"

echo "idempotente: já instalados -> não chama apt-get"
: > "$CHAMADAS"
bash "$AC" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "nenhum apt-get" bash -c "! grep -q '^apt-get' '$CHAMADAS'"
afirma "mensagem em português" grep -qi 'já' "$T/o"

echo "instala só o que falta"
rm "$T/bin/rclone"; : > "$CHAMADAS"
bash "$AC" >/dev/null 2>&1
afirma "instalou rclone" grep -qE 'apt-get install.* rclone' "$CHAMADAS"
afirma "não reinstalou age" bash -c "! grep -qE 'apt-get install.* age' '$CHAMADAS'"

echo "recusa fora de Debian/Ubuntu"
rm "$T/bin/age" "$T/bin/rclone"; : > "$CHAMADAS"
printf 'ID=fedora\nVERSION_ID=40\n' > "$OS_RELEASE_FILE"
bash "$AC" >"$T/o" 2>&1; rc=$?
afirma "sai != 0" test "$rc" -ne 0
afirma "mensagem em português citando Debian/Ubuntu" grep -qiE 'debian.*ubuntu|ubuntu.*debian' "$T/o"
afirma "nada instalado" bash -c "! grep -q '^apt-get' '$CHAMADAS'"
bash "$AC" --dry-run >"$T/o" 2>&1
afirma "dry-run também recusa fora de Debian/Ubuntu" test $? -ne 0

echo "pacote sem candidato no repositório -> falha clara, sem baixar da internet"
printf 'ID=ubuntu\n' > "$OS_RELEASE_FILE"; : > "$CHAMADAS"
FAKE_CANDIDATE="(none)" bash "$AC" >"$T/o" 2>&1; rc=$?
afirma "sai != 0" test "$rc" -ne 0
afirma "explica que não está nos repositórios" grep -qi 'repositório' "$T/o"
afirma "não chamou apt-get install" bash -c "! grep -q '^apt-get install' '$CHAMADAS'"
afirma "não usa curl/wget" bash -c "! grep -vE '^\s*#' '$AC' | grep -qE '\b(curl|wget)\b'"
fim admin-ferramentas-backup
