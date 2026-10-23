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
  # PORTAS_MANTIDAS: exceção DECLARADA pelo dono (ex.: 9000 do Portainer, decisão pendente). Aparece como AVISO,
  # nunca some: a evidência registra a exceção em vez de fingir que o firewall está no estado ideal.
  local mant="" restante=""
  for p in $extra; do
    case " ${PORTAS_MANTIDAS:-} " in *" ${p%%/*} "*) mant="$mant $p" ;; *) restante="$restante $p" ;; esac
  done
  [ -n "$mant" ] && printf '  AVISO exceção declarada pelo dono (decisão pendente):%s
' "$mant"
  [ -z "$restante" ] && pass "só 22, 80, 443/tcp e 443/udp liberadas (fora as exceções declaradas)" || fail "regras além do permitido:$restante"
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

# --- AC-010.1 / AC-010.4: DNS (consulta por HTTPS ao Google: independe do resolvedor local) ------
sonda_dns() {
  echo "== dns (AC-010.1, AC-010.4)"
  local dom="${DOMINIO_CRM:-corretora.io}" h r st ip saida=""
  for h in app hml sorteado-$RANDOM; do
    r="$(curl -s --max-time 10 "https://dns.google/resolve?name=$h.$dom&type=A")"
    ip="$(printf '%s' "$r" | grep -oE '"data":"[0-9.]+"' | head -1 | cut -d'"' -f4)"
    saida="$saida $h.$dom=$ip"
    [ "$ip" = "$VPS_HOST" ] && pass "AC-010.1: $h.$dom aponta para $VPS_HOST" || fail "AC-010.1: $h.$dom NÃO aponta para $VPS_HOST (lido: ${ip:-nada})"
  done
  # AC-010.4: nenhum registro antigo aponta para fora do novo Caddy; api vira só curinga (ou some)
  ip="$(curl -s --max-time 10 "https://dns.google/resolve?name=api.$dom&type=A" | grep -oE '"data":"[0-9.]+"' | head -1 | cut -d'"' -f4)"
  { [ -z "$ip" ] || [ "$ip" = "$VPS_HOST" ]; } && pass "AC-010.4: api.$dom some ou cai no curinga que aponta ao novo Caddy" || fail "AC-010.4: api.$dom aponta para $ip"
  printf 'resolucoes:%s
' "$saida" | registra dns.txt
}

# --- AC-001.1/.2/.3/.5 e AC-010.3: dono único de 80/443, vava no ar, nenhuma outra porta aberta ----
aberta() { timeout 3 bash -c "exec 3<>/dev/tcp/$VPS_HOST/$1" 2>/dev/null; }   # a porta aceita conexão vinda de FORA? (3 s: o ufw descarta em silêncio)
sonda_portas() {
  echo "== portas e vava (AC-001.1, .2, .3, .5; AC-010.3)"
  local pubs outros="" p fora total
  pubs="$(rssh 'docker ps --format "{{.Names}} {{.Ports}}" | grep -E "0\.0\.0\.0:(80|443)->" | cut -d" " -f1 | sort -u | tr "\n" " "' 2>/dev/null)"
  [ "$pubs" = "crm-prod-caddy-1 " ] && pass "AC-001.1: só crm-prod-caddy-1 publica 80/443" || fail "AC-001.1: donos de 80/443: $pubs"
  [ "$(rssh 'docker port valesca_almeida_website | wc -l' 2>/dev/null)" = "0" ] && pass "AC-001.3: o container do vava não publica porta nenhuma" || fail "AC-001.3: o vava publica portas"
  for p in 3000 3001 5432 6543 8000 8080 8081 8082 9000 9443 6379 54321 54322 54323; do aberta "$p" && outros="$outros $p"; done
  [ -z "$outros" ] && pass "AC-010.3/AC-002.3: nenhuma porta de serviço (3000, 5432, 8000, 9000...) aceita conexão de fora" || fail "AC-010.3: portas ABERTAS de fora:$outros"
  for u in https://valescaalmeida.com/ https://www.valescaalmeida.com/; do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$u")" = 200 ] && pass "AC-001.2: $u responde 200" || fail "AC-001.2: $u não respondeu 200"
  done
  local med="$EVID_DIR/janela-de-troca-medida-de-fora.log"
  if [ -f "$med" ]; then
    total="$(wc -l < "$med")"; fora="$(grep -vc 'vava=200' "$med" || true)"
    echo "  info  AC-001.5: na janela real, $fora de $total consultas (1 por segundo) falharam, ~${fora} s fora do ar"
    [ "$fora" -le 5 ] && pass "AC-001.5: indisponibilidade medida <= 5 s (o critério admite 300 s)" || fail "AC-001.5: $fora s fora do ar"
  else
    fail "AC-001.5: sem a medição da janela ($med)"
  fi
  rssh 'ss -ltnp | grep -E ":(80|443) " | cut -c1-110 | sort -u' | registra portas.txt
}

