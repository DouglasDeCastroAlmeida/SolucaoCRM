#!/usr/bin/env bash
# Sondas executáveis contra a VPS (somente LEITURA). Cada sonda imprime PASS/FAIL por critério
# e grava a evidência (sem segredos) em docs/solucao-crm/evidencias/001-fundacao/.
#
# Uso:  bash tests/infra/vps/sondas.sh <sonda>...      (ex.: medicao swap firewall isolamento-dev)
# Env:  VPS_HOST (padrão: o IP do DNS), VPS_USER (padrão: root), SSH_CMD (para testes)
#
# Só lê: nenhuma sonda altera a VPS. Quem altera são os scripts de infra/solucao/admin.
set -u
VPS_HOST="${VPS_HOST:-179.199.155.156}"
VPS_USER="${VPS_USER:-root}"
EVID_DIR="${EVID_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/docs/solucao-crm/evidencias/001-fundacao}"
LIMIAR_RAM_LIVRE_MB="${LIMIAR_RAM_LIVRE_MB:-2048}"
mkdir -p "$EVID_DIR"

rssh() { ${SSH_CMD:-ssh -o BatchMode=yes -o ConnectTimeout=10} "$VPS_USER@$VPS_HOST" "$@"; }
falhas=0
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; falhas=$((falhas + 1)); }
checa() { # checa <rotulo> <comando...>
  local r="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$r"; else fail "$r"; fi
}
registra() { # registra <arquivo> (stdin)
  { printf '# %s — %s\n' "$1" "$(date -u +%Y-%m-%dT%H:%MZ)"; cat; } > "$EVID_DIR/$1"
}

