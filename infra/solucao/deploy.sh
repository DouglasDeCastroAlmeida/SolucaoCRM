#!/usr/bin/env bash
# deploy.sh <hml|prod> <sha-de-40-hex>
#
# Único comando que o CI manda executar na VPS (via chave SSH restrita do usuário
# `deploy`). Troca as três imagens do CRM para a versão fixa <sha>, com backup
# antes (prod), verificação de saúde e rollback automático.
#
# Códigos de saída:
#   0   sucesso (ou já estava nesta versão, saudável)
#   10  o deploy falhou e o sistema VOLTOU à versão anterior
#   11  o deploy falhou e o sistema NÃO voltou (precisa de humano)
#   1   recusado antes de trocar as versões (backup, git ou baseline falhos)
#   2   uso incorreto (ambiente, SHA ou variável faltando)
#
# Uso: deploy.sh <hml|prod> <sha> [dono]  (ou SSH_ORIGINAL_COMMAND com o mesmo texto)
#
# Variáveis (todas opcionais):
#   GHCR_OWNER            dono das imagens em ghcr.io (o 3º argumento vence; sem
#                         nenhum dos dois, deriva da APP_IMAGE atual do .env)
#   CRM_DIR               pasta do ambiente (padrão /opt/crm-prod ou /opt/crm-hml)
#   HEALTH_BASE_URL       padrão http://localhost:3000
#   HEALTH_TIMEOUT        segundos de espera pela saúde após o deploy (padrão 90)
#   ROLLBACK_TIMEOUT      idem, após o rollback (padrão 60)
#   HEALTH_INTERVAL       intervalo entre sondagens (padrão 3)
#   BACKUP_CMD            padrão `bash hostgator-setup-kit/backup.sh` (só em prod)
#   APLICAR_BASELINE_CMD  gancho para aplicar o baseline; o padrão reaproveita
#                         `reaplicar_baseline` do hostgator-setup-kit/_common.sh
#   DEPLOY_LOG            padrão $CRM_DIR/deploy.log
#   LOCK_DIR              padrão /tmp (um lock por ambiente)
#
# Segredos: o .env nunca é impresso e os valores de chaves sensíveis são
# mascarados em toda saída (AC-012.2). O login no GHCR é feito uma vez por
# humano; este script não faz login.
set +x
set -uo pipefail

# Argumentos: posicionais (<amb> <sha> [dono]) ou, quando vêm de uma chave SSH com
# command=, em SSH_ORIGINAL_COMMAND ("deploy.sh <amb> <sha> [dono]"). O texto é
# validado por inteiro contra uma regex estrita (nada de eval, aspas ou espaço extra).
RE_DONO='^[a-z0-9][a-z0-9-]{0,38}$'
if [ "$#" -eq 0 ] && [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  RE_CMD='^(deploy.sh )?(hml|prod) [0-9a-f]{40}( [a-z0-9][a-z0-9-]{0,38})?$'
  if ! [[ "$SSH_ORIGINAL_COMMAND" =~ $RE_CMD ]]; then
    echo "comando remoto recusado: use exatamente 'deploy.sh <hml|prod> <sha-de-40-hex> [dono]'." >&2
    exit 2
  fi
  read -r -a _partes <<< "${SSH_ORIGINAL_COMMAND#deploy.sh }"
  set -- "${_partes[@]}"
fi
{ [ "$#" -eq 2 ] || [ "$#" -eq 3 ]; } || { echo "uso: deploy.sh <hml|prod> <sha-de-40-hex> [dono]" >&2; exit 2; }
AMB="${1:-}"; SHA="${2:-}"; DONO_ARG="${3:-}"
case "$AMB" in hml|prod) ;; *) echo "ambiente inválido: '$AMB' (use hml ou prod)" >&2; exit 2 ;; esac
if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "versão recusada: use o SHA completo do commit (40 caracteres hexadecimais minúsculos); 'latest' e tags móveis não são aceitos." >&2
  exit 2
