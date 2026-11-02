/**
 * O id do checkout hospedado do Asaas (o `checkoutSession` que cada assinatura criada por ele
 * carrega). Medido no sandbox em 2/11/2026: o Asaas NÃO propaga a `externalReference` do checkout
 * para a assinatura, então esse uuid é a única ligação entre o checkout que abrimos e a assinatura.
 * Fica fora do adaptador e do `billing-trial` porque os dois o leem.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehIdDeCheckout(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

/** O uuid do `?id=` de `.../checkoutSession/show?id=<uuid>`; `null` se a url não o traz. Nunca lança. */
export function idDoCheckoutDaUrl(url: string | null | undefined): string | null {
  if (!url || !URL.canParse(url)) return null;
  const id = new URL(url).searchParams.get("id");
  return ehIdDeCheckout(id) ? id.toLowerCase() : null;
}
