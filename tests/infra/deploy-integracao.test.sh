#!/usr/bin/env bash
# Integração SSH/dono, rollback do primeiro deploy e mascaramento ampliado.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"

echo "SSH_ORIGINAL_COMMAND válido e dono"
monta_ambiente; unset GHCR_OWNER
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B"
SSH_ORIGINAL_COMMAND="deploy.sh hml $SHA_B" bash "$DEPLOY" >"$T/out" 2>&1; rc=$?
afirma "comando SSH válido sai 0" test "$rc" -eq 0
afirma "dono derivado da APP_IMAGE do .env" grep -q "ghcr.io/$OWNER/deskcommcrm:$SHA_B" "$CRM_DIR/.env"
SSH_ORIGINAL_COMMAND="hml $SHA_A outro-dono" bash "$DEPLOY" >"$T/out" 2>&1
afirma "3º campo (dono) do comando SSH vence a APP_IMAGE" grep -q "ghcr.io/outro-dono/deskcommcrm:$SHA_A" "$CRM_DIR/.env"
GHCR_OWNER=viaenv bash "$DEPLOY" hml "$SHA_B" dono-arg >"$T/out" 2>&1
afirma "argumento vence GHCR_OWNER" grep -q "ghcr.io/dono-arg/" "$CRM_DIR/.env"
GHCR_OWNER=viaenv bash "$DEPLOY" hml "$SHA_A" >"$T/out" 2>&1
afirma "GHCR_OWNER vence a APP_IMAGE" grep -q "ghcr.io/viaenv/" "$CRM_DIR/.env"
limpa

echo "comandos SSH hostis são recusados antes de tocar .env/docker"
monta_ambiente; unset GHCR_OWNER
for ruim in "deploy.sh hml $SHA_B; rm -rf /" "deploy.sh hml \$(id)" "deploy.sh  hml $SHA_B" "deploy.sh hml $SHA_B " \
            "deploy.sh hml $SHA_B dono extra" "deploy.sh hml $SHA_B Dono" "deploy.sh hml latest" "ls" "deploy.sh hml $SHA_B \`id\`" "deploy.sh hml $SHA_B&&id"; do
  antes="$(cat "$CRM_DIR/.env")"; : > "$FAKE_LOG"
  SSH_ORIGINAL_COMMAND="$ruim" bash "$DEPLOY" >"$T/out" 2>&1; rc=$?
  afirma "recusa: $ruim" test "$rc" -eq 2
  afirma "  .env intacto e docker não chamado" test "$(cat "$CRM_DIR/.env")" = "$antes" -a ! -s "$FAKE_LOG"
done
bash "$DEPLOY" hml "$SHA_B" "dono;ruim" >"$T/out" 2>&1; afirma "dono posicional inválido recusado" test "$?" -eq 2
bash "$DEPLOY" hml "$SHA_B" a b >"$T/out" 2>&1; afirma "4º argumento recusado" test "$?" -eq 2
limpa

echo "sem dono resolvível: mensagem clara"
monta_ambiente; unset GHCR_OWNER
sed -i '/^APP_IMAGE=/d' "$CRM_DIR/.env"
bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "sai 2" test "$rc" -eq 2
afirma "mensagem em português" grep -q "dono das imagens não resolvido" "$T/out"
limpa

echo "AC-006.2: primeiro deploy sem tags prévias que falha -> .env idêntico, código 10"
monta_ambiente
sed -i '/_IMAGE=/d' "$CRM_DIR/.env"
export FAKE_SAUDAVEL_TAGS="" 
# no rollback o .env original (sem tags) precisa responder: simulamos saúde "sem tag"
cp "$CRM_DIR/.env" "$T/original"
cat > "$T/bin/curl" <<'EOF2'
#!/usr/bin/env bash
url=""; for a in "$@"; do url="$a"; done
if grep -q '^APP_IMAGE=' "$CRM_DIR/.env"; then printf 503; exit 0; fi
case "$url" in */app) printf 307 ;; *) printf 200 ;; esac
EOF2
chmod +x "$T/bin/curl"
GHCR_OWNER=$OWNER bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
afirma "sai 10" test "$rc" -eq 10
afirma ".env byte a byte igual ao original" cmp -s "$CRM_DIR/.env" "$T/original"
limpa

echo "pull falhando durante o rollback não impede o rollback"
monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A"
FAKE_PULL_FALHA=1 bash "$DEPLOY" hml "$SHA_B" >"$T/out" 2>&1; rc=$?
# o pull falha já no deploy novo (-> rollback); no rollback segue com o cache
afirma "sai 10 (voltou)" test "$rc" -eq 10
afirma "avisou que usa imagens locais" grep -q "usando as imagens já presentes" "$T/out"
afirma "up do rollback foi executado" bash -c "test \$(grep -c ' up ' '$FAKE_LOG') -ge 1"
afirma ".env voltou" test "$(env_tag)" = "$SHA_A"
limpa

echo "AC-012.2: mascaramento ampliado e .env com CRLF"
monta_ambiente
export FAKE_SAUDAVEL_TAGS="$SHA_A $SHA_B"
printf 'COOKIE_SECRETO=valor-do-cookie-777\r\nSAL_SALT=sal-secreto-888\r\nAPP_IMAGE=ghcr.io/%s/deskcommcrm:%s\r\n' "$OWNER" "$SHA_A" >> "$CRM_DIR/.env"
sed -i '/^APP_IMAGE=.*[^\r]$/d' "$CRM_DIR/.env"
cat > "$CRM_DIR/hostgator-setup-kit/backup.sh" <<'EOF2'
#!/usr/bin/env bash
echo "vazou valor-do-cookie-777 e sal-secreto-888"
EOF2
bash "$DEPLOY" prod "$SHA_B" >"$T/out" 2>&1
afirma "valor de COOKIE_SECRETO mascarado" bash -c "! grep -q 'valor-do-cookie-777' '$T/out' '$DEPLOY_LOG'"
afirma "valor de chave com SALT mascarado" bash -c "! grep -q 'sal-secreto-888' '$T/out' '$DEPLOY_LOG'"
afirma "com CRLF o valor foi limpo do \r (máscara aplicada)" grep -q '\*\*\*' "$DEPLOY_LOG"
limpa

[ "$FALHAS" -eq 0 ] && echo "deploy-integracao: OK" || { echo "deploy-integracao: $FALHAS falha(s)"; exit 1; }
