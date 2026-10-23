#!/usr/bin/env bash
# T-043: AC-009.3, AC-009.4
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/infra/solucao/medir-memoria.sh"
FALHAS=0
ok()   { printf '  ok   %s\n' "$1"; }
falha(){ printf '  FALHA %s\n' "$1"; FALHAS=$((FALHAS + 1)); }
echo "medir-memoria: série, alerta e resumo"

NOW=1800000000
monta() { # monta <MemAvailable_MB>
  T="$(mktemp -d)"; mkdir -p "$T/dados"
  meminfo "$1"
  cat > "$T/docker.sh" <<'E2'
#!/usr/bin/env bash
printf 'crm-app 300MiB / 3.8GiB\ncrm-db 1.5GiB / 3.8GiB\ncrm-waha 512MiB / 3.8GiB\n'
E2
  chmod +x "$T/docker.sh"
  printf '#!/usr/bin/env bash\ncat >> "%s/alerta.txt"; echo " | $1" >> "%s/alerta.txt"\n' "$T" "$T" > "$T/alerta.sh"; chmod +x "$T/alerta.sh"
  export MEMINFO_FILE="$T/meminfo" DOCKER_CMD="$T/docker.sh" DATA_DIR="$T/dados" ALERTA_CMD="$T/alerta.sh" AGORA_EPOCH="$NOW"
}
meminfo() { printf 'MemTotal:        4000000 kB\nMemAvailable:    %s kB\nSwapTotal:       2097152 kB\nSwapFree:        1048576 kB\n' "$(($1 * 1024))" > "$T/meminfo"; }
roda() { AGORA_EPOCH="$1" bash "$SCRIPT" >"$T/out.txt" 2>&1; }
semeia() { # semeia <epoch> <mb>
  printf '%s\t%s\t0\t0\t0\n' "$1" "$2" >> "$T/dados/memoria.tsv"
}
alertas() { [ -f "$T/alerta.txt" ] && grep -c 'dedicada' "$T/alerta.txt" || echo 0; }
limpa() { rm -rf "$T"; }

# (a)
monta 3000
roda "$NOW"; roda $((NOW + 600))
n=$(wc -l < "$T/dados/memoria.tsv" 2>/dev/null || echo 0)
[ "$n" = 2 ] && ok "AC-009.3 duas execuções = duas linhas" || falha "linhas=$n"
l=$(head -1 "$T/dados/memoria.tsv" 2>/dev/null)
[ "$(echo "$l" | awk -F'\t' '{print NF" "$1" "$2" "$3" "$5}')" = "5 $NOW 3000 1024 3" ] && ok "campos TSV: epoch, avail, swap usado, containers" || falha "linha: $l"
c=$(echo "$l" | cut -f4)
[ "$c" -ge 2300 ] && [ "$c" -le 2360 ] && ok "soma de memória dos containers (~2.3 GB)" || falha "soma containers=$c"
# (b)
[ "$(alertas)" = 0 ] && ok "AC-009.4 sem alerta com memória boa" || falha "alertou com memória boa"
limpa

# (c) abaixo por menos de 24h
monta 1500
for i in $(seq 0 10); do semeia $((NOW - 3600 * (11 - i))) 1500; done
roda "$NOW"
[ "$(alertas)" = 0 ] && ok "AC-009.4 abaixo por <24h não alerta" || falha "alertou antes de 24h"
limpa

# (d) contínuo ≥24h, uma vez por dia
monta 1500
for i in $(seq 0 49); do semeia $((NOW - 1800 * (50 - i))) 1500; done
roda "$NOW"; a1=$(alertas)
roda $((NOW + 600)); roda $((NOW + 1200)); a2=$(alertas)
[ "$a1" = 1 ] && ok "AC-009.4 alerta após ≥24h abaixo do limiar" || falha "alertas=$a1"
[ "$a2" = 1 ] && ok "AC-009.4 não repete a cada 10 min" || falha "repetiu: $a2"
roda $((NOW + 86400 + 600))
[ "$(alertas)" = 2 ] && ok "AC-009.4 repete no dia seguinte" || falha "sem repetição diária: $(alertas)"
# (f)
grep -q '1500' "$T/alerta.txt" && grep -q 'hora de mover a produção para uma VPS dedicada' "$T/alerta.txt" && ok "mensagem com valor e recomendação" || falha "mensagem"
grep -qiE 'secret|senha|password|key' "$T/alerta.txt" && falha "segredo no alerta" || ok "sem segredos no alerta"
limpa

# (e) amostra boa no meio zera
monta 1500
for i in $(seq 0 49); do semeia $((NOW - 1800 * (50 - i))) 1500; done
semeia $((NOW - 1800 * 20)) 3000
roda "$NOW"
[ "$(alertas)" = 0 ] && ok "amostra boa no meio zera a contagem" || falha "ignorou amostra boa"
limpa

# (g) rotação 14 dias
monta 3000
semeia $((NOW - 15 * 86400)) 3000; semeia $((NOW - 13 * 86400)) 3000
roda "$NOW"
if ! grep -q "^$((NOW - 15 * 86400))	" "$T/dados/memoria.tsv" && grep -q "^$((NOW - 13 * 86400))	" "$T/dados/memoria.tsv"; then ok "rotação: guarda só 14 dias"; else falha "rotação"; fi
limpa

# (h) falha de leitura
monta 3000
rm -f "$T/meminfo"
roda "$NOW"; rc=$?
[ "$rc" != 0 ] && grep -q 'ERRO' "$T/out.txt" && [ ! -s "$T/dados/memoria.tsv" ] && ok "falha de leitura: sai ≠0, mensagem PT, sem linha lixo" || falha "leitura rc=$rc"
printf 'lixo sem MemAvailable\n' > "$T/meminfo"
roda "$NOW"; rc=$?
[ "$rc" != 0 ] && [ ! -s "$T/dados/memoria.tsv" ] && ok "meminfo sem MemAvailable: sem linha lixo" || falha "meminfo inválido rc=$rc"
limpa

# (i) resumo
monta 3000
semeia $((NOW - 3600)) 2500; semeia $((NOW - 1800)) 3500; semeia $((NOW - 3 * 86400)) 100
AGORA_EPOCH="$NOW" bash "$SCRIPT" --resumo >"$T/out.txt" 2>&1
grep -q '2500' "$T/out.txt" && grep -q '3500' "$T/out.txt" && grep -q '3000' "$T/out.txt" && ok "AC-009.3 resumo: mín/média/máx das últimas 24 h" || falha "resumo: $(cat "$T/out.txt")"
grep -q 'ok (≥ 2048 MB)' "$T/out.txt" && ok "AC-009.3 veredito ok" || falha "veredito ok"
limpa
monta 3000
semeia $((NOW - 3600)) 1000
AGORA_EPOCH="$NOW" bash "$SCRIPT" --resumo >"$T/out.txt" 2>&1
grep -q 'ATENÇÃO' "$T/out.txt" && ok "veredito ATENÇÃO quando mín < 2048" || falha "veredito atenção"
limpa

[ "$FALHAS" = 0 ] && { echo "medir-memoria: tudo ok"; exit 0; } || { echo "medir-memoria: $FALHAS falha(s)"; exit 1; }
