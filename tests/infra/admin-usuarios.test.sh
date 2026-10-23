#!/usr/bin/env bash
# {AC-008.3, AC-008.4, AC-008.5} 03-usuarios (em --dry-run): sudoers mínimo, permissões que
# impedem o deploy de reescrever o command=, remoção do dev dos grupos só com flag.
set -uo pipefail
source "$(dirname "$0")/_admin-lib.sh"
USR="$ADMIN/03-usuarios.sh"
admin_ambiente; export OPT_DIR="$T/opt"; trap 'rm -rf "$T"' EXIT
for c in useradd usermod groupadd gpasswd chpasswd visudo crontab docker systemctl chown chmod install sudo; do
  fake "$c" "echo \"$c \$*\" >> \"\$CHAMADAS\"; exit 99"
done
fake id 'case "$*" in "-u") echo 0 ;; "-nG dev") echo "${FAKE_DEV_GRUPOS:-dev docker deploy}" ;; *) exec /usr/bin/id "$@" ;; esac'
printf 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoFKLguWtwzTiTUXZHqBZxcqFAB pipeline@ci\n' > "$T/chave.pub"

bash "$USR" --dry-run "$T/chave.pub" >"$T/base" 2>&1; rc=$?
afirma "dry-run sai 0" test "$rc" -eq 0
afirma "nenhum comando administrativo foi chamado" test ! -s "$CHAMADAS"

echo "AC-008.3: sudoers libera exatamente 3 formas"
grep '^\[dry-run\]   | dev ' "$T/base" | sed 's/^\[dry-run\]   | //' > "$T/sudoers"
ESPERADO='dev ALL=(root) NOPASSWD: /usr/local/bin/crm-status "", /usr/local/bin/crm-status ps, /usr/local/bin/crm-status logs *'
afirma "AC-008.3: uma única linha de sudoers" test "$(wc -l < "$T/sudoers")" -eq 1
afirma "AC-008.3: conteúdo exato" test "$(cat "$T/sudoers")" = "$ESPERADO"
afirma "AC-008.3: único curinga é o de 'logs *'" test "$(tr -cd '*' < "$T/sudoers" | wc -c)" -eq 1
afirma "AC-008.3: sem ALL=(ALL)" bash -c "! grep -q 'ALL=(ALL)' '$T/sudoers'"
afirma "AC-008.3: valida com visudo -cf" grep -q 'visudo -cf' "$T/base"
afirma "AC-008.3: crm-status instalado root:root 0755" grep -qE 'install -m 0755 -o root -g root .*crm-status.sh /usr/local/bin/crm-status' "$T/base"

echo "AC-008.4: permissões que impedem o deploy de reescrever o command="
afirma "authorized_keys começa com restrict,command=" grep -q 'restrict,command="/usr/local/bin/crm-deploy"' "$T/base"
afirma "authorized_keys modo 644" grep -q 'gravar /home/deploy/.ssh/authorized_keys (modo 644)' "$T/base"
afirma "authorized_keys dono root:root" grep -q 'chown root:root /home/deploy/.ssh/authorized_keys' "$T/base"
afirma "~/.ssh root:root 755" grep -q 'install -d -m 755 -o root -g root /home/deploy/.ssh' "$T/base"
echo "AC-008.4: pastas de /opt ausentes são criadas; presentes só são ajustadas"
O="$OPT_DIR"
afirma "ausente: cria crm-deploy root:root 755" grep -qF "install -d -m 755 -o root -g root $O/crm-deploy" "$T/base"
for d in crm-prod crm-hml; do
  afirma "ausente: cria $d deploy:deploy 750" grep -qF "install -d -m 750 -o deploy -g deploy $O/$d" "$T/base"
done
afirma "ausente: não faz chown/find recursivo em pasta que ainda não existe" bash -c "! grep -qE \"chown -R|find \" \"$T/base\""
mkdir -p "$O/crm-deploy" "$O/crm-prod" "$O/crm-hml"
bash "$USR" --dry-run "$T/chave.pub" >"$T/pres" 2>&1
afirma "presente: /opt/crm-deploy root:root, sem escrita para outros" bash -c "grep -qF \"chown -R root:root $O/crm-deploy\" \"$T/pres\" && grep -qF \"chmod -R go-w $O/crm-deploy\" \"$T/pres\""
for d in crm-prod crm-hml; do
  afirma "presente: $d deploy:deploy 750" bash -c "grep -qF \"install -d -m 750 -o deploy -g deploy $O/$d\" \"$T/pres\" && grep -qF \"chown deploy:deploy $O/$d\" \"$T/pres\" && grep -qF \"chmod 750 $O/$d\" \"$T/pres\""
  afirma "presente: $d chown recursivo poupa .runtime e backups" bash -c "grep -F \"find $O/$d -xdev\" \"$T/pres\" | grep -qF -- \"-path $O/$d/.runtime\" && grep -F \"find $O/$d -xdev\" \"$T/pres\" | grep -qF -- \"-path $O/$d/backups\""
done
afirma "nenhuma linha dá leitura ao dev em crm-prod/crm-hml" bash -c "! grep -E \"crm-(prod|hml)\" \"$T/pres\" | grep -qE \"[[:space:]]dev[[:space:]]|o\+r|o=r|chmod [0-7][0-7][1-7] \""

echo "AC-008.5: remoção do dev dos grupos exige flag"
afirma "lista quem será removido" grep -qE 'dev.*(docker)' "$T/base"
afirma "pede a flag explícita" grep -q -- '--confirmo-remover-dev-dos-grupos' "$T/base"
afirma "sem a flag não remove" bash -c "! grep -q 'faria: gpasswd' '$T/base'"
l_aviso="$(grep -n 'confirmo-remover' "$T/base" | head -1 | cut -d: -f1)"
afirma "o resto segue (instala o crm-status)" grep -q 'crm-status' "$T/base"
bash "$USR" --dry-run --confirmo-remover-dev-dos-grupos "$T/chave.pub" >"$T/com" 2>&1; rc=$?
afirma "com a flag sai 0" test "$rc" -eq 0
afirma "com a flag remove do docker" grep -q 'faria: gpasswd -d dev docker' "$T/com"
afirma "com a flag remove do deploy" grep -q 'faria: gpasswd -d dev deploy' "$T/com"
afirma "imprime a lista ANTES de remover" bash -c "[ \$(grep -nE 'membro|será removido' '$T/com' | head -1 | cut -d: -f1) -lt \$(grep -n 'faria: gpasswd' '$T/com' | head -1 | cut -d: -f1) ]"
FAKE_DEV_GRUPOS="dev" bash "$USR" --dry-run --confirmo-remover-dev-dos-grupos "$T/chave.pub" >"$T/nao" 2>&1
afirma "dev fora dos grupos: nada a remover" bash -c "! grep -q 'gpasswd' '$T/nao'"

fim admin-usuarios
