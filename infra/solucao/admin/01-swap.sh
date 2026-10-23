#!/usr/bin/env bash
# Ação administrativa 01: swap de 4 GB em /swapfile + vm.swappiness=10. {AC-008.5}
# Idempotente: se já há swap ativo de >= 2 GB (em qualquer arquivo) não cria outro; se
# /swapfile já existe, reaproveita. Antes de criar, exige >= 5 GB livres.
# Uso: 01-swap.sh [--dry-run]
# (SWAPFILE, SYSCTL_FILE, FSTAB_FILE e SWAPS_FILE podem ser trocados — usado pelos testes.)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; *) erro "argumento desconhecido: $a"; exit 2 ;; esac; done
cabecalho; exige_root

SWAPFILE="${SWAPFILE:-/swapfile}"
SYSCTL_FILE="${SYSCTL_FILE:-/etc/sysctl.d/99-crm.conf}"
FSTAB_FILE="${FSTAB_FILE:-/etc/fstab}"
SWAPS_FILE="${SWAPS_FILE:-/proc/swaps}"
MIN_LIVRE_KB=5242880   # 5 GB

# há algum swap ativo com >= 2 GB (coluna Size de /proc/swaps está em KB)?
swap_grande() { awk 'NR>1 && $3>=2097152 {f=1} END{exit !f}' "$SWAPS_FILE" 2>/dev/null; }

if [ "$DRY" = 1 ]; then
  msg "[dry-run] (se já houver swap ativo >= 2 GB, nada é criado; exige >= 5 GB livres para criar)"
  roda fallocate -l 4G "$SWAPFILE"
  roda chmod 600 "$SWAPFILE"
  roda mkswap "$SWAPFILE"
  roda swapon "$SWAPFILE"
  msg "[dry-run] faria: acrescentar '$SWAPFILE none swap sw 0 0' ao $FSTAB_FILE (se ainda não estiver)"
elif swap_grande; then
  msg "já existe swap ativo de >= 2 GB — nada a criar."
else
  if [ ! -e "$SWAPFILE" ]; then
    livre_kb="$(df -Pk "$(dirname "$SWAPFILE")" | awk 'NR==2{print $4}')"
    if [ "${livre_kb:-0}" -lt "$MIN_LIVRE_KB" ]; then
      erro "espaço livre insuficiente: ${livre_kb:-0} KB; preciso de pelo menos $MIN_LIVRE_KB KB (5 GB). Nada foi criado."; exit 1
    fi
    roda fallocate -l 4G "$SWAPFILE"
    roda chmod 600 "$SWAPFILE"
    roda mkswap "$SWAPFILE"
  fi
  roda swapon "$SWAPFILE"
  if ! grep -qE "^$SWAPFILE[[:space:]]" "$FSTAB_FILE" 2>/dev/null; then
    printf '%s none swap sw 0 0\n' "$SWAPFILE" >> "$FSTAB_FILE"
  fi
fi

printf 'vm.swappiness=10\n' | grava "$SYSCTL_FILE" 644
roda sysctl -p "$SYSCTL_FILE"
msg "swap garantido e vm.swappiness=10."
