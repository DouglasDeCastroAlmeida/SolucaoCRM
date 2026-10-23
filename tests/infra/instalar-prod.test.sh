#!/usr/bin/env bash
# T-030: AC-002.5 -- infra/solucao/instalar-prod.sh recusa antes de instalar; nunca roda o instalador real.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/infra/solucao/instalar-prod.sh"
FALHAS=0
ok()   { printf '  ok   %s\n' "$1"; }
falha(){ printf '  FALHA %s\n' "$1"; FALHAS=$((FALHAS + 1)); }
echo "instalar-prod: validações antes do instalador do kit"

monta() { # ambiente feliz
  T="$(mktemp -d)"; D="$T/crm-prod"; mkdir -p "$D/hostgator-setup-kit"
  cat > "$D/hostgator-setup-kit/install-single-server.sh" <<E2
#!/usr/bin/env bash
echo "INSTALADOR args=\$* BUILD_LOCAL=\${DESKCOMM_BUILD_LOCAL-}" >> "$T/inst.log"
E2
  printf '#!/usr/bin/env bash\necho 203.0.113.10\n' > "$T/ip.sh"
  printf '#!/usr/bin/env bash\necho "203.0.113.10 $1"\n' > "$T/dns.sh"
  printf '#!/usr/bin/env bash\necho "State Recv-Q Send-Q Local Address:Port"\n' > "$T/ss.sh"
  printf '#!/usr/bin/env bash\necho deploy\n' > "$T/who.sh"
  printf 'MemTotal:  4000000 kB\nMemAvailable: %s kB\n' 5000000 > "$T/meminfo"
  printf '#!/usr/bin/env bash\n:\n' > "$T/docker.sh"   # docker ps sem containers
  chmod +x "$D"/hostgator-setup-kit/*.sh "$T"/*.sh
  : > "$T/inst.log"
}
roda() { # roda <args...>
  ( cd "$D" && CRM_PROD_DIR="$D" IP_CMD="$T/ip.sh" DNS_CMD="$T/dns.sh" SS_CMD="$T/ss.sh" WHOAMI_CMD="$T/who.sh" MEMINFO_FILE="$T/meminfo" DOCKER_CMD="$T/docker.sh" \
    bash "$SCRIPT" "$@" ) >"$T/out.txt" 2>&1
  RC=$?
}
instalou() { [ -s "$T/inst.log" ]; }
recusa() { # recusa <descrição> <regex da mensagem>
  if [ "$RC" -ne 0 ] && ! instalou && grep -qiE -e "$2" "$T/out.txt"; then ok "$1"; else falha "$1 (rc=$RC; $(head -c 200 "$T/out.txt" | tr '\n' ' '))"; fi
}
limpa() { rm -rf "$T"; }
DOM=crm.exemplo.com.br

monta; printf '#!/usr/bin/env bash\necho root\n' > "$T/who.sh"; roda --domain $DOM
recusa "AC-002.5 recusa root" "usuário .?deploy"; limpa
monta; printf '#!/usr/bin/env bash\necho dev\n' > "$T/who.sh"; roda --domain $DOM
recusa "AC-002.5 recusa dev" "usuário .?deploy"; limpa
monta; ( cd "$T" && CRM_PROD_DIR="$D" WHOAMI_CMD="$T/who.sh" bash "$SCRIPT" --domain $DOM ) >"$T/out.txt" 2>&1; RC=$?
recusa "AC-002.5 recusa fora de /opt/crm-prod (CRM_PROD_DIR)" "crm-prod|pasta"; limpa
monta; roda
recusa "AC-002.5 exige --domain" "--domain"; limpa
monta; roda --domain "não é domínio!"
recusa "AC-002.5 valida formato do domínio" "inválid|formato"; limpa
monta; printf '#!/usr/bin/env bash\necho "198.51.100.9 $1"\n' > "$T/dns.sh"; roda --domain $DOM
recusa "AC-002.5 recusa DNS apontando para outro IP" "DNS.*203\.0\.113\.10|registro"; limpa
monta; printf '#!/usr/bin/env bash\nexit 0\n' > "$T/dns.sh"; roda --domain $DOM
recusa "AC-002.5 recusa DNS sem resposta" "DNS"; limpa
monta; printf '#!/usr/bin/env bash\necho "LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:((\\"nginx\\",pid=1,fd=6))"\n' > "$T/ss.sh"; roda --domain $DOM
recusa "AC-002.5 recusa porta 80 ocupada por outro" "porta.*80.*04-mover-vava|04-mover-vava"; limpa
monta; printf '#!/usr/bin/env bash\necho "LISTEN 0 511 *:443 *:* users:((\\"vava-proxy\\",pid=1,fd=6))"\n' > "$T/ss.sh"; roda --domain $DOM
recusa "AC-002.5 recusa porta 443 ocupada por outro" "443"; limpa
monta; printf 'MemAvailable: 3000000 kB\n' > "$T/meminfo"; roda --domain $DOM
recusa "AC-002.5 recusa RAM livre < 4 GB" "RAM|memória"; limpa
monta; : > "$D/.deskcomm-instalado"; roda --domain $DOM
recusa "AC-002.5 recusa reinstalar (.deskcomm-instalado)" "update|deploy"; limpa

# porta ocupada pelo caddy do projeto é aceita
monta; printf '#!/usr/bin/env bash\necho "LISTEN 0 4096 0.0.0.0:443 0.0.0.0:* users:((\\"caddy\\",pid=1,fd=6))"\n' > "$T/ss.sh"; roda --domain $DOM
if [ "$RC" -eq 0 ] && instalou; then ok "AC-002.5 porta com caddy do projeto não bloqueia"; else falha "caddy do projeto bloqueou: $(cat "$T/out.txt")"; fi; limpa

# docker: o caddy do projeto atrás do docker-proxy passa; o vava recusa citando o nome
SS_PROXY='#!/usr/bin/env bash
echo "LISTEN 0 4096 0.0.0.0:443 0.0.0.0:* users:((\"docker-proxy\",pid=1,fd=6))"'
monta; echo "$SS_PROXY" > "$T/ss.sh"; printf '#!/usr/bin/env bash\necho crm-prod-caddy-1\n' > "$T/docker.sh"; roda --domain $DOM
if [ "$RC" -eq 0 ] && instalou; then ok "AC-002.5 docker-proxy do crm-prod-caddy-1 não bloqueia"; else falha "caddy do projeto via docker bloqueou: $(cat "$T/out.txt")"; fi; limpa
monta; echo "$SS_PROXY" > "$T/ss.sh"; printf '#!/usr/bin/env bash\necho crm-prod-caddy-1\necho valesca_almeida_website\n' > "$T/docker.sh"; roda --domain $DOM
recusa "AC-002.5 recusa container do vava citando o nome e o runbook" "valesca_almeida_website.*04-mover-vava.*fundacao\.md"; limpa
monta; roda --domain "inválido!" --dry-run
recusa "AC-002.5 --dry-run valida o formato do domínio" "inválid"; limpa

# feliz
monta; roda --domain $DOM
if [ "$RC" -eq 0 ] && grep -q -- "--domain $DOM" "$T/inst.log" && grep -q 'BUILD_LOCAL=0' "$T/inst.log"; then ok "AC-002.5 feliz: chama o kit com --domain e DESKCOMM_BUILD_LOCAL=0"; else falha "feliz: rc=$RC $(cat "$T/inst.log") $(cat "$T/out.txt")"; fi
limpa
monta; roda --domain $DOM --permitir-build-local
if grep -q 'BUILD_LOCAL=1' "$T/inst.log"; then ok "--permitir-build-local libera a construção"; else falha "permitir-build-local: $(cat "$T/inst.log")"; fi
limpa
# DESKCOMM_BUILD_LOCAL=1 do ambiente não vaza sem a flag
monta; ( cd "$D" && DESKCOMM_BUILD_LOCAL=1 CRM_PROD_DIR="$D" IP_CMD="$T/ip.sh" DNS_CMD="$T/dns.sh" SS_CMD="$T/ss.sh" WHOAMI_CMD="$T/who.sh" MEMINFO_FILE="$T/meminfo" bash "$SCRIPT" --domain $DOM ) >/dev/null 2>&1
grep -q 'BUILD_LOCAL=0' "$T/inst.log" && ok "variável de ambiente =1 não vaza sem a flag" || falha "BUILD_LOCAL vazou: $(cat "$T/inst.log")"; limpa

# dry-run: nada executado (nem root exigido, nem instalador)
monta; printf '#!/usr/bin/env bash\necho root\n' > "$T/who.sh"; roda --domain $DOM --dry-run
if [ "$RC" -eq 0 ] && ! instalou && grep -q 'dry-run' "$T/out.txt" && grep -q 'install-single-server.sh' "$T/out.txt"; then ok "AC-002.5 --dry-run só imprime o plano"; else falha "dry-run rc=$RC $(cat "$T/out.txt")"; fi
limpa
# sem segredos
monta; SENHA_X=segredo123 roda --domain $DOM; printf '#!/usr/bin/env bash\necho root\n' > "$T/who.sh"; roda --domain $DOM
! grep -qE 'segredo123|PASSWORD|SECRET|TOKEN' "$T/out.txt" && ok "mensagens sem segredos" || falha "mensagem com segredo"
limpa

[ "$FALHAS" = 0 ] && { echo "instalar-prod: tudo ok"; exit 0; } || { echo "instalar-prod: $FALHAS falha(s)"; exit 1; }
