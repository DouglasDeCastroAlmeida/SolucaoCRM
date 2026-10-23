#!/usr/bin/env bash
# Ação administrativa 06: instala os scripts do deploy em /opt/crm-deploy. {AC-008.4, AC-008.5}
# Copia do checkout (infra/solucao) SÓ esta lista explícita, com `install -m 0755 -o root -g root`:
#   deploy.sh, backup-externo.sh, restaurar-backup-externo.sh, medir-memoria.sh
# Dono root:root: o usuário `deploy` EXECUTA mas não reescreve o que roda como ele.
# Se qualquer um faltar no checkout, a execução real recusa (nada é copiado). Imprime o
# sha256 de cada arquivo como evidência.
# ATUALIZAR o deployer é, de propósito, uma ação administrativa: depois de mudar um desses
# scripts no repositório, rode esta ação de novo (o pipeline não se atualiza sozinho).
# Uso: 06-instalar-scripts.sh [--dry-run]    (INFRA_SRC e CRM_DEPLOY_DIR existem para os testes)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; *) erro "argumento desconhecido: $a"; exit 2 ;; esac; done
cabecalho; exige_root
ORIGEM="${INFRA_SRC:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DESTINO="${CRM_DEPLOY_DIR:-/opt/crm-deploy}"
ARQUIVOS=(deploy.sh backup-externo.sh restaurar-backup-externo.sh medir-memoria.sh)

FALTAM=()
for f in "${ARQUIVOS[@]}"; do [ -f "$ORIGEM/$f" ] || FALTAM+=("$f"); done
if [ "${#FALTAM[@]}" -gt 0 ]; then
  if [ "$DRY" = 1 ]; then
    msg "[dry-run] AVISO: faltam em $ORIGEM: ${FALTAM[*]} — a execução real recusaria copiar."
  else
    erro "faltam em $ORIGEM: ${FALTAM[*]}. Nada foi copiado."; exit 1
  fi
fi

roda install -d -m 755 -o root -g root "$DESTINO"
for f in "${ARQUIVOS[@]}"; do
  [ -f "$ORIGEM/$f" ] || continue
  sha256sum "$ORIGEM/$f"
  roda install -m 0755 -o root -g root "$ORIGEM/$f" "$DESTINO/$f"
done
msg "scripts do deploy garantidos em $DESTINO (root:root 0755)."
