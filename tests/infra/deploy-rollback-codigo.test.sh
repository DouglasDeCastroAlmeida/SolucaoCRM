#!/usr/bin/env bash
# AC-006.2: o rollback devolve também o CÓDIGO ao commit anterior (não só imagens e .env).
# Sem isso, os arquivos de compose do commit antigo podem sumir e o rollback não sobe.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"

monta_ambiente
G="$T/git"; mkdir -p "$G"
git init -q --bare "$G/origin.git"
cd "$CRM_DIR" || exit 1
git init -q . && git config user.email t@t && git config user.name t
echo um > marca.txt && git add marca.txt && git commit -q -m um && C1="$(git rev-parse HEAD)"
git remote add origin "$G/origin.git"
echo dois > marca.txt && git commit -qam dois && C2="$(git rev-parse HEAD)"
git push -q origin HEAD:refs/heads/main 2>/dev/null
git checkout -q --detach "$C1"
# o .env/compose não são versionados neste teste; só o commit importa

echo "AC-006.2: deploy para C2 fica doente -> rollback"
FAKE_SAUDAVEL_TAGS="$SHA_A" bash "$DEPLOY" hml "$C2" >"$T/out" 2>&1; rc=$?
afirma "sai 10 (falhou e voltou)" test "$rc" -eq 10
afirma "o código voltou ao commit anterior (C1)" test "$(git rev-parse HEAD)" = "$C1"
afirma "o .env voltou à tag anterior" test "$(env_tag)" = "$SHA_A"

cd /; limpa
[ "$FALHAS" -eq 0 ] && echo "deploy-rollback-codigo: OK" || { echo "deploy-rollback-codigo: $FALHAS falha(s)"; exit 1; }
