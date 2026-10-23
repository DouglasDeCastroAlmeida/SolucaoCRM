#!/usr/bin/env bash
# Funções comuns das ações administrativas (não é uma ação: sem número, é só "source").
# Cada ação aceita --dry-run: imprime o que FARIA e não executa nada.
DRY=0

DESFAZER=""
msg() { printf '%s\n' "$*"; }
erro() { printf 'ERRO: %s\n' "$*" >&2; }

# roda <comando...>: executa, ou só imprime em --dry-run
roda() {
  if [ "$DRY" = 1 ]; then printf '[dry-run] faria: %s\n' "$*"; else "$@"; fi
}

# grava <destino> <modo>: grava o stdin no destino (atômico), ou só descreve em --dry-run
grava() {
  local destino="$1" modo="$2" tmp
  if [ "$DRY" = 1 ]; then
    printf '[dry-run] faria: gravar %s (modo %s) com:\n' "$destino" "$modo"; sed 's/^/[dry-run]   | /'
  else
    tmp="$(mktemp "${destino}.XXXXXX")"; cat > "$tmp"; chmod "$modo" "$tmp"; mv -f "$tmp" "$destino"
  fi
}

exige_root() {
  [ "$DRY" = 1 ] && return 0
  [ "$(id -u)" -eq 0 ] || { erro "rode como root (sudo) — ou use --dry-run para só ver o plano."; exit 1; }
}

cabecalho() { [ "$DRY" != 1 ] || msg "[dry-run] nada será executado; abaixo o que esta ação faria."; }
