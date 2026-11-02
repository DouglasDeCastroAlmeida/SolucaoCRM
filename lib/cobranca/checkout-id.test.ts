import { describe, expect, it } from "vitest";

import { ehIdDeCheckout, idDoCheckoutDaUrl } from "./checkout-id";

const CK = "5b7c0e6a-1d2f-4a3b-9c8d-7e6f5a4b3c2d";

describe("id do checkout do provedor", () => {
  it("AC-003.2: tira o uuid do ?id= da url do checkout, em minúsculas", () => {
    expect(idDoCheckoutDaUrl(`https://sandbox.asaas.com/checkoutSession/show?id=${CK.toUpperCase()}`)).toBe(CK);
  });

  it("AC-003.2: url sem uuid, malformada ou nula devolve null sem lançar", () => {
    expect(idDoCheckoutDaUrl("https://x.exemplo/checkoutSession/show/abc")).toBeNull();
    expect(idDoCheckoutDaUrl("https://x.exemplo/?id=../../etc")).toBeNull();
    expect(idDoCheckoutDaUrl("não é url")).toBeNull();
    expect(idDoCheckoutDaUrl(null)).toBeNull();
    expect(ehIdDeCheckout(CK)).toBe(true);
    expect(ehIdDeCheckout(42)).toBe(false);
  });
});
