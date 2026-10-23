#!/usr/bin/env bash
# Ação administrativa 07: instala `age` e `rclone` (usados pelo backup externo) SÓ se faltarem.
# {AC-007.7, AC-008.5} Só Debian/Ubuntu: usa o gerenciador de pacotes da distro (apt-get). Se o
# pacote não existir nos repositórios, falha com mensagem clara — nunca baixa binários da internet.
# Idempotente: ferramenta já instalada não é tocada. Ao fim imprime as versões, só para registro.
# Uso: 07-ferramentas-backup.sh [--dry-run]    (OS_RELEASE_FILE existe para os testes)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; *) erro "argumento desconhecido: $a"; exit 2 ;; esac; done
cabecalho; exige_root

OSR="${OS_RELEASE_FILE:-/etc/os-release}"
if [ ! -r "$OSR" ] && [ "$DRY" = 1 ]; then
  msg "[dry-run] AVISO: não consegui ler $OSR; a execução real só roda em Debian/Ubuntu."; distro=" debian "
else
  distro="$( . "$OSR" 2>/dev/null; printf "%s %s" "${ID:-}" "${ID_LIKE:-}")"
fi
case " $distro " in
  *" debian "*|*" ubuntu "*) ;;
  *) erro "esta ação só funciona em Debian/Ubuntu (distribuição detectada: ${distro:-desconhecida}). Instale age e rclone pelo gerenciador de pacotes da sua distribuição."; exit 1 ;;
esac

# FERRAMENTAS_BIN_DIR existe só para TESTE: procura e executa as ferramentas SÓ nessa pasta, para o age/rclone
# que já estão instalados na máquina não interferirem. Em produção a variável fica vazia e vale o PATH.
tem_ferramenta() { if [ -n "${FERRAMENTAS_BIN_DIR:-}" ]; then [ -x "$FERRAMENTAS_BIN_DIR/$1" ]; else command -v "$1" >/dev/null 2>&1; fi; }
rodar_ferramenta() { local p="$1"; shift; if [ -n "${FERRAMENTAS_BIN_DIR:-}" ]; then "$FERRAMENTAS_BIN_DIR/$p" "$@"; else "$p" "$@"; fi; }

FALTAM=()
for p in age rclone; do
  if tem_ferramenta "$p"; then msg "$p já está instalado; nada a fazer."; else FALTAM+=("$p"); fi
done

if [ "${#FALTAM[@]}" -gt 0 ]; then
  if [ "$DRY" != 1 ]; then
    for p in "${FALTAM[@]}"; do
      if ! apt-cache policy "$p" 2>/dev/null | grep -E 'Candidate:' | grep -qvE '\(none\)'; then
        erro "o pacote '$p' não foi encontrado nos repositórios desta máquina (rode 'apt-get update' ou habilite o repositório universe). Nada foi instalado."; exit 1
      fi
    done
  fi
  roda apt-get install -y "${FALTAM[@]}"
fi

if [ "$DRY" != 1 ]; then
  rodar_ferramenta age --version 2>&1 | head -n 1 || true
  rodar_ferramenta rclone version 2>&1 | head -n 1 || true
fi
msg "ferramentas do backup externo garantidas (age, rclone)."
