-- manifest: **Id do checkout do provedor na assinatura (mudança 003, correção da Fatia 5).** `cobranca_assinaturas.checkout_provedor_id` (text, nula): o uuid do checkout hospedado, que o Asaas devolve como `checkoutSession` na assinatura criada por ele. Provado no sandbox (2/11/2026): o Asaas NÃO propaga a `externalReference` do checkout, então esse id é a única ligação entre o checkout e a assinatura, e sobrevive ao estado "confirmando" (que zera `checkout_url`). Aditiva: linhas existentes ficam nulas e caem no uuid da `checkout_url`. Mesmo bloco como apêndice no baseline.sql.

alter table public.cobranca_assinaturas
  add column if not exists checkout_provedor_id text
  check (checkout_provedor_id is null or char_length(checkout_provedor_id) between 1 and 100);

comment on column public.cobranca_assinaturas.checkout_provedor_id is
  'Id do checkout hospedado do provedor (checkoutSession da assinatura que ele cria). Achar a assinatura por aqui, nunca por externalReference (o Asaas não a propaga). Nulo em linhas anteriores: vale o uuid da checkout_url.';
