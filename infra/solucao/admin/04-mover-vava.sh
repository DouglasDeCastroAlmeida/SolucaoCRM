#!/usr/bin/env bash
# Ação administrativa 04: cópia COMPLETA do vava antes da troca de portas. {AC-001.4, AC-008.5}
# Copia /opt/vava (inclusive alterações locais não enviadas ao GitHub) para
# /root/backups/vava-<data>/ : arvore/ (cp -a, com .git), alteracoes.patch (git diff HEAD)
# e status.txt (git status). A troca em si das portas NÃO é feita aqui (fatia 6).
#
# Uso:
#   04-mover-vava.sh [--dry-run]
#   04-mover-vava.sh --desfazer <pasta-da-copia> [--dry-run]   restaura byte a byte;
#       o estado atual vai para <vava>.antes-desfazer-<data> (nada é apagado).
# Variáveis: VAVA_DIR (padrão /opt/vava), BACKUPS_DIR (padrão /root/backups).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
VAVA_DIR="${VAVA_DIR:-/opt/vava}"; BACKUPS_DIR="${BACKUPS_DIR:-/root/backups}"
ALVO_DESFAZER=""; MODO=copiar
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --desfazer)
      [ $# -ge 2 ] || { erro "uso: --desfazer <pasta-da-copia>"; exit 2; }
      MODO=desfazer; ALVO_DESFAZER="$2"; shift ;;
    *) erro "argumento desconhecido: $1"; exit 2 ;;
  esac
  shift
done
cabecalho
exige_root
DATA="$(date +%Y%m%d-%H%M%S)"; [ "$DRY" != 1 ] || DATA="<data>"
modos() { (cd "$1" && find . -printf '%m %u %g %p\n' | LC_ALL=C sort); }
GIT=(git -c "safe.directory=$VAVA_DIR" -C "$VAVA_DIR")

if [ "$MODO" = copiar ]; then
  DEST="$BACKUPS_DIR/vava-$DATA"
  if [ "$DRY" != 1 ]; then
    [ -d "$VAVA_DIR" ] || { erro "$VAVA_DIR não existe."; exit 1; }
    [ ! -e "$DEST" ] || { erro "$DEST já existe; tente de novo em instantes."; exit 1; }
  fi
  roda mkdir -p "$BACKUPS_DIR"
  roda chmod 700 "$BACKUPS_DIR"
  if [ "$DRY" = 1 ]; then
    msg "[dry-run] faria: conferir espaço livre em $BACKUPS_DIR (>= tamanho de $VAVA_DIR + 20%)"
  else
    chmod 700 "$BACKUPS_DIR"
    precisa_kb=$(( $(du -sk "$VAVA_DIR" | cut -f1) * 12 / 10 ))
    livre_kb="$(df -Pk "$BACKUPS_DIR" | awk 'NR==2{print $4}')"
    if [ "${livre_kb:-0}" -lt "$precisa_kb" ]; then
      erro "espaço insuficiente em $BACKUPS_DIR: livre ${livre_kb:-0} KB, preciso de $precisa_kb KB (origem + 20%)."; exit 1
    fi
  fi
  roda mkdir -p "$DEST/arvore"
  roda chmod 700 "$DEST"
  roda cp -a "$VAVA_DIR/." "$DEST/arvore/"
  if [ "$DRY" = 1 ]; then
    msg "[dry-run] faria: gravar $DEST/alteracoes.patch (git diff HEAD) e $DEST/status.txt (git status)"
    msg "[dry-run] faria: conferir a cópia com diff -r contra $VAVA_DIR"
  else
    if "${GIT[@]}" rev-parse --git-dir >/dev/null 2>&1; then
      "${GIT[@]}" diff HEAD > "$DEST/alteracoes.patch" || true
      "${GIT[@]}" status --porcelain=v1 -b > "$DEST/status.txt" || true
    else
      : > "$DEST/alteracoes.patch"; echo "(não é um repositório git)" > "$DEST/status.txt"
    fi
    diff -r "$VAVA_DIR" "$DEST/arvore" >/dev/null || { erro "a cópia difere do original; abortando."; exit 1; }
    [ "$(modos "$VAVA_DIR")" = "$(modos "$DEST/arvore")" ] || { erro "modos/donos da cópia diferem do original; abortando."; exit 1; }
    msg "cópia completa em: $DEST"
    msg "para reverter: $0 --desfazer $DEST"
  fi
else
  case "/$ALVO_DESFAZER/" in */../*) erro "caminho com '..' não é aceito: $ALVO_DESFAZER"; exit 1 ;; esac
  { [ -d "$ALVO_DESFAZER/arvore" ] && [ -f "$ALVO_DESFAZER/status.txt" ]; } \
    || { erro "pasta de cópia inválida (precisa de arvore/ e status.txt): $ALVO_DESFAZER"; exit 1; }
  ANTES="$VAVA_DIR.antes-desfazer-$DATA"
  if [ "$DRY" != 1 ]; then
    [ ! -e "$ANTES" ] || { erro "$ANTES já existe."; exit 1; }
    [ ! -e "$VAVA_DIR" ] || mv "$VAVA_DIR" "$ANTES"
    mkdir -p "$VAVA_DIR"
    cp -a "$ALVO_DESFAZER/arvore/." "$VAVA_DIR/"
  else
    roda mv "$VAVA_DIR" "$ANTES"
    roda mkdir -p "$VAVA_DIR"
    roda cp -a "$ALVO_DESFAZER/arvore/." "$VAVA_DIR/"
  fi
  msg "vava restaurado de $ALVO_DESFAZER (estado anterior em $ANTES)."
  msg "se havia containers do vava rodando, recrie-os (a troca de portas é da fatia 6)."
fi
