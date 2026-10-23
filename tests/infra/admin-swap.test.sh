#!/usr/bin/env bash
# {AC-008.5} 01-swap: não cria swap se já há ≥ 2 GB ativo; exige ≥ 5 GB livres; idempotente.
set -uo pipefail
source "$(dirname "$0")/_admin-lib.sh"
SW="$ADMIN/01-swap.sh"
admin_ambiente; trap 'rm -rf "$T"' EXIT
fake_registra swapon mkswap sysctl
fake fallocate 'echo "fallocate $*" >> "$CHAMADAS"; : > "$3"'
fake df 'printf "Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/x 100 1 %s 1%% /\n" "$FAKE_DF_KB"'
export SWAPFILE="$T/swapfile" SYSCTL_FILE="$T/99-crm.conf" FSTAB_FILE="$T/fstab" SWAPS_FILE="$T/swaps"
: > "$FSTAB_FILE"
CAB="Filename Type Size Used Priority"

echo "AC-008.5: já há swap de 4 GB (outro arquivo) -> não cria outro"
printf '%s\n/outro-swap file 4194304 0 -2\n' "$CAB" > "$SWAPS_FILE"; export FAKE_DF_KB=99999999
bash "$SW" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "não chamou fallocate" bash -c "! grep -q fallocate '$CHAMADAS'"
afirma "não chamou swapon" bash -c "! grep -q swapon '$CHAMADAS'"
afirma "fstab intocado" test ! -s "$FSTAB_FILE"
afirma "swappiness gravado" grep -q 'vm.swappiness=10' "$SYSCTL_FILE"

echo "AC-008.5: pouco espaço livre (< 5 GB) -> aborta"
printf '%s\n' "$CAB" > "$SWAPS_FILE"; : > "$CHAMADAS"; export FAKE_DF_KB=1000000
bash "$SW" >"$T/o" 2>&1; rc=$?
afirma "sai != 0" test "$rc" -ne 0
afirma "não criou o arquivo" bash -c "! grep -q fallocate '$CHAMADAS' && [ ! -e '$SWAPFILE' ]"
afirma "explica o espaço" grep -qi 'espa' "$T/o"

echo "AC-008.5: espaço suficiente -> cria 4G, ativa, fstab; reexecução não duplica"
: > "$CHAMADAS"; export FAKE_DF_KB=9000000
bash "$SW" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
afirma "fallocate -l 4G" grep -q 'fallocate -l 4G' "$CHAMADAS"
afirma "swapon chamado" grep -q 'swapon' "$CHAMADAS"
afirma "fstab com uma linha" test "$(grep -c "$SWAPFILE" "$FSTAB_FILE")" -eq 1
bash "$SW" >"$T/o" 2>&1
afirma "segunda execução não duplica o fstab" test "$(grep -c "$SWAPFILE" "$FSTAB_FILE")" -eq 1
afirma "segunda execução não recria o arquivo" test "$(grep -c fallocate "$CHAMADAS")" -eq 1

fim admin-swap
