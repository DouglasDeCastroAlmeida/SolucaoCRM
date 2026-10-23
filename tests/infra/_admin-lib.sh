#!/usr/bin/env bash
# Biblioteca dos testes das ações de infra/solucao/admin/: ambiente descartável com
# `id` falso (uid 0, para passar na checagem de root) e dublês registrando em $CHAMADAS.
source "$(dirname "${BASH_SOURCE[0]}")/_deploy-lib.sh"
ADMIN="$REPO_ROOT/infra/solucao/admin"

admin_ambiente() {
  T="$(mktemp -d)"; mkdir -p "$T/bin"
  export CHAMADAS="$T/chamadas.log"; : > "$CHAMADAS"
  fake id 'case "$*" in "-u") echo 0 ;; *) exec /usr/bin/id "$@" ;; esac'
  export PATH="$T/bin:$PATH"
}

# fake <nome> <corpo>: cria um executável falso em $T/bin
fake() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$T/bin/$1"; chmod +x "$T/bin/$1"; }

# fake_registra <nome...>: dublês que só registram a chamada e saem 0
fake_registra() { local c; for c in "$@"; do fake "$c" "echo \"$c \$*\" >> \"\$CHAMADAS\""; done; }

fim() { # fim <nome>
  echo
  if [ "$FALHAS" -eq 0 ]; then echo "$1: OK"; else echo "$1: $FALHAS falha(s)"; exit 1; fi
}