# --- T-021 / AC-009.5: medir a VPS antes de instalar e comparar com a estimativa (9–11 GB) -------
sonda_medicao() {
  echo "== medição (AC-009.5)"
  local out
  out="$(rssh 'free -m | awk "/^Mem:/{print \"total_mb=\"\$2\" usada_mb=\"\$3\" disponivel_mb=\"\$7}";
               nproc | sed "s/^/cpus=/"; df -BG / | awk "NR==2{gsub(\"G\",\"\",\$2);gsub(\"G\",\"\",\$3);print \"disco_total_gb=\"\$2\" disco_usado_gb=\"\$3}";
               docker ps --format "{{.Names}}" | wc -l | sed "s/^/containers=/"' 2>/dev/null)"
  [ -n "$out" ] || { fail "não consegui medir (SSH falhou)"; return; }
  printf '%s\n' "$out" | registra medicao-vps.txt
  local disp
  disp="$(printf '%s\n' "$out" | tr ' ' '\n' | sed -n 's/^disponivel_mb=//p')"
  printf '  %s\n' $out
  printf '  estimativa do Grill: 9–11 GB usados em produção+hml+claude; folga necessária >= %s MB\n' "$LIMIAR_RAM_LIVRE_MB"
  [ "${disp:-0}" -ge $((11 * 1024 + LIMIAR_RAM_LIVRE_MB)) ] && pass "RAM disponível agora (${disp} MB) cobre a estimativa máxima (11 GB) com folga de 2 GB" \
    || fail "RAM disponível agora (${disp:-?} MB) NÃO cobre estimativa + folga"
}

# --- AC-009.1: swap de 4 GB ativo e persistente -----------------------------------------------
sonda_swap() {
  echo "== swap (AC-009.1)"
  local swap_mb fstab
  swap_mb="$(rssh "free -m | awk '/^Swap:/{print \$2}'" 2>/dev/null)"
  fstab="$(rssh "grep -cE '^[^#].*[[:space:]]swap[[:space:]]' /etc/fstab" 2>/dev/null)"
  printf 'swap_total_mb=%s fstab_linhas_swap=%s\n' "${swap_mb:-?}" "${fstab:-?}" | registra swap.txt
  [ "${swap_mb:-0}" -ge 3900 ] && pass "swap ativo >= 3900 MB (${swap_mb} MB)" || fail "swap ativo >= 3900 MB (${swap_mb:-?} MB)"
  [ "${fstab:-0}" -ge 1 ] && pass "swap persistente (/etc/fstab)" || fail "swap persistente (/etc/fstab)"
}

# --- AC-010.2: ufw só com 22, 80, 443/tcp e 443/udp; 8000 fechada ------------------------------
sonda_firewall() {
  echo "== firewall (AC-010.2)"
  local regras
  regras="$(rssh 'ufw status | grep -E "ALLOW" | awk "{print \$1}" | sort -u | tr "\n" " "' 2>/dev/null)"
  printf 'regras_ufw=%s\n' "$regras" | registra firewall.txt
  printf '  regras: %s\n' "$regras"
  local extra
  extra="$(printf '%s\n' $regras | grep -vxE '22/tcp|80/tcp|443/tcp|443/udp|22|80|443|22/tcp\(v6\)|80/tcp\(v6\)|443/tcp\(v6\)|443/udp\(v6\)' | tr '\n' ' ')"
  [ -z "$extra" ] && pass "só 22, 80, 443/tcp e 443/udp liberadas" || fail "regras além do permitido: $extra"
  printf '%s' "$regras" | grep -q '8000' && fail "porta 8000 ainda liberada" || pass "porta 8000 fechada"
}

# --- AC-008.1 / AC-008.2 / AC-008.4: isolamento do usuário dev e do deploy ---------------------
sonda_isolamento_dev() {
  echo "== isolamento (AC-008.1, AC-008.2, AC-008.4)"
  # AC-008.1: dev não consegue `docker ps`
  rssh "su -s /bin/bash dev -c 'docker ps' >/dev/null 2>&1" && fail "AC-008.1: dev consegue rodar docker ps" || pass "AC-008.1: dev NÃO roda docker ps"
  # AC-008.2: dev não lê /opt/crm-prod nem .env
  local lidos
  lidos="$(rssh "for d in /opt/crm-prod /opt/crm-hml; do [ -e \$d ] || continue; su -s /bin/bash dev -c \"ls \$d >/dev/null 2>&1 && echo LEU:\$d\"; done" 2>/dev/null)"
  [ -z "$lidos" ] && pass "AC-008.2: dev NÃO lê /opt/crm-prod nem /opt/crm-hml" || fail "AC-008.2: $lidos"
  rssh 'id deploy >/dev/null 2>&1' && pass "usuário deploy existe" || fail "usuário deploy existe"
  # AC-008.4: authorized_keys do deploy restrito (command=, restrict/no-pty) e de dono root
  local ak
  ak="$(rssh 'cat /home/deploy/.ssh/authorized_keys 2>/dev/null | cut -c1-120' 2>/dev/null)"
  printf '%s' "$ak" | grep -q 'command="' && printf '%s' "$ak" | grep -qE 'restrict|no-pty' \
    && pass "AC-008.4: chave do deploy tem command= e restrições" || fail "AC-008.4: chave do deploy sem command=/restrict"
  [ "$(rssh 'stat -c %U /home/deploy/.ssh/authorized_keys 2>/dev/null')" = "root" ] \
    && pass "AC-008.4: authorized_keys pertence ao root" || fail "AC-008.4: authorized_keys NÃO pertence ao root"
  # crm-status existe, é de root e o dev o usa
  rssh 'su -s /bin/bash dev -c "sudo -n /usr/local/bin/crm-status ps" >/dev/null 2>&1' \
    && pass "AC-008.3: dev consegue 'crm-status ps' (sudo exato)" || fail "AC-008.3: dev NÃO consegue 'crm-status ps'"
}

[ "$#" -ge 1 ] || { echo "uso: $0 <sonda>... (medicao swap firewall isolamento-dev)"; exit 2; }
for s in "$@"; do
  fn="sonda_${s//-/_}"
  if declare -F "$fn" >/dev/null; then "$fn"; else echo "sonda desconhecida: $s"; falhas=$((falhas + 1)); fi
done
echo
[ "$falhas" -eq 0 ] && echo "sondas: TUDO OK" || { echo "sondas: $falhas falha(s)"; exit 1; }
