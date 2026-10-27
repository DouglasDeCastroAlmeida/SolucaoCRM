# Fechamento da implementação — subprojeto 1 (T-050)

Data: 27/10/2026 (UTC).

- **Suíte completa:** todas as fatias passaram pelo CI do GitHub (`verify` = typecheck + lint + test:unit + cercas + kit bash; `invariants` = test:db em instalação nova e em atualização, com isolamento RLS; `build-and-size`; `imagens-ok`), em cada PR (#7 a #15).
- **E2E disparado à mão na `main`** (decisão A-07): run 40432567950, `e2e` = success, as 6 partes e o `e2e-alcance` verdes.
- **Fora do CI automático, de propósito:** `marcas-sessao-por-host.spec.ts` e `marcas.spec.ts` ficam em `FORA_DO_CI` (nunca rodaram contra um Supabase local; subir para uma `SPECS_PARTE_*` depois de uma rodada manual verde).
- **Provas em ambiente real:** `homologacao.md` e `producao.md` nesta pasta.
- **Dívidas conhecidas (não bloqueiam):** o HTTPS sob demanda de ponta a ponta só será exercitado quando o dono ligar `marcas.caddy` + `TLS_ASK_TOKEN` + `VPS_PUBLIC_IP` na produção (hoje desligado de propósito); o plano inicial por marca (AC-005.3) fica para o subprojeto 2; os specs e2e de marcas precisam de uma rodada manual com Supabase local.
