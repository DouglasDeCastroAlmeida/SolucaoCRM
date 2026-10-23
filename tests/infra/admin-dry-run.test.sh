#!/usr/bin/env bash
# T-018 {AC-008.5}: toda ação administrativa é script numerado em infra/solucao/admin/,
# aceita --dry-run (nada executa) e é idempotente; comandos perigosos não existem fora de admin/.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"
ADMIN="$REPO_ROOT/infra/solucao/admin"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/cwd"; export CHAMADAS="$T/chamadas.log"; : > "$CHAMADAS"
for c in useradd usermod groupadd gpasswd chpasswd ufw fallocate swapon swapoff mkswap visudo crontab docker systemctl sysctl chown chmod sudo rsync; do
  printf '#!/usr/bin/env bash\necho "%s $*" >> "$CHAMADAS"\nexit 99\n' "$c" > "$T/bin/$c"; chmod +x "$T/bin/$c"
done
export PATH="$T/bin:$PATH"
# leitura de regras (status / show added) é permitida em --dry-run; qualquer outra chamada ao ufw falha
printf '#!/usr/bin/env bash
case "$1" in status|show) exit 0 ;; esac
echo "ufw $*" >> "$CHAMADAS"
exit 99
' > "$T/bin/ufw"; chmod +x "$T/bin/ufw"
printf 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoFKLguWtwzTiTUXZHqBZxcqFAB pipeline@ci\n' > "$T/chave.pub"
export VAVA_DIR="$T/vava" BACKUPS_DIR="$T/backups"; mkdir -p "$VAVA_DIR"; echo x > "$VAVA_DIR/a"

echo "AC-008.5: ações numeradas e esperadas"
mapfile -t ACOES < <(ls "$ADMIN"/*.sh 2>/dev/null | grep -v '/_[^/]*$')
for esperado in 01-swap 02-firewall 03-usuarios 04-mover-vava 05-cron 06-instalar-scripts; do
  afirma "AC-008.5: existe admin/$esperado.sh" test -f "$ADMIN/$esperado.sh"
done
for f in "${ACOES[@]}"; do
  n="$(basename "$f")"
  afirma "AC-008.5: '$n' segue o padrão NN-nome.sh" bash -c "[[ '$n' =~ ^[0-9]{2}-[a-z0-9-]+\.sh\$ ]]"
  afirma "AC-008.5: '$n' usa set -euo pipefail" grep -q '^set -euo pipefail' "$f"
done

echo "AC-008.5: --dry-run não executa nada e é idempotente"
for f in "${ACOES[@]}"; do
  n="$(basename "$f")"; args=(--dry-run); [ "$n" != 03-usuarios.sh ] || args+=("$T/chave.pub")
  : > "$CHAMADAS"
  (cd "$T/cwd" && find . | sort > "$T/antes1"; bash "$f" "${args[@]}" >"$T/o1" 2>&1; echo $? > "$T/rc1"; find . | sort > "$T/depois1")
  (cd "$T/cwd" && bash "$f" "${args[@]}" >"$T/o2" 2>&1; echo $? > "$T/rc2")
  afirma "AC-008.5: $n dry-run sai 0" test "$(cat "$T/rc1")" = 0
  afirma "AC-008.5: $n dry-run não chamou comando administrativo" test ! -s "$CHAMADAS"
  afirma "AC-008.5: $n dry-run não criou arquivos" cmp -s "$T/antes1" "$T/depois1"
  afirma "AC-008.5: $n dry-run idempotente (mesma saída)" cmp -s "$T/o1" "$T/o2"
  afirma "AC-008.5: $n dry-run anuncia o que faria" grep -qi 'dry-run' "$T/o1"
  afirma "AC-008.5: $n tem mensagens em português" grep -qiE 'faria|criar|instal|garant|copi|ativ|permit' "$T/o1"
done
[ ! -s "$CHAMADAS" ] || echo "  chamadas indevidas: $(cat "$CHAMADAS")"

echo "AC-008.5: ordem do firewall (22 antes de ligar)"
bash "$ADMIN/02-firewall.sh" --dry-run > "$T/fw" 2>&1
l22="$(grep -n '22/tcp' "$T/fw" | head -1 | cut -d: -f1)"; lon="$(grep -nE 'ufw (--force )?enable' "$T/fw" | head -1 | cut -d: -f1)"
afirma "AC-008.5: libera 22 antes de habilitar o ufw" bash -c "[ -n '$l22' ] && [ -n '$lon' ] && [ '$l22' -lt '$lon' ]"
afirma "AC-008.5: libera 80, 443/tcp e 443/udp" bash -c "grep -q '80/tcp' '$T/fw' && grep -q '443/tcp' '$T/fw' && grep -q '443/udp' '$T/fw'"
afirma "AC-008.5: nunca faz reset do ufw" bash -c "! grep -vE '^\s*#' '$ADMIN/02-firewall.sh' | grep -qE 'ufw.* reset'"

echo "AC-008.5: comandos perigosos só dentro de admin/ (allowlist explícita)"
# docker é legítimo onde o script É a operação com containers (deploy, backup, restauro, leitura de status).
declare -A PERMITIDO=( [deploy.sh]=docker [backup-externo.sh]=docker [restaurar-backup.sh]=docker [crm-status.sh]=docker [medir-memoria.sh]=docker )
PERIGO='\b(useradd|usermod|groupadd|gpasswd|chpasswd|ufw|swapon|swapoff|mkswap|fallocate|visudo|crontab|docker|systemctl)\b'
for f in "$REPO_ROOT"/infra/solucao/*.sh; do
  n="$(basename "$f")"
  achados="$(grep -vE '^\s*#' "$f" | grep -oE "$PERIGO" | sort -u | grep -vxF "${PERMITIDO[$n]:-__nada__}" || true)"
  afirma "AC-008.5: $n sem comando administrativo fora da allowlist" test -z "$achados"
  [ -z "$achados" ] || echo "    achou: $achados"
  afirma "AC-008.5: $n sem chmod/chown em /opt" bash -c "! grep -vE '^\s*#' '$f' | grep -qE '(chmod|chown)[^|;&]*/opt'"
done

echo
if [ "$FALHAS" -eq 0 ]; then echo "admin-dry-run: OK"; else echo "admin-dry-run: $FALHAS falha(s)"; exit 1; fi
