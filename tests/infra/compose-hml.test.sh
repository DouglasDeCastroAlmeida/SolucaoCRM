#!/usr/bin/env bash
# T-033: AC-003.1, AC-003.2 -- override da homologação (infra/solucao/docker-compose.hml.yml)
# Sem docker nem parser YAML: leitura textual do arquivo, como o compose-solucao.test.sh.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HML="$REPO_ROOT/infra/solucao/docker-compose.hml.yml"
SOL="$REPO_ROOT/infra/solucao/docker-compose.solucao.yml"
DEPLOY="$REPO_ROOT/infra/solucao/deploy.sh"
FALHAS=0
ok()   { printf '  ok   %s\n' "$1"; }
falha(){ printf '  FALHA %s\n' "$1"; FALHAS=$((FALHAS + 1)); }
echo "compose-hml: override da homologação"
[ -f "$HML" ] || { falha "override ausente: $HML"; echo "compose-hml: $FALHAS falha(s)"; exit 1; }

# AC-003.1: a homologação NÃO sobe Caddy (um só dono de 80/443)
awk '/^  caddy:/{c=1;next} /^  [a-z]/{c=0} c && /profiles: !override/{f=1} END{exit !f}' "$HML" \
  && ok "AC-003.1 caddy desligado por profiles" || falha "AC-003.1 caddy não está desligado"

# AC-003.1: publicada pelo Caddy da produção, na rede compartilhada
grep -qE '^\s+name: crm-prod_caddy-sites$' "$HML" && grep -qE '^\s+external: true$' "$HML" \
  && ok "AC-003.1 rede externa crm-prod_caddy-sites" || falha "AC-003.1 falta a rede externa crm-prod_caddy-sites"
grep -q 'crm-hml-app' "$HML" && ok "AC-003.1 alias crm-hml-app para o Caddy" || falha "AC-003.1 falta o alias crm-hml-app"

# AC-003.2: nada de rede/volume/banco compartilhado com a produção além da caddy-sites
if grep -nE 'crm-prod_(supabase|internal)|supabase-db' "$HML" | grep -v '^\s*[0-9]*:\s*#' >/dev/null; then
  falha "AC-003.2 o override toca rede/banco da produção"
else ok "AC-003.2 sem rede interna nem banco da produção"; fi

# prioridade: homologação nunca acima da produção (cpu_shares <= 256, mem <= solucao)
valor() { awk -v svc="$2" -v key="$3" '
  /^services:/ {ins=1; next}
  /^[a-z]/ && !/^services:/ {ins=0}
  ins && match($0,/^  [a-z0-9-]+:/) { cur=substr($0,3,RLENGTH-3); next }
  ins && cur==svc && $0 ~ "^    " key ":" { v=$0; sub("^    " key ":[ ]*","",v); sub(/[ ]+#.*$/,"",v); gsub(/"/,"",v); print v; exit }' "$1"; }
mb() { case "$1" in *g) echo $(( ${1%g} * 1024 ));; *m) echo "${1%m}";; *) echo "";; esac; }
for s in app worker scheduler waha redis srh; do
  h="$(mb "$(valor "$HML" "$s" mem_limit)")"; p="$(mb "$(valor "$SOL" "$s" mem_limit)")"; sh="$(valor "$HML" "$s" cpu_shares)"
  if [ -z "$h" ] || [ -z "$p" ] || [ -z "$sh" ]; then falha "$s sem mem_limit/cpu_shares no override da hml (h='$h' p='$p' shares='$sh')"
  elif [ "$h" -le "$p" ] && [ "$sh" -le 256 ]; then ok "$s: hml ${h}m <= prod ${p}m, cpu_shares $sh <= 256"
  else falha "$s: hml ${h}m / shares $sh acima do permitido (prod ${p}m, máx 256 shares)"; fi
done

# o deploy.sh inclui o override só na hml e recusa se ele sumir
grep -qE 'AMB.*hml.*docker-compose\.hml\.yml|docker-compose\.hml\.yml' "$DEPLOY" \
  && ok "deploy.sh inclui docker-compose.hml.yml na homologação" || falha "deploy.sh não inclui docker-compose.hml.yml"
grep -qE '\[ "\$AMB" != hml \]' "$DEPLOY" && ok "inclusão condicionada a AMB=hml" || falha "inclusão não está condicionada a AMB=hml"

[ "$FALHAS" = 0 ] && { echo "compose-hml: tudo ok"; exit 0; } || { echo "compose-hml: $FALHAS falha(s)"; exit 1; }
