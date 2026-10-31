import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { INTERNAL_SECRET: "a".repeat(48) } }));

import { lerRetorno, urlDeRetorno } from "./retorno";

const ORG = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const OUTRA = "11111111-1111-4111-8111-111111111111";
const TENTATIVA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OUTRA_TENTATIVA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const paramsDe = (url: string) => new URL(url).searchParams;

describe("selo da URL de retorno do Checkout", () => {
  it("AC-003.2: a URL de sucesso volta a org e o resultado, no host da marca", () => {
    const url = urlDeRetorno("https://marca.exemplo/", ORG, "ok", TENTATIVA);

    expect(url.startsWith("https://marca.exemplo/cobranca/volta?")).toBe(true);
    expect(lerRetorno(paramsDe(url))).toEqual({ orgId: ORG, resultado: "ok", tentativa: TENTATIVA });
  });

  it("AC-003.3: cancelado e expirado têm o seu próprio selo", () => {
    expect(lerRetorno(paramsDe(urlDeRetorno("https://m.exemplo", ORG, "cancelado", TENTATIVA)))?.resultado).toBe("cancelado");
    expect(lerRetorno(paramsDe(urlDeRetorno("https://m.exemplo", ORG, "expirado", TENTATIVA)))?.resultado).toBe("expirado");
  });

  it("AC-003.3: trocar a org, o resultado ou apagar o selo derruba o retorno (sem efeito)", () => {
    const original = paramsDe(urlDeRetorno("https://m.exemplo", ORG, "ok", TENTATIVA));
    const outraOrg = new URLSearchParams(original);
    outraOrg.set("o", OUTRA);
    const virouCancelado = new URLSearchParams(original);
    virouCancelado.delete("ok");
    virouCancelado.set("cancelado", "1");
    const semSelo = new URLSearchParams(original);
    semSelo.delete("s");

    expect(lerRetorno(outraOrg)).toBeNull();
    expect(lerRetorno(virouCancelado)).toBeNull();
    expect(lerRetorno(semSelo)).toBeNull();
    expect(lerRetorno(new URLSearchParams("o=nao-e-uuid&ok=1&s=" + "a".repeat(64)))).toBeNull();
  });

  it("AC-003.3: trocar a tentativa do link derruba o selo (link de outro checkout não vale)", () => {
    const original = paramsDe(urlDeRetorno("https://m.exemplo", ORG, "ok", TENTATIVA));
    const outraTentativa = new URLSearchParams(original);
    outraTentativa.set("c", OUTRA_TENTATIVA);
    const semTentativa = new URLSearchParams(original);
    semTentativa.delete("c");

    expect(lerRetorno(outraTentativa)).toBeNull();
    expect(lerRetorno(semTentativa)).toBeNull();
  });
});