# --- AC-002.1/.2/.3/.4: produção no ar -------------------------------------------------------
sonda_producao() {
  echo "== produção (AC-002.1, .2, .3, .4)"
  local u="https://app.${DOMINIO_CRM:-corretora.io}" c
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$u/")";    [ "$c" = 200 ] && pass "AC-002.1: $u/ responde 200"    || fail "AC-002.1: $u/ respondeu $c"
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$u/app")"; [ "$c" = 307 ] && pass "AC-002.1: $u/app responde 307" || fail "AC-002.1: $u/app respondeu $c"
  c="$(curl -s --max-time 20 "$u/api/v1/health")"
  printf '%s' "$c" | grep -qE '"status":"(healthy|degraded)"' && pass "AC-002.2: /api/v1/health = $(printf '%s' "$c" | grep -oE '"status":"[a-z]+"' | head -1)" || fail "AC-002.2: health inesperado: $(printf '%s' "$c" | cut -c1-80)"
  if curl -s --max-time 20 "$u/studio" | grep -qi "supabase studio"; then fail "AC-002.3: Studio acessível em /studio"; else pass "AC-002.3: $u/studio não expõe o Studio"; fi
  [ "$(rssh 'docker ps --format "{{.Names}}" | grep -c voice-agent || true' 2>/dev/null)" = "0" ] && pass "AC-002.4: voice-agent não está rodando" || fail "AC-002.4: voice-agent rodando"
  rssh 'docker ps --format "{{.Names}} {{.Status}}" | grep crm-prod | sort' | registra producao-containers.txt
}

sonda_homologacao() {
  echo "== homologação (AC-003.1, .2, .3)"
  local u="https://hml.${DOMINIO_CRM:-corretora.io}" c
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 90 "$u/")";    [ "$c" = 200 ] && pass "AC-003.1: $u/ responde 200"    || fail "AC-003.1: $u/ respondeu $c"
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 90 "$u/app")"; [ "$c" = 307 ] && pass "AC-003.1: $u/app responde 307" || fail "AC-003.1: $u/app respondeu $c"
  [ "$(rssh 'docker ps --format "{{.Names}}" | grep -c "^crm-hml-caddy" || true' 2>/dev/null)" = "0" ] && pass "AC-003.1: a hml não tem Caddy próprio (80/443 com um dono só)" || fail "AC-003.1: existe Caddy da hml"
  local redes; redes="$(rssh 'docker ps --filter name=crm-hml- --format "{{.Names}}" | xargs -r docker inspect --format "{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}}" | tr " " "\n" | sort -u | tr "\n" " "' 2>/dev/null)"
  case "$redes" in *crm-prod_supabase*|*crm-prod_internal*|*crm-prod_default*) fail "AC-003.2: a hml está em rede da produção ($redes)";; *crm-hml_internal*) pass "AC-003.2: redes da hml = $redes";; *) fail "AC-003.2: redes inesperadas ($redes)";; esac
  local vols; vols="$(rssh 'docker ps --filter name=crm-hml- --format "{{.Names}}" | xargs -r docker inspect --format "{{range .Mounts}}{{.Name}} {{end}}" | tr " " "\n" | grep -v "^$" | sort -u' 2>/dev/null)"
  # volume anônimo (64 hex) pertence só ao container que o criou; o resto precisa do prefixo crm-hml_
  if [ -n "$vols" ] && ! printf '%s\n' "$vols" | grep -vE '^(crm-hml_|[0-9a-f]{64}$)' | grep -q .; then pass "AC-003.2: volumes só da hml ($(printf '%s' "$vols" | tr '\n' ' '))"; else fail "AC-003.2: volumes fora do prefixo crm-hml_ ($vols)"; fi
  local seg; seg="$(rssh 'for k in $(grep -oE "^[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|DB_URL|SUPABASE_URL)[A-Z0-9_]*" /opt/crm-hml/.env | sort -u); do a=$(grep -E "^$k=" /opt/crm-hml/.env | cut -d= -f2-); b=$(grep -E "^$k=" /opt/crm-prod/.env | cut -d= -f2-); [ -n "$a" ] && [ "$a" != "\"\"" ] && [ "$a" = "$b" ] && echo $k; done | tr "\n" " "' 2>/dev/null)"
  [ -z "$seg" ] && pass "AC-003.2: nenhum segredo/URL de banco igual ao da produção" || fail "AC-003.2: valores iguais aos da produção: $seg"
  [ "$(rssh 'grep -c "^SUPABASE_DB_URL=.*supabase.com" /opt/crm-hml/.env' 2>/dev/null)" = "1" ] && pass "AC-003.1: o banco da hml é o Supabase Cloud" || fail "AC-003.1: o banco da hml não é o Supabase Cloud"
  rssh 'docker ps --format "{{.Names}} {{.Status}}" | grep crm-hml | sort' | registra homologacao-containers.txt
}

[ "$#" -ge 1 ] || { echo "uso: $0 <sonda>... (medicao swap firewall isolamento-dev)"; exit 2; }
for s in "$@"; do
  fn="sonda_${s//-/_}"
  if declare -F "$fn" >/dev/null; then "$fn"; else echo "sonda desconhecida: $s"; falhas=$((falhas + 1)); fi
done
echo
[ "$falhas" -eq 0 ] && echo "sondas: TUDO OK" || { echo "sondas: $falhas falha(s)"; exit 1; }
