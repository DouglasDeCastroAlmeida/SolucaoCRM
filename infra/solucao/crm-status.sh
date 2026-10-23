#!/usr/bin/env bash
# crm-status: atalho SOMENTE LEITURA para o Claude Code (usuário `dev`) ver o estado
# dos containers e os logs recentes, com segredos mascarados. {AC-008.3}
#
# Roda como root via /etc/sudoers.d/crm-status (um comando exato, sem argumentos livres).
# Uso:
#   crm-status                       -> docker ps + últimas 50 linhas de cada container do CRM
#   crm-status ps                    -> só docker ps
#   crm-status logs <container> [N]  -> logs do container (N de 1 a 500; padrão 100)
# Qualquer outro argumento é recusado. Nunca usa eval, nunca lê .env, nunca faz exec/inspect.
set -euo pipefail

FILTRO="${CRM_STATUS_FILTRO:-^(crm|deskcomm|supabase)}"
MAX_LINHAS=500

uso() { echo "uso: crm-status [ps | logs <container> [linhas 1-$MAX_LINHAS]]" >&2; exit 2; }

mascara() {
  sed -E \
    -e '/-----BEGIN [A-Z ]*PRIVATE KEY-----/,/-----END [A-Z ]*PRIVATE KEY-----/c\[CHAVE-PRIVADA-OMITIDA]' \
    -e "s/(Authorization|Proxy-Authorization|Cookie|Set-Cookie)[\"']?[[:space:]]*[=:].*/\1: [MASCARADO]/I" \
    -e 's/Bearer[[:space:]]+[A-Za-z0-9._~+\/=-]+/Bearer [MASCARADO]/Ig' \
    -e 's#://[^:/@[:space:]]+:[^@[:space:]]+@#://[MASCARADO]@#g' \
    -e 's#([A-Za-z0-9._-]+):[^@[:space:]/:]+@([A-Za-z0-9.-]+)#\1:[MASCARADO]@\2#g' \
    -e "s/([\"']?[A-Za-z0-9_.-]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|SENHA|COOKIE)[A-Za-z0-9_.-]*[\"']?)[[:space:]]*[=:][[:space:]]*(\"[^\"]*\"|'[^']*'|[^[:space:],}\"']+)/\1=[MASCARADO]/Ig" \
    -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/[JWT-MASCARADO]/g' \
    -e 's/gh[pousr]_[A-Za-z0-9]{16,}/[TOKEN-MASCARADO]/g' \
    -e 's/github_pat_[A-Za-z0-9_]{16,}/[TOKEN-MASCARADO]/g' \
    -e 's/sk-[A-Za-z0-9_-]{10,}/[CHAVE-MASCARADA]/g' \
    -e 's/(AKIA|ASIA)[A-Z0-9]{12,}/[CHAVE-MASCARADA]/g' \
    -e 's/xox[abprs]-[A-Za-z0-9-]{10,}/[TOKEN-MASCARADO]/g'
}

lista_containers() { docker ps -a --format '{{.Names}}' | grep -E "$FILTRO" || true; }

mostra_ps() {
  echo "== docker ps =="
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep -E "^NAMES|$FILTRO" | mascara
}

mostra_logs() { # mostra_logs <container> <linhas>
  echo "== logs: $1 (últimas $2 linhas) =="
  docker logs --tail "$2" "$1" 2>&1 | mascara
}

case "$#" in
  0)
    mostra_ps
    while IFS= read -r c; do [ -z "$c" ] || mostra_logs "$c" 50; done < <(lista_containers)
    ;;
  1)
    [ "$1" = ps ] || uso
    mostra_ps
    ;;
  2|3)
    [ "$1" = logs ] || uso
    nome="$2"; linhas="${3:-100}"
    [[ "$nome" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || uso
    [[ "$linhas" =~ ^[0-9]{1,3}$ ]] && [ "$linhas" -ge 1 ] && [ "$linhas" -le "$MAX_LINHAS" ] || uso
    lista_containers | grep -qxF -- "$nome" || { echo "container fora da lista permitida: $nome" >&2; exit 2; }
    mostra_logs "$nome" "$linhas"
    ;;
  *) uso ;;
esac
