#!/usr/bin/env bash
# medir-memoria.sh — registra a memória da VPS a cada 10 min (cron do usuário deploy) e
# alerta o dono quando a memória disponível fica abaixo do limiar por mais de um dia.
#   Série: $DATA_DIR/memoria.tsv  (epoch, MemAvailable MB, Swap usado MB, containers MB, nº containers)
#   Guarda só os últimos 14 dias. Nunca grava env/segredos: só nomes e valores de memória.
# Variáveis: DATA_DIR (/opt/crm-deploy/dados) LIMIAR_MB (2048) JANELA_H (24)
#   MEMINFO_FILE (/proc/meminfo) DOCKER_CMD (docker) ALERTA_CMD (mensagem em $1 e stdin)
#   AGORA_EPOCH (injetável nos testes)
# Opção: --resumo  imprime mín/média/máx de MemAvailable das últimas JANELA_H horas e o veredito.
# Saídas: 0 ok; 1 falha de leitura.
set +x
set -euo pipefail

DATA_DIR="${DATA_DIR:-/opt/crm-deploy/dados}"
LIMIAR_MB="${LIMIAR_MB:-2048}"
JANELA_H="${JANELA_H:-24}"
MEMINFO_FILE="${MEMINFO_FILE:-/proc/meminfo}"
DOCKER_CMD="${DOCKER_CMD:-docker}"
RETENCAO_DIAS=14
AGORA="${AGORA_EPOCH:-$(date +%s)}"
SERIE="$DATA_DIR/memoria.tsv"
JANELA_S=$((JANELA_H * 3600))

mkdir -p "$DATA_DIR" 2>/dev/null || true
chmod 0750 "$DATA_DIR" 2>/dev/null || true

if [ "${1:-}" = "--resumo" ]; then
  [ -s "$SERIE" ] || { echo "Sem amostras registradas."; exit 0; }
  awk -F'\t' -v now="$AGORA" -v j="$JANELA_S" -v lim="$LIMIAR_MB" '
    $1 >= now - j { n++; s += $2; if (n == 1 || $2 < mn) mn = $2; if (n == 1 || $2 > mx) mx = $2 }
    END {
      if (!n) { print "Sem amostras nas últimas " j / 3600 " h."; exit }
      printf "MemAvailable nas últimas %d h (%d amostras): mínimo %d MB, média %d MB, máximo %d MB\n", j / 3600, n, mn, s / n, mx
      if (mn >= lim) printf "Veredito: ok (≥ %d MB)\n", lim; else printf "Veredito: ATENÇÃO (mínimo abaixo de %d MB)\n", lim
    }' "$SERIE"
  exit 0
fi

erro() { echo "ERRO: $1" >&2; exit 1; }
alerta() {
  local msg="$1"
  echo "ALERTA: $msg"
  [ -n "${ALERTA_CMD:-}" ] && printf '%s' "$msg" | bash -c "$ALERTA_CMD" _ "$msg" >/dev/null 2>&1 || true
  return 0
}

# lock simples (diretório) para não sobrepor execuções
LOCK="$DATA_DIR/.medir-memoria.lock.d"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null || true; mkdir "$LOCK" 2>/dev/null || exit 0
  else echo "outra execução em andamento; saindo."; exit 0; fi
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

[ -r "$MEMINFO_FILE" ] || erro "não foi possível ler $MEMINFO_FILE; nada foi gravado."
avail_kb="$(awk '/^MemAvailable:/ {print $2}' "$MEMINFO_FILE")"
case "$avail_kb" in ''|*[!0-9]*) erro "MemAvailable ausente ou inválido em $MEMINFO_FILE; nada foi gravado." ;; esac
swt="$(awk '/^SwapTotal:/ {print $2}' "$MEMINFO_FILE")"; swf="$(awk '/^SwapFree:/ {print $2}' "$MEMINFO_FILE")"
swt="${swt:-0}"; swf="${swf:-0}"
avail_mb=$((avail_kb / 1024))
swap_mb=$(((swt - swf) / 1024))

cont_mb=0; cont_n=0
if saida="$($DOCKER_CMD stats --no-stream --format '{{.Name}} {{.MemUsage}}' 2>/dev/null)" && [ -n "$saida" ]; then
  read -r cont_mb cont_n < <(printf '%s\n' "$saida" | awk '
    function mb(v,  n, u) { n = v + 0; u = v; gsub(/[0-9.]/, "", u)
      if (u ~ /^[Gg]i?B$/) return n * 1024; if (u ~ /^[Kk]i?B$/) return n / 1024; if (u ~ /^B$/) return n / 1048576; return n }
    NF >= 2 { t += mb($2); c++ }
    END { printf "%d %d\n", t, c }')
fi

printf '%s\t%s\t%s\t%s\t%s\n' "$AGORA" "$avail_mb" "$swap_mb" "$cont_mb" "$cont_n" >> "$SERIE"

# rotação: só os últimos 14 dias
corte=$((AGORA - RETENCAO_DIAS * 86400))
awk -F'\t' -v c="$corte" '$1 >= c' "$SERIE" > "$SERIE.tmp" && mv "$SERIE.tmp" "$SERIE"

# amostra boa: sem alerta
[ "$avail_mb" -lt "$LIMIAR_MB" ] || exit 0

# início da sequência contínua abaixo do limiar (depois da última amostra boa)
inicio="$(awk -F'\t' -v lim="$LIMIAR_MB" '$2 >= lim { ini = "" ; next } ini == "" { ini = $1 } END { print ini }' "$SERIE")"
[ -n "$inicio" ] || exit 0
[ $((AGORA - inicio)) -ge "$JANELA_S" ] || exit 0

MARCA="$DATA_DIR/ultimo-alerta-memoria"
ultimo=0; [ -f "$MARCA" ] && ultimo="$(cat "$MARCA" 2>/dev/null || echo 0)"
case "$ultimo" in ''|*[!0-9]*) ultimo=0 ;; esac
[ $((AGORA - ultimo)) -ge 86400 ] || exit 0

alerta "Memória disponível em ${avail_mb} MB (abaixo de ${LIMIAR_MB} MB há mais de ${JANELA_H} h): hora de mover a produção para uma VPS dedicada."
echo "$AGORA" > "$MARCA"
exit 0
