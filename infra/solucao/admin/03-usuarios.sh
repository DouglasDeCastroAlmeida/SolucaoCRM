#!/usr/bin/env bash
# Ação administrativa 03: usuários `deploy` e `dev` e o atalho crm-status. {AC-008.4, AC-008.3, AC-008.5}
#
#  - deploy: grupo docker, sem senha, shell /bin/bash. authorized_keys e ~/.ssh são de root (644/755): o deploy não reescreve o command=. SÓ entra com a chave
#    do pipeline, e essa chave só executa /usr/local/bin/crm-deploy (command=…, sem pty,
#    sem forwarding). O wrapper chama /opt/crm-deploy/deploy.sh; o SSH_ORIGINAL_COMMAND
#    chega ao deploy.sh por herança de ambiente.
#  - dev (Claude Code): fora dos grupos docker e deploy; /opt/crm-prod e /opt/crm-hml ficam
#    deploy:deploy 750 (o deploy.sh grava o .env e faz git checkout ali); dev não tem NENHUM acesso.
#    O chown é recursivo só na árvore do repositório, com -xdev, e NÃO atravessa .runtime nem
#    backups (volumes Docker podem ter arquivos de root/postgres que não se deve tocar).
#  - /etc/sudoers.d/crm-status: o dev roda UM comando exato, sem argumentos livres.
#
# Uso:
#   03-usuarios.sh [--dry-run] [--confirmo-remover-dev-dos-grupos] <chave-do-pipeline.pub>
#   03-usuarios.sh --gerar-authorized-keys <chave.pub>   (só imprime a linha; não altera nada)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
REPO_INFRA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPCOES='restrict,command="/usr/local/bin/crm-deploy",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc'
PADRAO_CHAVE='^ssh-ed25519 [A-Za-z0-9+/]{60,100}={0,2}( [A-Za-z0-9._@+-]+)?$'

# Gera a linha do authorized_keys. Aceita só UMA linha `ssh-ed25519 <base64> [comentário-simples]`.
gerar_authorized_keys() {
  local arq="$1" linha
  [ -f "$arq" ] || { erro "arquivo de chave não encontrado: $arq"; return 1; }
  [ "$(LC_ALL=C grep -c '' "$arq")" = 1 ] || { erro "o arquivo deve ter exatamente UMA linha."; return 1; }
  linha="$(LC_ALL=C head -n1 "$arq")"
  if ! LC_ALL=C bash -c '[[ "$1" =~ $2 ]]' _ "$linha" "$PADRAO_CHAVE"; then
    erro "chave recusada: só ssh-ed25519 sem opções, aspas ou quebra de linha (comentário: letras, números, . _ @ + -)."
    return 1
  fi
  printf '%s %s\n' "$OPCOES" "$linha"
}

ARQ_CHAVE=""; CONFIRMA_DEV=0
while [ $# -gt 0 ]; do
  case "$1" in
    --gerar-authorized-keys)
      [ $# -eq 2 ] || { erro "uso: --gerar-authorized-keys <chave.pub>"; exit 2; }
      gerar_authorized_keys "$2"; exit $? ;;
    --dry-run) DRY=1 ;;
    --confirmo-remover-dev-dos-grupos) CONFIRMA_DEV=1 ;;
    -*) erro "argumento desconhecido: $1"; exit 2 ;;
    *) [ -z "$ARQ_CHAVE" ] || { erro "informe só uma chave."; exit 2; }; ARQ_CHAVE="$1" ;;
  esac
  shift
done
[ -n "$ARQ_CHAVE" ] || { erro "uso: 03-usuarios.sh [--dry-run] <chave-do-pipeline.pub>"; exit 2; }
LINHA="$(gerar_authorized_keys "$ARQ_CHAVE")"
cabecalho; exige_root

# 1. usuário deploy
if [ "$DRY" = 1 ] || ! id deploy >/dev/null 2>&1; then
  roda groupadd -f docker
  roda useradd -m -s /bin/bash -G docker deploy
  roda usermod -p '*' deploy   # sem senha utilizável, mas sem conta travada (sshd aceita chave)
else
  msg "usuário deploy já existe."
  roda usermod -aG docker deploy
fi

