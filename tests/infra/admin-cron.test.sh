#!/usr/bin/env bash
# {AC-008.5} 05-cron: só instala linhas de scripts que existem; não apaga linhas alheias
# quando o crontab falha por outro motivo; idempotente.
set -uo pipefail
source "$(dirname "$0")/_admin-lib.sh"
CRON="$ADMIN/05-cron.sh"
admin_ambiente; trap 'rm -rf "$T"' EXIT
export CRM_DEPLOY_DIR="$T/crm-deploy"; mkdir -p "$CRM_DEPLOY_DIR"
export CRM_PROD_DIR="$T/crm-prod"
export TAB="$T/tab"
fake install 'echo "install $*" >> "$CHAMADAS"'
fake crontab 'if [ "$3" = -l ]; then
  if [ -n "${FAKE_CRON_ERRO:-}" ]; then echo "crontab: cannot open spool" >&2; exit 1; fi
  if [ -f "$TAB" ]; then cat "$TAB"; else echo "no crontab for deploy" >&2; exit 1; fi
else echo ESCREVEU >> "$CHAMADAS"; cat > "$TAB"; fi'

echo "AC-008.5: alvo ausente -> pula com aviso"
: > "$CRM_DEPLOY_DIR/backup-externo.sh"
bash "$CRON" >"$T/o" 2>&1; rc=$?
afirma "sai 0 (sem crontab prévio)" test "$rc" -eq 0
afirma "instalou o backup" grep -q 'backup-externo.sh' "$TAB"
afirma "não instalou medir-memoria (ausente)" bash -c "! grep -q medir-memoria '$TAB'"
afirma "avisa que pulou medir-memoria" grep -qi 'medir-memoria.*\(ausente\|pul\)' "$T/o"

echo "AC-008.5: com os dois alvos e linha alheia -> idempotente"
: > "$CRM_DEPLOY_DIR/medir-memoria.sh"; echo '0 1 * * * /outra' > "$TAB"
bash "$CRON" >"$T/o" 2>&1; cp "$TAB" "$T/tab1"; bash "$CRON" >"$T/o" 2>&1
afirma "mantém a linha alheia" grep -q '/outra' "$TAB"
afirma "duas linhas marcadas" test "$(grep -c '# crm-solucao' "$TAB")" -eq 2
afirma "segunda execução não muda nada" cmp -s "$TAB" "$T/tab1"
afirma "linha exata do backup" grep -qxF "17 3 * * * cd $CRM_PROD_DIR && BACKUP_ENV_FILE=$CRM_DEPLOY_DIR/.env.backup ALERTA_CMD=$CRM_DEPLOY_DIR/alerta.sh $CRM_DEPLOY_DIR/backup-externo.sh --gerar >/dev/null 2>&1 # crm-solucao" "$TAB"
afirma "linha exata do medir-memoria" grep -qxF "*/10 * * * * ALERTA_CMD=$CRM_DEPLOY_DIR/alerta.sh DATA_DIR=$CRM_DEPLOY_DIR/dados $CRM_DEPLOY_DIR/medir-memoria.sh >/dev/null 2>&1 # crm-solucao" "$TAB"
afirma "cria DATA_DIR 750 deploy:deploy (uma vez por execução)" grep -qxF "install -d -m 750 -o deploy -g deploy $CRM_DEPLOY_DIR/dados" "$CHAMADAS"

echo "AC-008.5: crontab -l falha por outro motivo -> aborta sem reescrever"
cp "$TAB" "$T/tab2"; : > "$CHAMADAS"
FAKE_CRON_ERRO=1 bash "$CRON" >"$T/o" 2>&1; rc=$?
afirma "sai != 0" test "$rc" -ne 0
afirma "não reescreveu o crontab" bash -c "! grep -q ESCREVEU '$CHAMADAS'"
afirma "crontab intacto" cmp -s "$TAB" "$T/tab2"

echo "AC-008.5: linhas de outros donos sobrevivem byte a byte"
DRENO='* * * * * curl -fsS -H @"/opt/crm-prod/.env.cron-drain" "https://app.corretora.io/api/v1/cron/event-log-drain" >/dev/null 2>&1 # deskcomm:/opt/crm-prod:drain'
AGENTE='*/5 * * * * cd /opt/crm-prod && bash hostgator-setup-kit/agent.sh >/dev/null 2>&1 # deskcomm:/opt/crm-prod:agent'
printf '%s\n%s\n' "$DRENO" "$AGENTE" > "$TAB"
bash "$CRON" >"$T/o" 2>&1
afirma "dreno intacto após instalar" grep -qxF "$DRENO" "$TAB"
afirma "agente intacto após instalar" grep -qxF "$AGENTE" "$TAB"
bash "$CRON" >"$T/o" 2>&1
afirma "dreno intacto após reinstalar" grep -qxF "$DRENO" "$TAB"
afirma "agente intacto após reinstalar" grep -qxF "$AGENTE" "$TAB"
afirma "sem duplicar as linhas alheias" test "$(grep -c 'deskcomm:' "$TAB")" -eq 2

echo "AC-008.5: dry-run mostra o DATA_DIR e não instala"
: > "$CHAMADAS"; cp "$TAB" "$T/tab3"
bash "$CRON" --dry-run >"$T/o" 2>&1
afirma "dry-run anuncia a criação do dados" grep -qF "install -d -m 750 -o deploy -g deploy $CRM_DEPLOY_DIR/dados" "$T/o"
afirma "dry-run não chamou install" test ! -s "$CHAMADAS"
afirma "dry-run não mexeu no crontab" cmp -s "$TAB" "$T/tab3"

fim admin-cron
