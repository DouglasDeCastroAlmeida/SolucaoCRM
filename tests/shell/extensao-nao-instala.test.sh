#!/usr/bin/env bash
# O comando de extensão do kit PREPARA, e não instala — e isto é uma cerca, não um comentário.
#
# A decisão (DEC-007, escolha 2) foi que o comando seja cliente da mesma porta que a tela usa.
# Medido em `lib/extensions/http.ts:41-93`, essa porta exige sessão com verificação em duas
# etapas, que um script no servidor não tem. Dar uma a ele significaria poder de plataforma
# atrás de um segredo em arquivo — a "segunda porta" que a decisão recusou.
#
# O risco real não é o script de hoje: é o de amanhã. Alguém com pressa acrescenta um `curl`
# para a rota de instalação, ou pega a service key do `.env` e escreve no banco, e a partir dali
# a auditoria passa a registrar instalação atribuída a quem não a fez. Este arquivo reprova isso.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="${RAIZ}/hostgator-setup-kit/extensao.sh"
falhas=0

ok()   { echo "  ok   — $1"; }
erro() { echo "  FALHA — $1" >&2; falhas=$((falhas + 1)); }

echo "extensao.sh — cerca e comportamento"

# ── A CERCA ─────────────────────────────────────────────────────────────────
for proibido in \
  '/api/v1/extensions/install' \
  '/api/v1/extensions/catalogs' \
  'SUPABASE_SERVICE_ROLE_KEY' \
  'INTERNAL_CRON_SECRET' \
  'psql'
do
  if grep -q "$proibido" "$SCRIPT"; then
    erro "o script passou a usar '$proibido' — instalar é pela tela, com 2 etapas e autoria"
  else
    ok "não usa '$proibido'"
  fi
done

# Controle positivo da sonda: se o grep estiver quebrado, tudo acima passa sem medir nada.
if grep -q 'catalogo.json' "$SCRIPT"; then
  ok "controle: a sonda enxerga texto que EXISTE no script"
else
  erro "controle falhou — o grep não achou 'catalogo.json', que existe; as checagens acima não valem"
fi

# ── COMPORTAMENTO ───────────────────────────────────────────────────────────
saida="$(mktemp)"; trap 'rm -f "$saida"' EXIT

if EXTENSOES_ORIGEM="https://origem.invalida.test" PROJECT_DIR="$(dirname "$saida")" \
   bash "$SCRIPT" listar >"$saida" 2>&1; then
  erro "origem inalcançável devolveu sucesso — falha de rede tem de falhar"
else
  ok "origem inalcançável devolve erro (e não sucesso silencioso)"
fi
grep -q "Não consegui baixar o catálogo" "$saida" \
  && ok "a mensagem diz o que houve, em português" \
  || erro "a mensagem de falha não explica nada a quem opera"

# A validação de FORMA, exercida direto — sem rede.
# A primeira versão deste caso chamava `baixar_para` com um caminho local e passava pelo
# motivo errado: o `curl` recusa o protocolo antes de a validação rodar, então tirar a
# validação inteira do script NÃO deixava este teste vermelho. Medido com sabotagem.
eval "$(sed -n '/^catalogo_tem_forma()/,/^}/p' "$SCRIPT")"

bom="$(mktemp)"; echo '{"format_version":1,"origin":"https://x.test","revision":1,"entries":[]}' > "$bom"
ruim="$(mktemp)"; echo '{"qualquer":"coisa"}' > "$ruim"
vazio="$(mktemp)"; : > "$vazio"

catalogo_tem_forma "$bom"  && ok "catálogo com a forma certa é aceito" \
                           || erro "controle positivo falhou: um catálogo VÁLIDO foi recusado"
catalogo_tem_forma "$ruim" && erro "JSON sem forma de catálogo foi aceito" \
                           || ok "JSON sem forma de catálogo é recusado"
catalogo_tem_forma "$vazio" && erro "arquivo vazio foi aceito" \
                            || ok "arquivo vazio é recusado"
