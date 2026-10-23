#!/usr/bin/env bash
# T-026 {AC-001.4}: 04-mover-vava copia o vava INTEIRO (inclusive alterações locais não
# commitadas) antes de qualquer troca de portas, e --desfazer restaura byte a byte.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"
MOVER="$REPO_ROOT/infra/solucao/admin/04-mover-vava.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export VAVA_DIR="$T/opt/vava" BACKUPS_DIR="$T/root/backups"
mkdir -p "$T/bin"; printf '#!/usr/bin/env bash
case "$*" in "-u") echo 0 ;; *) exec /usr/bin/id "$@" ;; esac
' > "$T/bin/id"; chmod +x "$T/bin/id"; export PATH="$T/bin:$PATH"
mkdir -p "$VAVA_DIR" "$BACKUPS_DIR"
git -C "$VAVA_DIR" init -q
printf 'versao commitada\n' > "$VAVA_DIR/app.txt"; printf 'estavel\n' > "$VAVA_DIR/fixo.txt"
git -C "$VAVA_DIR" add . && git -C "$VAVA_DIR" -c user.email=t@t -c user.name=t commit -qm base
printf 'ALTERACAO LOCAL NAO COMMITADA\n' > "$VAVA_DIR/app.txt"
printf 'arquivo novo sem git\n' > "$VAVA_DIR/novo.txt"
printf '\000\001\377 binario\n' > "$VAVA_DIR/bin.dat"
cp -a "$VAVA_DIR" "$T/original"

echo "AC-001.4: --dry-run não cria nada"
bash "$MOVER" --dry-run >"$T/out" 2>&1; rc=$?
afirma "AC-001.4: dry-run sai 0" test "$rc" -eq 0
afirma "AC-001.4: dry-run não criou cópia" test -z "$(ls -A "$BACKUPS_DIR")"

echo "AC-001.4: cópia completa"
bash "$MOVER" >"$T/out" 2>&1; rc=$?
afirma "AC-001.4: cópia sai 0" test "$rc" -eq 0
COPIA="$(ls -d "$BACKUPS_DIR"/vava-* 2>/dev/null | head -1)"
afirma "AC-001.4: pasta vava-<data> existe" test -n "$COPIA"
afirma "AC-001.4: árvore copiada idêntica ao original" diff -r "$COPIA/arvore" "$T/original"
afirma "AC-001.4: alteração não commitada preservada" grep -q 'ALTERACAO LOCAL' "$COPIA/arvore/app.txt"
afirma "AC-001.4: patch registra a alteração local" grep -q 'ALTERACAO LOCAL' "$COPIA/alteracoes.patch"
afirma "AC-001.4: status registra o arquivo novo" grep -q 'novo.txt' "$COPIA/status.txt"
afirma "AC-001.4: original intacto" diff -r "$VAVA_DIR" "$T/original"
afirma "AC-001.4: saída ensina o --desfazer" grep -q -- '--desfazer' "$T/out"

echo "AC-001.4: --desfazer restaura byte a byte"
printf 'estragado\n' > "$VAVA_DIR/app.txt"; rm -f "$VAVA_DIR/fixo.txt"; printf 'lixo\n' > "$VAVA_DIR/intruso.txt"
bash "$MOVER" --desfazer "$COPIA" >"$T/out" 2>&1; rc=$?
afirma "AC-001.4: desfazer sai 0" test "$rc" -eq 0
afirma "AC-001.4: vava igual ao original byte a byte" diff -r "$VAVA_DIR" "$T/original"
afirma "AC-001.4: estado anterior guardado (não apagado)" bash -c "ls -d '$T/opt'/vava.antes-desfazer-* >/dev/null"

echo "AC-001.4: --desfazer recusa pasta inválida"
bash "$MOVER" --desfazer "$T/nao-existe" >/dev/null 2>&1; afirma "AC-001.4: recusa pasta inexistente" test "$?" -ne 0
mkdir "$T/vazia"; bash "$MOVER" --desfazer "$T/vazia" >/dev/null 2>&1; afirma "AC-001.4: recusa pasta sem arvore/" test "$?" -ne 0
bash "$MOVER" --desfazer >/dev/null 2>&1; afirma "AC-001.4: recusa sem argumento" test "$?" -ne 0
bash "$MOVER" --desfazer "$COPIA/../$(basename "$COPIA")" >/dev/null 2>&1; afirma "AC-001.4: recusa caminho com .." test "$?" -ne 0
mkdir -p "$T/semstatus"; cp -a "$COPIA/arvore" "$T/semstatus/arvore"
bash "$MOVER" --desfazer "$T/semstatus" >/dev/null 2>&1; afirma "AC-001.4: recusa cópia sem status.txt" test "$?" -ne 0
afirma "AC-001.4: recusas não mexeram no vava" diff -r "$VAVA_DIR" "$T/original"

echo "AC-001.4: cópia privada (700) e checagem de espaço"
mkdir "$T/probe"; chmod 700 "$T/probe"
if [ "$(stat -c %a "$T/probe")" = 700 ]; then
afirma "AC-001.4: pasta de backups 700" test "$(stat -c %a "$BACKUPS_DIR")" = 700
afirma "AC-001.4: pasta da cópia 700" test "$(stat -c %a "$COPIA")" = 700
else echo "  (pulado: este sistema de arquivos não guarda modo POSIX; vale no CI/Linux)"; fi
antes="$(ls "$BACKUPS_DIR" | wc -l)"
printf '#!/usr/bin/env bash\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\n/dev/x 100 1 1 1pct /\\n"\n' > "$T/bin/df"; chmod +x "$T/bin/df"
sleep 1  # a pasta da cópia leva a hora no nome; sem isto, no Linux a 2ª execução cai no mesmo segundo e recusa por "já existe"
bash "$MOVER" >"$T/out" 2>&1; rc=$?
afirma "AC-001.4: espaço insuficiente aborta" test "$rc" -ne 0
afirma "AC-001.4: aviso fala de espaço" grep -qi 'espa' "$T/out"
afirma "AC-001.4: nada foi copiado" test "$(ls "$BACKUPS_DIR" | wc -l)" -eq "$antes"
rm -f "$T/bin/df"

echo
if [ "$FALHAS" -eq 0 ]; then echo "mover-vava: OK"; else echo "mover-vava: $FALHAS falha(s)"; exit 1; fi
