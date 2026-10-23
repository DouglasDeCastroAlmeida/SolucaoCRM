#!/usr/bin/env bash
# T-028: AC-002.4, AC-009.2 -- limites e prioridade do override infra/solucao/docker-compose.solucao.yml
# Sem docker nem parser YAML: awk lê o recuo fixo (2 espaços = serviço, 4 = chave).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OV="$REPO_ROOT/infra/solucao/docker-compose.solucao.yml"
PROD="$REPO_ROOT/docker-compose.prod.yml"
FALHAS=0
ok()   { printf '  ok   %s\n' "$1"; }
falha(){ printf '  FALHA %s\n' "$1"; FALHAS=$((FALHAS + 1)); }
echo "compose-solucao: limites e prioridade"
[ -f "$OV" ] || { falha "override ausente: $OV"; echo "compose-solucao: $FALHAS falha(s)"; exit 1; }

# valor <arquivo> <serviço> <chave> -> valor sem comentário/aspas ('' se ausente)
valor() {
  awk -v svc="$2" -v key="$3" '
    /^services:/ {ins=1; next}
    /^[a-z]/ && !/^services:/ {ins=0}
    ins && match($0,/^  [a-z0-9-]+:/) { cur=substr($0,3,RLENGTH-3); next }
    ins && cur==svc && $0 ~ "^    " key ":" {
      v=$0; sub("^    " key ":[ ]*","",v); sub(/[ ]+#.*$/,"",v); gsub(/"/,"",v); print v; exit }' "$1"
}
mb() { case "$1" in *g) echo $(( ${1%g} * 1024 ));; *m) echo "${1%m}";; *) echo "";; esac; }

SERVICOS="app worker scheduler waha redis srh caddy"
for s in $SERVICOS; do
  m="$(valor "$OV" "$s" mem_limit)"; [ -n "$m" ] || m="$(valor "$PROD" "$s" mem_limit)"
  c="$(valor "$OV" "$s" cpus)"
  [ -n "$m" ] && [ -n "$c" ] && ok "AC-002.4 $s tem mem_limit ($m) e cpus ($c)" || falha "$s sem mem_limit/cpus (m='$m' c='$c')"
done

for s in app worker waha; do
  po="$(mb "$(valor "$PROD" "$s" mem_limit)")"; oo="$(mb "$(valor "$OV" "$s" mem_limit)")"
  if [ -z "$po" ] || [ -z "$oo" ]; then falha "$s: não comparável (prod='$po' override='$oo')"
  elif [ "$oo" -le "$po" ]; then ok "AC-002.4 $s: override ${oo}m <= prod ${po}m"
  else falha "$s: override ${oo}m MAIOR que prod ${po}m"; fi
done

for s in wacalls asterisk voice-agent; do
  p="$(valor "$OV" "$s" profiles)"; pp="$(valor "$PROD" "$s" profiles)"
  case "$p" in *\[*) ok "AC-002.4 $s fora do ar (profiles=$p)";; *) falha "$s sem profiles no override (prod: $pp)";; esac
done

sa="$(valor "$OV" app cpu_shares)"; ok_s=1
[ -n "$sa" ] || ok_s=0
for s in worker scheduler waha redis srh caddy; do
  x="$(valor "$OV" "$s" cpu_shares)"
  if [ -z "$x" ] || [ "$ok_s" = 0 ] || [ "$sa" -le "$x" ]; then falha "AC-009.2 cpu_shares app ($sa) deveria superar $s ($x)"; else ok "AC-009.2 cpu_shares app ($sa) > $s ($x)"; fi
done

grep -q 'docker compose' "$OV" && grep -q 'config' "$OV" && ok "comentário de validação na VPS presente" || falha "faltou comentário 'docker compose ... config'"

[ "$FALHAS" = 0 ] && { echo "compose-solucao: tudo ok"; exit 0; } || { echo "compose-solucao: $FALHAS falha(s)"; exit 1; }
