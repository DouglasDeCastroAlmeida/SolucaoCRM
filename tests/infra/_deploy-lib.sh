#!/usr/bin/env bash
# Biblioteca dos testes do infra/solucao/deploy.sh: monta um ambiente descartável
# com `docker`, `curl` e `backup` FALSOS (nada toca a máquina de quem roda).
#
# Dublês, controlados por variáveis:
#   docker  -> registra cada chamada em $FAKE_LOG; `compose ... up` dorme
#              $FAKE_UP_SLEEP (se definido) e registra UP_INICIO/UP_FIM; sai com
#              $FAKE_UP_RC (padrão 0) quando o .env aponta p/ tag em $FAKE_UP_FALHA_TAGS.
#   curl    -> responde 200 em `/` e 307 em `/app` quando a tag APP_IMAGE do .env
#              do CRM_DIR está em $FAKE_SAUDAVEL_TAGS; senão 503.
#   backup  -> hostgator-setup-kit/backup.sh falso em $CRM_DIR (BACKUP_CMD).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$REPO_ROOT/infra/solucao/deploy.sh"
SHA_A="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
SHA_B="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
SHA_C="cccccccccccccccccccccccccccccccccccccccc"
OWNER="dono-teste"

FALHAS=0
ok()   { printf '  ok   %s\n' "$1"; }
falha(){ printf '  FALHA %s\n' "$1"; FALHAS=$((FALHAS + 1)); }
afirma() { # afirma <descrição> <comando...>
  local d="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$d"; else falha "$d"; fi
}

# monta_ambiente <nome> -> exporta T, CRM_DIR, FAKE_LOG, PATH com dublês
monta_ambiente() {
  T="$(mktemp -d)"
  CRM_DIR="$T/crm"; mkdir -p "$CRM_DIR/hostgator-setup-kit" "$T/bin" "$CRM_DIR/infra/solucao"
  : > "$CRM_DIR/docker-compose.prod.yml"; : > "$CRM_DIR/docker-compose.single-server.yml"
  FAKE_LOG="$T/docker.log"; : > "$FAKE_LOG"
  cat > "$CRM_DIR/.env" <<ENV
APP_IMAGE=ghcr.io/$OWNER/deskcommcrm:$SHA_A
WORKER_IMAGE=ghcr.io/$OWNER/deskcomm-worker:$SHA_A
SCHEDULER_IMAGE=ghcr.io/$OWNER/deskcomm-scheduler:$SHA_A
POSTGRES_PASSWORD=SENHA_FALSA_123
OUTRA=1
ENV
  cat > "$T/bin/docker" <<'EOF2'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
case " $* " in
  *" up "*)
    echo "UP_INICIO $(date +%s%N)" >> "$FAKE_LOG"
    [ -z "${FAKE_UP_SLEEP:-}" ] || sleep "$FAKE_UP_SLEEP"
    if [ -n "${FAKE_UP_BLOQUEIA_ATE:-}" ]; then
      for _ in $(seq 1 300); do [ -e "$FAKE_UP_BLOQUEIA_ATE" ] && break; sleep 0.1; done
    fi
    echo "UP_FIM $(date +%s%N)" >> "$FAKE_LOG"
    tag="$(sed -n 's/^APP_IMAGE=.*://p' "$CRM_DIR/.env" | head -1)"
    for f in ${FAKE_UP_FALHA_TAGS:-}; do [ "$f" = "$tag" ] && exit 1; done
    ;;
esac
exit 0
EOF2
  cat > "$T/bin/curl" <<'EOF2'
#!/usr/bin/env bash
url="" ; for a in "$@"; do url="$a"; done
tag="$(sed -n 's/^APP_IMAGE=.*://p' "$CRM_DIR/.env" | head -1)"
bom=0; for s in ${FAKE_SAUDAVEL_TAGS:-}; do [ "$s" = "$tag" ] && bom=1; done
code=503
if [ "$bom" = 1 ]; then case "$url" in */app) code=307 ;; *) code=200 ;; esac; fi
printf '%s' "$code"
EOF2
  cat > "$CRM_DIR/hostgator-setup-kit/backup.sh" <<'EOF2'
#!/usr/bin/env bash
echo "BACKUP_RODOU" >> "$FAKE_LOG"
echo "dump com POSTGRES_PASSWORD=SENHA_FALSA_123 vazado pelo stub"
exit "${FAKE_BACKUP_RC:-0}"
EOF2
  cat > "$T/baseline.sh" <<'EOF2'
#!/usr/bin/env bash
echo "BASELINE_APLICADO" >> "$FAKE_LOG"
EOF2
  chmod +x "$T/bin/"* "$CRM_DIR/hostgator-setup-kit/backup.sh" "$T/baseline.sh"
  export T CRM_DIR FAKE_LOG GHCR_OWNER="$OWNER" HEALTH_TIMEOUT=2 HEALTH_INTERVAL=0.1 \
    ROLLBACK_TIMEOUT=2 APLICAR_BASELINE_CMD="$T/baseline.sh" LOCK_DIR="$T/locks" \
    BACKUP_CMD="bash $CRM_DIR/hostgator-setup-kit/backup.sh" DEPLOY_LOG="$T/deploy.log" \
    HEALTH_BASE_URL="http://localhost:3000"
  export PATH="$T/bin:$PATH"
}

env_tag() { sed -n 's/^APP_IMAGE=.*://p' "$CRM_DIR/.env" | head -1; }
limpa() { rm -rf "${T:-/nonexistent-xyz}"; }
