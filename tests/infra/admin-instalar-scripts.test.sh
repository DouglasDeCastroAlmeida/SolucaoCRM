#!/usr/bin/env bash
# {AC-008.5, AC-008.4} 06-instalar-scripts: copia SÓ a lista explícita para /opt/crm-deploy,
# root:root 0755, recusa se faltar algum, imprime o sha256 de cada um.
set -uo pipefail
source "$(dirname "$0")/_admin-lib.sh"
INST="$ADMIN/06-instalar-scripts.sh"
admin_ambiente; trap 'rm -rf "$T"' EXIT
fake install 'echo "install $*" >> "$CHAMADAS"'
export INFRA_SRC="$T/src" CRM_DEPLOY_DIR="$T/dest"; mkdir -p "$INFRA_SRC"
LISTA="deploy.sh backup-externo.sh restaurar-backup-externo.sh medir-memoria.sh alerta.sh"
for f in $LISTA crm-status.sh extra-nao-listado.sh; do printf '#!/usr/bin/env bash\necho %s\n' "$f" > "$INFRA_SRC/$f"; done

echo "AC-008.5: copia exatamente a lista, root:root 0755, com sha256"
bash "$INST" >"$T/o" 2>&1; rc=$?
afirma "sai 0" test "$rc" -eq 0
for f in $LISTA; do
  afirma "instala $f com install -m 0755 -o root -g root" grep -qF "install -m 0755 -o root -g root $INFRA_SRC/$f $CRM_DEPLOY_DIR/$f" "$CHAMADAS"
  afirma "imprime o sha256 de $f" grep -qE "^[0-9a-f]{64}  *.*$f" "$T/o"
done
afirma "só 5 arquivos instalados (+ a pasta)" test "$(grep -c 'install -m 0755' "$CHAMADAS")" -eq 5
afirma "não copia o que não está na lista" bash -c "! grep -qE 'extra-nao-listado|crm-status' '$CHAMADAS'"
afirma "cria a pasta root:root 755" grep -qF "install -d -m 755 -o root -g root $CRM_DEPLOY_DIR" "$CHAMADAS"

echo "AC-008.5: falta um arquivo -> recusa tudo (nada é copiado)"
rm -f "$INFRA_SRC/medir-memoria.sh"; : > "$CHAMADAS"
bash "$INST" >"$T/o" 2>&1; rc=$?
afirma "sai != 0" test "$rc" -ne 0
afirma "nada instalado" test ! -s "$CHAMADAS"
afirma "nomeia o que falta" grep -q 'medir-memoria.sh' "$T/o"

echo "AC-008.5: dry-run não instala; com arquivo faltando só avisa"
bash "$INST" --dry-run >"$T/o" 2>&1; rc=$?
afirma "dry-run sai 0" test "$rc" -eq 0
afirma "dry-run não chamou install" test ! -s "$CHAMADAS"
afirma "dry-run avisa do faltante" grep -qi 'medir-memoria.sh' "$T/o"
: > "$INFRA_SRC/medir-memoria.sh"
bash "$INST" --dry-run >"$T/o" 2>&1
afirma "dry-run mostra o plano de deploy.sh" grep -qF "install -m 0755 -o root -g root $INFRA_SRC/deploy.sh" "$T/o"
afirma "cabeçalho explica que atualizar é ação administrativa" grep -qi 'rode.*de novo\|rodar.*de novo\|administrativ' "$INST"

fim admin-instalar-scripts
