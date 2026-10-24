#!/usr/bin/env bash
# minutos-github.sh — registra o consumo de minutos do GitHub Actions no mês e compara com a cota
# gratuita (2.000 min/mês no plano Free). {AC-004.5}
# Uso: minutos-github.sh [--dry-run]     Variáveis: GH_USER (padrão: dono logado), COTA_PADRAO (2000),
# SAIDA (arquivo opcional que também recebe o relatório). Nunca imprime token. Sempre sai 0.
set -uo pipefail
COTA_PADRAO="${COTA_PADRAO:-2000}"
if [ "${1:-}" = "--dry-run" ]; then
  echo "[dry-run] consultaria: gh api users/${GH_USER:-<usuário logado>}/settings/billing/actions"
  exit 0
fi
saida() { if [ -n "${SAIDA:-}" ]; then tee "$SAIDA"; else cat; fi; }
user="${GH_USER:-$(gh api user 2>/dev/null | sed -n 's/.*"login": *"\([^"]*\)".*/\1/p' | head -1)}"
if [ -z "$user" ]; then
  echo "Não consegui saber o usuário do GitHub. Rode 'gh auth login' ou defina GH_USER." | saida; exit 0
fi
resp="$(gh api "users/$user/settings/billing/actions" 2>&1)"; rc=$?
usados="$(printf '%s' "$resp" | sed -n 's/.*"total_minutes_used": *\([0-9.]*\).*/\1/p' | head -1)"
if [ "$rc" -ne 0 ] || [ -z "$usados" ]; then
  {
    echo "Não foi possível ler o consumo de minutos (sem permissão ou API indisponível)."
    echo "Provável causa: o token do gh não tem permissão de cobrança (billing)."
    echo "Resolva com: gh auth refresh -h github.com -s user"
    echo "Ou confira à mão: GitHub > Settings > Billing and plans > Actions."
  } | saida; exit 0
fi
cota="$(printf '%s' "$resp" | sed -n 's/.*"included_minutes": *\([0-9.]*\).*/\1/p' | head -1)"
{ [ -z "$cota" ] || [ "${cota%.*}" = "0" ]; } && cota="$COTA_PADRAO"
usados_i="${usados%.*}"; cota_i="${cota%.*}"
pct=$(( usados_i * 100 / cota_i ))
{
  echo "Minutos do GitHub Actions em $(date -u +%Y-%m) (usuário $user)"
  echo "Usados: $usados_i de $cota_i minutos (${pct}% da cota)"
  if [ "$pct" -ge 80 ]; then echo "AVISO: ${pct}% da cota gratuita usada; reduza execuções do CI ou revise o plano."
  else echo "Dentro da cota gratuita."; fi
} | saida
exit 0
