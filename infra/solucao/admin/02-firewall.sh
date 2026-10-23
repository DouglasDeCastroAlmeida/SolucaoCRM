#!/usr/bin/env bash
# Ação administrativa 02: firewall (ufw). {AC-008.5}
# Libera TODAS as portas reais do sshd + 80/tcp, 443/tcp e 443/udp; remove a regra da 8000.
# A(s) porta(s) do sshd vêm de: --ssh-port N (repetível), variável SSH_PORT, `sshd -T` e
# `ss -tlnp` (união das fontes). ORDEM IMPORTA: toda porta do ssh é liberada e CONFERIDA em
# `ufw show added` ANTES de ligar o ufw; sem porta detectada, ou com porta não registrada,
# a ação ABORTA sem habilitar o ufw. Nunca faz `ufw reset`.
# ATENÇÃO: portas PUBLICADAS pelo Docker (ports: "8000:8000") passam por regras do
# próprio Docker e IGNORAM o ufw. Fechar a 8000 de verdade exige tirar o `ports:` do
# compose (fatia 6) — esta ação só remove a regra do ufw.
# Uso: 02-firewall.sh [--dry-run] [--ssh-port N]...
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
export PATH="$PATH:/usr/sbin:/sbin"
PORTAS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --ssh-port) [ $# -ge 2 ] || { erro "uso: --ssh-port N"; exit 2; }; PORTAS+=("$2"); shift ;;
    *) erro "argumento desconhecido: $1"; exit 2 ;;
  esac
  shift
done
cabecalho; exige_root
[ -z "${SSH_PORT:-}" ] || PORTAS+=("$SSH_PORT")
if command -v sshd >/dev/null 2>&1; then
  while IFS= read -r p; do [ -z "$p" ] || PORTAS+=("$p"); done < <(sshd -T 2>/dev/null | awk '/^port /{print $2}' || true)
fi
if command -v ss >/dev/null 2>&1; then
  while IFS= read -r p; do [ -z "$p" ] || PORTAS+=("$p"); done < <(ss -tlnp 2>/dev/null | awk '/sshd/{n=split($4,a,":"); print a[n]}' || true)
fi
for p in "${PORTAS[@]}"; do
  [[ "$p" =~ ^[0-9]{1,5}$ ]] && [ "$p" -ge 1 ] && [ "$p" -le 65535 ] || { erro "porta SSH inválida: $p"; exit 2; }
done
if [ "${#PORTAS[@]}" -eq 0 ]; then
  if [ "$DRY" = 1 ]; then
    msg "[dry-run] aviso: nenhuma porta do sshd detectada; a execução real ABORTARIA. Plano abaixo usa 22 como exemplo."
    PORTAS=(22)
  else
    erro "não consegui descobrir a porta do sshd (sshd -T / ss); informe com --ssh-port N. O ufw NÃO foi ligado."; exit 1
  fi
fi
mapfile -t PORTAS < <(printf '%s\n' "${PORTAS[@]}" | sort -un)

if [ "$DRY" != 1 ] && ! command -v ufw >/dev/null 2>&1; then
  erro "ufw não está instalado (apt install ufw). Nada foi alterado."; exit 1
fi

for p in "${PORTAS[@]}"; do roda ufw allow "$p/tcp"; done
roda ufw allow 80/tcp
roda ufw allow 443/tcp
roda ufw allow 443/udp
if [ "$DRY" != 1 ]; then
  adicionadas="$(ufw show added)"
  for p in "${PORTAS[@]}"; do
    grep -qE "allow $p(/tcp)?\$" <<<"$adicionadas" || { erro "a porta $p/tcp não consta em 'ufw show added'; o ufw NÃO foi ligado."; exit 1; }
  done
fi
roda ufw --force delete allow 8000/tcp || true
roda ufw --force delete allow 8000 || true
roda ufw --force enable
msg "firewall garantido (ssh: ${PORTAS[*]}; 80, 443/tcp, 443/udp; 8000 sem regra)."
