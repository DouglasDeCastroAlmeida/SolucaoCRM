#!/usr/bin/env bash
# Invólucro do instalador do kit: valida TUDO antes de chamar
# hostgator-setup-kit/install-single-server.sh --domain <dominio>, para nunca deixar
# instalação pela metade. {AC-002.5}
#
# Uso: instalar-prod.sh --domain <dominio> [--permitir-build-local] [--dry-run]
# Rode como usuário `deploy`, dentro de /opt/crm-prod.
# Variáveis (injetáveis em teste): CRM_PROD_DIR, WHOAMI_CMD, DNS_CMD, IP_CMD, SS_CMD, MEMINFO_FILE.
set -uo pipefail
DIR="${CRM_PROD_DIR:-/opt/crm-prod}"
WHOAMI_CMD="${WHOAMI_CMD:-id -un}"
IP_CMD="${IP_CMD:-curl -s --max-time 10 https://ifconfig.me}"
SS_CMD="${SS_CMD:-ss -ltnp}"
MEMINFO_FILE="${MEMINFO_FILE:-/proc/meminfo}"
DOMINIO=""; BUILD_LOCAL=0; DRY=0
DOCKER_CMD="${DOCKER_CMD:-docker}"
CADDY_CONTAINER="${CADDY_CONTAINER:-crm-prod-caddy-1}"
REGEX_DOMINIO='^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
erro() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
dns_padrao() { getent hosts "$1" 2>/dev/null | awk '{print $1; exit}'; }
DNS_CMD="${DNS_CMD:-dns_padrao}"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) [ $# -ge 2 ] || erro "faltou o valor de --domain."; DOMINIO="$2"; shift ;;
    --permitir-build-local) BUILD_LOCAL=1 ;;
    --dry-run) DRY=1 ;;
    *) erro "argumento desconhecido: $1. Uso: instalar-prod.sh --domain <dominio> [--permitir-build-local] [--dry-run]" ;;
  esac
  shift
done

INSTALADOR="$DIR/hostgator-setup-kit/install-single-server.sh"
if [ "$DRY" = 1 ]; then
  if [ -n "$DOMINIO" ]; then
    printf '%s' "$DOMINIO" | grep -qE "$REGEX_DOMINIO" || erro "domínio inválido (formato esperado: crm.seudominio.com.br, minúsculas, sem http://)."
  fi
  echo "[dry-run] nada será executado. Validaria, nesta ordem:"
  echo "[dry-run]  1. usuário deploy e pasta $DIR"
  echo "[dry-run]  2. --domain (formato) e ausência de .deskcomm-instalado"
  echo "[dry-run]  3. RAM livre >= 4 GB"
  echo "[dry-run]  4. DNS do domínio apontando para o IP público desta VPS"
  echo "[dry-run]  5. portas 80/443 livres (ou só do caddy deste projeto)"
  echo "[dry-run] Depois executaria: DESKCOMM_BUILD_LOCAL=$BUILD_LOCAL $INSTALADOR --domain ${DOMINIO:-<dominio>}"
  exit 0
fi

# (a) usuário e pasta
[ "$($WHOAMI_CMD)" = deploy ] || erro "rode como o usuário deploy (não root nem dev): sudo -iu deploy"
[ "$(pwd -P)" = "$(cd "$DIR" 2>/dev/null && pwd -P)" ] || erro "rode dentro de $DIR (cd $DIR) — a pasta de produção do CRM."
[ -x "$INSTALADOR" ] || [ -f "$INSTALADOR" ] || erro "instalador do kit não encontrado em $INSTALADOR."
# (b) domínio
[ -n "$DOMINIO" ] || erro "informe o domínio: instalar-prod.sh --domain crm.seudominio.com.br"
printf '%s' "$DOMINIO" | grep -qE "$REGEX_DOMINIO" || erro "domínio inválido (formato esperado: crm.seudominio.com.br, minúsculas, sem http://)."
# (g) já instalado
[ ! -e "$DIR/.deskcomm-instalado" ] || erro "já existe instalação (.deskcomm-instalado). Não reinstale: use infra/solucao/deploy.sh (ou o update do kit) para atualizar."
# (f) RAM
KB="$(awk '/^MemAvailable:/ {print $2; exit}' "$MEMINFO_FILE" 2>/dev/null)"
[ -n "$KB" ] && [ "$KB" -ge $((4 * 1024 * 1024)) ] || erro "RAM livre insuficiente ($(( ${KB:-0} / 1024 )) MB; mínimo 4096 MB). Libere memória ou pare serviços antes; construir/instalar agora pode derrubar o site vizinho."
# (c) DNS
IP_VPS="$($IP_CMD 2>/dev/null | tr -d '[:space:]')"
[ -n "$IP_VPS" ] || erro "não consegui descobrir o IP público desta VPS (IP_CMD). Verifique a internet."
IP_DNS="$($DNS_CMD "$DOMINIO" 2>/dev/null | awk '{print $1; exit}')"
[ -n "$IP_DNS" ] || erro "DNS de $DOMINIO não responde. Crie no DNS um registro A: $DOMINIO -> $IP_VPS e espere propagar."
[ "$IP_DNS" = "$IP_VPS" ] || erro "DNS de $DOMINIO aponta para $IP_DNS, mas esta VPS é $IP_VPS. Crie/ajuste o registro A: $DOMINIO -> $IP_VPS e tente de novo."
# (d) portas
for p in 80 443; do
  l="$($SS_CMD 2>/dev/null | grep -E "[:.]$p[[:space:]]" | head -1)"
  if [ -n "$l" ] && ! printf '%s' "$l" | grep -qi caddy; then
    # Como `deploy`, o ss mostra docker-proxy e não o caddy: confirma pelos containers.
    NOMES="$($DOCKER_CMD ps --filter publish=80 --filter publish=443 --format '{{.Names}}' 2>/dev/null | sort -u | tr '\n' ' ')"
    NOMES="${NOMES% }"
    OUTROS="$(printf '%s\n' $NOMES | grep -vxF "$CADDY_CONTAINER" || true)"
    if [ -z "$NOMES" ] || [ -n "$OUTROS" ]; then
      erro "porta $p ocupada por outro serviço (${OUTROS:-$NOMES}${NOMES:+}). Migre o site vizinho antes: infra/solucao/admin/04-mover-vava.sh (veja docs/solucao-crm/runbooks/fundacao.md)."
    fi
  fi
done

# (e) construção local desligada por padrão
export DESKCOMM_BUILD_LOCAL="$BUILD_LOCAL"
echo "Validações ok. Chamando o instalador do kit (DESKCOMM_BUILD_LOCAL=$BUILD_LOCAL)."
exec bash "$INSTALADOR" --domain "$DOMINIO"
