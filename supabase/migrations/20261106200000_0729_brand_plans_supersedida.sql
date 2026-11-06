-- manifest: **`brand_plans` marcada como SUPERSEDIDA pela cobrança com trial no cartão (mudança SDD 003, T-045).** Só um COMMENT na tabela: o plano por marca passou a viver em `cobranca_planos.brand_id` (ADR-002 da 003), a aba de planos do editor de marcas lê e grava lá, e `brand_plans` não é apagada nem migrada (não há dado em produção); sai numa migration futura. Nenhuma coluna, política ou dado muda.
--
-- Idempotente: COMMENT ON repete sem efeito colateral.
-- Evidência: `.sdd/changes/003-billing-com-trial-no-cartao-asaas/02-design.md` (ADR-002) e o resultado de `\d+ public.brand_plans`.

comment on table public.brand_plans is
  'SUPERSEDIDA (mudança 003): o plano por marca vive em public.cobranca_planos.brand_id. Não ler nem gravar aqui; a tabela sai numa migration futura.';
