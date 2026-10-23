#!/usr/bin/env bash
# T-017 {AC-008.4}: o gerador do authorized_keys do usuário `deploy` só produz linha
# restrita (command=…, sem pty/forwarding) e só aceita chave ssh-ed25519 limpa.
set -uo pipefail
source "$(dirname "$0")/_deploy-lib.sh"
USUARIOS="$REPO_ROOT/infra/solucao/admin/03-usuarios.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
CHAVE="AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoFKLguWtwzTiTUXZHqBZxcqFAB"

gera() { bash "$USUARIOS" --gerar-authorized-keys "$1"; }

echo "AC-008.4: chave ed25519 válida gera linha restrita"
printf 'ssh-ed25519 %s pipeline-deploy@github\n' "$CHAVE" > "$T/ok.pub"
saida="$(gera "$T/ok.pub" 2>"$T/err")"; rc=$?
afirma "AC-008.4: gerador sai 0" test "$rc" -eq 0
prefixo='restrict,command="/usr/local/bin/crm-deploy",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 '
afirma "AC-008.4: linha começa com command=… e restrições" test "${saida:0:${#prefixo}}" = "$prefixo"
afirma "AC-008.4: contém a chave pública" test "${saida#*"$CHAVE"}" != "$saida"
afirma "AC-008.4: é uma única linha" test "$(printf '%s\n' "$saida" | wc -l)" -eq 1

echo "AC-008.4: recusa o que não é ed25519 limpo"
recusa() { # recusa <descrição> <arquivo>
  local out rc; out="$(gera "$2" 2>&1)"; rc=$?
  afirma "AC-008.4: recusa $1 (saída != 0)" test "$rc" -ne 0
  afirma "AC-008.4: $1 não imprime linha de authorized_keys" test "${out#*no-pty}" = "$out"
}
printf 'ssh-rsa %s x@y\n' "$CHAVE" > "$T/rsa.pub"; recusa "ssh-rsa" "$T/rsa.pub"
printf 'ecdsa-sha2-nistp256 %s x@y\n' "$CHAVE" > "$T/ec.pub"; recusa "ecdsa" "$T/ec.pub"
printf 'ssh-ed25519 %s x@y\nssh-ed25519 %s outro\n' "$CHAVE" "$CHAVE" > "$T/duas.pub"; recusa "duas linhas" "$T/duas.pub"
printf 'ssh-ed25519 %s x@y\ncommand="rm -rf /" ssh-ed25519 %s z\n' "$CHAVE" "$CHAVE" > "$T/inj.pub"; recusa "quebra de linha com opções injetadas" "$T/inj.pub"
printf 'ssh-ed25519 %s x command="sh"\n' "$CHAVE" > "$T/cm.pub"; recusa "command= no comentário" "$T/cm.pub"
printf 'ssh-ed25519 %s x"y\n' "$CHAVE" > "$T/asp.pub"; recusa "aspas no comentário" "$T/asp.pub"
printf 'command="id" ssh-ed25519 %s x\n' "$CHAVE" > "$T/pre.pub"; recusa "opções antes do tipo" "$T/pre.pub"
printf 'ssh-ed25519 nao+base64!! x\n' > "$T/b64.pub"; recusa "corpo que não é base64" "$T/b64.pub"
: > "$T/vazio.pub"; recusa "arquivo vazio" "$T/vazio.pub"
recusa "arquivo inexistente" "$T/nao-existe.pub"

echo
if [ "$FALHAS" -eq 0 ]; then echo "isolamento-authorized-keys: OK"; else echo "isolamento-authorized-keys: $FALHAS falha(s)"; exit 1; fi