rm -f "$bom" "$ruim" "$vazio"

bash -n "$SCRIPT" && ok "sintaxe válida"

# ── ORIGEM: SEM VALOR PADRÃO (008, REQ-003) ─────────────────────────────────
# Sem origem informada, nada de rede: o `curl` falso abaixo registra toda chamada.
falso="$(mktemp -d)"; trap 'rm -rf "$falso"; rm -f "$saida"' EXIT
cat > "${falso}/curl" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "${CURL_REGISTRO}"
dest=""; while [ $# -gt 0 ]; do [ "$1" = "-o" ] && dest="$2"; shift; done
[ -n "$dest" ] && echo '{"format_version":1,"origin":"https://x.test","revision":1,"entries":[]}' > "$dest"
exit 0
FAKE
chmod +x "${falso}/curl"

for cmd in listar baixar; do
  : > "${falso}/registro"
  if env -u EXTENSOES_ORIGEM PATH="${falso}:${PATH}" CURL_REGISTRO="${falso}/registro" \
     PROJECT_DIR="$falso" bash "$SCRIPT" "$cmd" >"$saida" 2>&1; then
    ok "AC-003.1: '$cmd' sem origem termina sem erro"
  else
    erro "AC-003.1: '$cmd' sem origem devolveu erro — faltar origem é aviso, não falha"
  fi
  [ ! -s "${falso}/registro" ] \
    && ok "AC-003.1: '$cmd' sem origem não chamou a rede" \
    || erro "AC-003.1: '$cmd' sem origem chamou curl: $(cat "${falso}/registro")"
  grep -q "Nenhuma origem de catálogo configurada" "$saida" \
    && ok "AC-003.1: '$cmd' avisa em português que não há origem" \
    || erro "AC-003.1: '$cmd' não avisou que falta origem"
done

# Nenhum endereço de terceiro embutido como padrão.
if grep -qE 'extensoes\.deskcomm|melgarafael' "$SCRIPT"; then
  erro "AC-003.1: o script ainda embute endereço de terceiro"
else
  ok "AC-003.1: nenhum endereço de terceiro embutido"
fi

# Com origem: a origem do operador é a usada (precisa de jq para o fluxo completo).
: > "${falso}/registro"
PATH="${falso}:${PATH}" CURL_REGISTRO="${falso}/registro" PROJECT_DIR="$falso" \
  EXTENSOES_ORIGEM="https://minha-origem.test" bash "$SCRIPT" baixar "${falso}/c.json" >"$saida" 2>&1 || true
if command -v jq >/dev/null 2>&1; then
  grep -q "https://minha-origem.test/catalogo.json" "${falso}/registro" \
    && ok "AC-003.2: com origem informada, ela é a consultada" \
    || erro "AC-003.2: a origem informada não foi usada"
else
  ok "AC-003.2: (jq ausente aqui — fluxo completo roda no CI)"
fi
grep -q "Nenhuma origem de catálogo configurada" "$saida" \
  && erro "AC-003.2: com origem informada, avisou que não há origem" \
  || ok "AC-003.2: com origem informada, não avisa falta de origem"

# AC-003.3: o script nunca toca o banco (a cerca acima proíbe psql/service key), então
# remover o padrão não desinstala extensão alguma — o estado instalado mora no banco.
for banco in 'psql' 'service_role' 'SERVICE_ROLE' 'DATABASE_URL' 'SUPABASE_DB_URL' 'extension_installs' 'delete from' 'DELETE FROM' '/api/v1/extensions'; do
  if grep -q "$banco" "$SCRIPT"; then
    erro "AC-003.3: o script passou a tocar o banco/extensões ('$banco') — extensão instalada deve independer dele"
  else
    ok "AC-003.3: não usa '$banco'"
  fi
done

if [ "$falhas" -gt 0 ]; then echo "FALHOU: $falhas"; exit 1; fi
echo "tudo verde"