# 2. ~/.ssh e authorized_keys: tudo de root, para o deploy NÃO conseguir reescrever o command=.
#    O sshd (StrictModes) aceita: dono root, sem escrita para grupo/outros. A home passa a ser
#    root:root 755; o deploy mantém ~/.docker (login no GHCR) como dele.
HOME_DEPLOY="${DEPLOY_HOME:-/home/deploy}"
roda chown root:root "$HOME_DEPLOY"
roda chmod 755 "$HOME_DEPLOY"
roda install -d -m 755 -o root -g root "$HOME_DEPLOY/.ssh"
printf '%s\n' "$LINHA" | grava "$HOME_DEPLOY/.ssh/authorized_keys" 644
roda chown root:root "$HOME_DEPLOY/.ssh/authorized_keys"
roda install -d -m 700 -o deploy -g deploy "$HOME_DEPLOY/.docker"

# 3. wrapper do pipeline e scripts do deploy: root:root, o deploy executa mas não reescreve
printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail' \
  '# SSH_ORIGINAL_COMMAND chega por ambiente; o deploy.sh a interpreta e recusa o que não conhece.' \
  'exec /opt/crm-deploy/deploy.sh "$@"' | grava /usr/local/bin/crm-deploy 755
roda chown root:root /usr/local/bin/crm-deploy
OPT_DIR="${OPT_DIR:-/opt}"
roda install -d -m 755 -o root -g root "$OPT_DIR/crm-deploy"
if [ -d "$OPT_DIR/crm-deploy" ]; then
  roda chown -R root:root "$OPT_DIR/crm-deploy"
  roda chmod -R go-w "$OPT_DIR/crm-deploy"
  roda chmod 755 "$OPT_DIR/crm-deploy"
fi

# 4. dev: fora do docker e do grupo deploy. É DESTRUTIVO, então só age se for membro, mostra
#    antes quem será removido e exige --confirmo-remover-dev-dos-grupos.
REMOVER=()
for g in docker deploy; do
  if id -nG dev 2>/dev/null | tr ' ' '\n' | grep -qx "$g"; then REMOVER+=("$g"); fi
done
if [ "${#REMOVER[@]}" -eq 0 ]; then
  msg "dev não é membro dos grupos docker/deploy — nada a remover."
else
  msg "dev é membro de: ${REMOVER[*]} — e será removido desses grupos."
  if [ "$CONFIRMA_DEV" = 1 ]; then
    for g in "${REMOVER[@]}"; do roda gpasswd -d dev "$g"; done
  else
    msg "NÃO removi: rode de novo com --confirmo-remover-dev-dos-grupos para executar a remoção. Sigo com o resto."
  fi
fi
for nome in crm-prod crm-hml; do
  d="$OPT_DIR/$nome"
  existia=0; [ ! -d "$d" ] || existia=1
  roda install -d -m 750 -o deploy -g deploy "$d"   # cria se faltar; se existir, só acerta dono e modo
  if [ "$existia" = 1 ]; then
    roda chown deploy:deploy "$d"
    roda find "$d" -xdev \( -path "$d/.runtime" -o -path "$d/backups" \) -prune -o -not -type l -exec chown -h deploy:deploy {} +
    roda chmod 750 "$d"
  fi
done

# 5. atalho de leitura crm-status (root:root 0755: o dev não edita) + sudoers.
#    DECISÃO (AC-008.3): o sudoers libera EXATAMENTE três formas — sem argumento, `ps` e
#    `logs *`. O curinga só existe em `logs`; a validação rígida (container na allowlist,
#    1–500 linhas, no máximo 3 argumentos) mora DENTRO do script, que é de root.
roda install -m 0755 -o root -g root "$REPO_INFRA/crm-status.sh" /usr/local/bin/crm-status
SUDOERS='dev ALL=(root) NOPASSWD: /usr/local/bin/crm-status "", /usr/local/bin/crm-status ps, /usr/local/bin/crm-status logs *'
if [ "$DRY" = 1 ]; then
  printf '[dry-run] faria: validar com visudo -cf e instalar /etc/sudoers.d/crm-status (0440) com:\n[dry-run]   | %s\n' "$SUDOERS"
else
  tmp="$(mktemp)"; printf '%s\n' "$SUDOERS" > "$tmp"
  if visudo -cf "$tmp" >/dev/null; then
    install -m 0440 -o root -g root "$tmp" /etc/sudoers.d/crm-status; rm -f "$tmp"
  else
    rm -f "$tmp"; erro "sudoers inválido; nada foi instalado."; exit 1
  fi
fi
msg "usuários garantidos (deploy restrito ao pipeline; dev sem docker e sem ler /opt/crm-*)."