fi

CRM_DIR="${CRM_DIR:-/opt/crm-$AMB}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-http://localhost:3000}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
ROLLBACK_TIMEOUT="${ROLLBACK_TIMEOUT:-60}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-3}"
DEPLOY_LOG="${DEPLOY_LOG:-$CRM_DIR/deploy.log}"
LOCK_DIR="${LOCK_DIR:-/tmp}"
ENV_FILE="$CRM_DIR/.env"

[ -f "$ENV_FILE" ] || { echo "Falta o .env em $CRM_DIR." >&2; exit 2; }
cd "$CRM_DIR" || exit 2

# dono das imagens: argumento > GHCR_OWNER > derivado da APP_IMAGE atual do .env
OWNER="$DONO_ARG"
[ -n "$OWNER" ] || OWNER="$(printf '%s' "${GHCR_OWNER:-}" | tr 'A-Z' 'a-z')"
if [ -z "$OWNER" ]; then
  _img="$(awk 'index($0, "APP_IMAGE=") == 1 { print substr($0, 11); exit }' "$ENV_FILE" | tr -d '')"
  case "$_img" in ghcr.io/*/*) _r="${_img#ghcr.io/}"; OWNER="${_r%%/*}" ;; esac
fi
if [ -z "$OWNER" ]; then
  echo "dono das imagens não resolvido: passe-o como 3º argumento, defina GHCR_OWNER ou deixe APP_IMAGE=ghcr.io/<dono>/... no .env." >&2
  exit 2
fi
if ! [[ "$OWNER" =~ $RE_DONO ]]; then
  echo "dono das imagens inválido:  (use minúsculas, números e hífen)." >&2
  exit 2
fi

# ── saída sem segredos ───────────────────────────────────────────────────────
# Mascara, em qualquer texto, o valor de toda chave sensível do .env.
redige() {
  awk -v envfile="$ENV_FILE" -v sq="'" '
    BEGIN {
      while ((getline l < envfile) > 0) {
        i = index(l, "="); if (i < 2) continue
        k = substr(l, 1, i - 1); v = substr(l, i + 1)
        gsub(//, "", v); gsub(/^"|"$/, "", v); gsub("^" sq "|" sq "$", "", v)
        if (toupper(k) ~ /(PASS|SECRET|TOKEN|KEY|JWT|DSN|URL|CREDENTIAL|SALT|HASH|HMAC|AUTH|ENCRYPTION|COOKIE|PRIVATE|SIGNING|CERT)/ && length(v) >= 4) segredos[++n] = v
      }
    }
    { for (j = 1; j <= n; j++) { s = segredos[j]; out = ""; rest = $0
        while ((p = index(rest, s)) > 0) { out = out substr(rest, 1, p - 1) "***"; rest = substr(rest, p + length(s)) }
        $0 = out rest }
      print }'
}
mkdir -p "$(dirname "$DEPLOY_LOG")" 2>/dev/null || true
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | redige | tee -a "$DEPLOY_LOG"; }
# executa comando externo registrando a saída já mascarada; devolve o código dele
roda() { "$@" 2>&1 | redige >> "$DEPLOY_LOG"; return "${PIPESTATUS[0]}"; }
roda_sh() { bash -c "$1" 2>&1 | redige >> "$DEPLOY_LOG"; return "${PIPESTATUS[0]}"; }

# ── trava por ambiente (AC-005.5) ────────────────────────────────────────────
mkdir -p "$LOCK_DIR"
LOCK_ARQ="$LOCK_DIR/crm-deploy-$AMB.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_ARQ"
  if ! flock -n 9; then
    log "Aguardando outro deploy de $AMB terminar..."
    flock 9
  fi
else
  # Sem flock (ex.: máquina sem util-linux): trava por diretório com o PID dono.
  LOCK_D="$LOCK_ARQ.d"; avisou=0
  until mkdir "$LOCK_D" 2>/dev/null; do
    dono="$(cat "$LOCK_D/pid" 2>/dev/null || true)"
    if [ -n "$dono" ] && ! kill -0 "$dono" 2>/dev/null; then mv "$LOCK_D" "$LOCK_D.orfao.$$" 2>/dev/null && rm -rf "$LOCK_D.orfao.$$"; continue; fi
    [ "$avisou" = 1 ] || { log "Aguardando outro deploy de $AMB terminar..."; avisou=1; }
    sleep 0.2
  done
  echo "$$" > "$LOCK_D/pid"
  trap 'rm -rf "$LOCK_D"' EXIT
fi

# ── .env: leitura e escrita das três tags ────────────────────────────────────
CHAVES=(APP_IMAGE WORKER_IMAGE SCHEDULER_IMAGE)
nome_img() { case "$1" in APP_IMAGE) echo deskcommcrm ;; WORKER_IMAGE) echo deskcomm-worker ;; SCHEDULER_IMAGE) echo deskcomm-scheduler ;; esac; }
le_chave() { awk -v k="$1" 'index($0, k "=") == 1 { print substr($0, length(k) + 2); exit }' "$ENV_FILE"; }
grava_chave() { # CHAVE VALOR: substitui ou acrescenta (valor passado como dado)
  local tmp; tmp="$(mktemp)"
  awk -v k="$1" -v v="$2" 'BEGIN{f=0} index($0, k "=") == 1 { if (!f) { print k "=" v; f=1 }; next } { print } END { if (!f) print k "=" v }' "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
tags_para() { local c; for c in "${CHAVES[@]}"; do echo "$c=ghcr.io/$OWNER/$(nome_img "$c"):$1"; done; }

# ── compose (doutrina: SEMPRE os arquivos corretos) ──────────────────────────
COMPOSE_ARGS=(-f docker-compose.prod.yml)
[ "$AMB" != prod ] || COMPOSE_ARGS+=(-f docker-compose.single-server.yml)
[ ! -f infra/solucao/docker-compose.solucao.yml ] || COMPOSE_ARGS+=(-f infra/solucao/docker-compose.solucao.yml)
# a homologação NUNCA sobe um segundo Caddy (80/443 têm um dono só): sem este arquivo, aborta
[ "$AMB" != hml ] || COMPOSE_ARGS+=(-f infra/solucao/docker-compose.hml.yml)
for f in "${COMPOSE_ARGS[@]}"; do
  [ "$f" = "-f" ] || [ -f "$f" ] || { log "Arquivo de compose ausente: $f"; exit 2; }
done
compose() { docker compose "${COMPOSE_ARGS[@]}" --env-file .env "$@"; }

# ── saúde: "/" = 200 e "/app" = 307 (doutrina do CLAUDE.md) ─────────────────
codigo() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_BASE_URL$1" 2>/dev/null || true; }
saudavel() { [ "$(codigo /)" = 200 ] && [ "$(codigo /app)" = 307 ]; }
espera_saude() { # segundos
  local limite=$((SECONDS + $1))
  while :; do
    saudavel && return 0
    [ "$SECONDS" -lt "$limite" ] || return 1
    sleep "$HEALTH_INTERVAL"
  done
}

# ── início ───────────────────────────────────────────────────────────────────
log "Deploy de $AMB para ${SHA:0:12} (versão fixa; nunca latest)."

ANTERIOR=(); for c in "${CHAVES[@]}"; do ANTERIOR+=("$c=$(le_chave "$c")"); done
NOVO=(); while IFS= read -r l; do NOVO+=("$l"); done < <(tags_para "$SHA")

if [ "$(printf '%s\n' "${ANTERIOR[@]}")" = "$(printf '%s\n' "${NOVO[@]}")" ] && saudavel; then
  log "Já está na versão ${SHA:0:12} e respondendo (/ = 200, /app = 307). Nada a fazer."
  exit 0
fi

# backup antes, só em produção (AC-006.1); falha aborta sem tocar nas versões
if [ "$AMB" = prod ]; then
  log "Tirando backup antes do deploy..."
  if roda_sh "${BACKUP_CMD:-bash hostgator-setup-kit/backup.sh}"; then
    log "Backup concluído com sucesso."
  else
    log "Backup FALHOU — deploy abortado antes de mexer nas versões."
    exit 1
  fi
fi

# código do commit (só onde o ambiente é um checkout git); depois o baseline
if [ -d .git ]; then
  if ! roda git fetch origin || ! roda git checkout --detach "$SHA"; then
    log "Não consegui posicionar o código em ${SHA:0:12} — deploy abortado."
    exit 1
  fi
fi
if [ -n "${APLICAR_BASELINE_CMD:-}" ]; then
  baseline_cmd="$APLICAR_BASELINE_CMD"
else
  # reaproveita a função do kit (a mesma do install.sh e do update.sh)
  baseline_cmd='set -e; source hostgator-setup-kit/_common.sh; enter_project; reaplicar_baseline "$PROJECT_DIR/supabase/baseline.sql" "$PROJECT_DIR/.deskcomm-banco.log"'
fi
if [ -n "${APLICAR_BASELINE_CMD:-}" ] || [ -f supabase/baseline.sql ]; then
  log "Aplicando o baseline do banco..."
  roda_sh "$baseline_cmd" || { log "Baseline do banco não fechou — deploy abortado antes de trocar as versões."; exit 1; }
fi

aplica_tags() { local l; for l in "$@"; do grava_chave "${l%%=*}" "${l#*=}"; done; }
# A hml entra na rede do Caddy da produção SÓ com o apelido crm-hml-app. Pelo compose ela ganharia também
# o apelido `app` (nome do serviço) e o Caddy da produção passaria a mandar parte do tráfego de
# app.corretora.io para a homologação. Por isso a ligação é feita aqui, depois de cada `up`.
REDE_CADDY="${REDE_CADDY:-crm-prod_caddy-sites}"
publica_hml() {
  local cid; cid="$(compose ps -q app 2>/dev/null | head -1)"
  roda docker network connect --alias crm-hml-app "$REDE_CADDY" "$cid" || log "network connect: já conectada (ou falhou); a saúde decide."
}
# sobe [rollback]: no rollback um pull que falha não impede o up (imagens em cache local)
sobe() {
  if ! roda compose pull app worker scheduler; then
    [ "${1:-}" = rollback ] || return 1
    log "pull falhou durante o rollback — usando as imagens já presentes no servidor."
  fi
  roda compose up -d || return 1
  [ "$AMB" != hml ] || publica_hml
}

INICIO=$SECONDS
ENV_COPIA="$(mktemp)"; cat "$ENV_FILE" > "$ENV_COPIA"
aplica_tags "${NOVO[@]}"
log "Versões gravadas; subindo os serviços..."
if sobe && espera_saude "$HEALTH_TIMEOUT"; then
  rm -f "$ENV_COPIA"
  log "Deploy concluído: / = 200 e /app = 307 em $((SECONDS - INICIO)) s."
  exit 0
fi

# ── rollback (AC-006.2 / AC-006.3) ───────────────────────────────────────────
log "Saúde falhou após o deploy — voltando à versão anterior."
RB=$SECONDS
# restaura o .env original byte a byte (cobre o primeiro deploy, sem tags prévias)
cat "$ENV_COPIA" > "$ENV_FILE"; rm -f "$ENV_COPIA"
if sobe rollback && espera_saude "$ROLLBACK_TIMEOUT"; then
  log "Rollback concluído: voltou à versão anterior e responde (rollback levou $((SECONDS - RB)) s)."
  exit 10
fi
log "Rollback FALHOU após $((SECONDS - RB)) s — o sistema NÃO voltou; intervenção humana necessária."
exit 11
