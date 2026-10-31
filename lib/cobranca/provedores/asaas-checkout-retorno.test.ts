import { describe, expect, it } from "vitest";

import { criarAdaptadorAsaas } from "./asaas";

/**
 * O retorno do Checkout (mudança 003, Fatia 5): achar a assinatura pela
 * `externalReference` (a página do Asaas cria o cliente dela) e abrir o
 * checkout sem cliente nosso. `fetch` simulado; a propagação real da
 * `externalReference` para a assinatura é prova de tela (Fatia 11).
 */
const CHAVE = ["$aact", "hmlg", "000ChaveDeMentiraDoSandbox00"].join("_");
const ORG = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

function montar(assinaturas: unknown[]) {
  const caminhos: string[] = [];
  const adaptador = criarAdaptadorAsaas({
    lerChave: async () => CHAVE,
    fetch: (async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(entrada));
      caminhos.push(`${init?.method ?? "GET"} ${url.pathname.replace(/^\/v3/, "")}${url.search}`);
      if (url.pathname.endsWith("/subscriptions")) return Response.json({ data: assinaturas });
      return Response.json({ id: "chk_1", link: "https://sandbox.asaas.com/c/checkoutSession/show/abc" });
    }) as typeof fetch,
    esperar: async () => {},
    agora: () => new Date("2026-10-05T15:00:00Z"),
    marca: "a1b2c3d4e5f60718",
  });
  return { adaptador, caminhos };
}

describe("Asaas acharAssinaturaDoCheckout", () => {
  it("AC-003.2: acha a assinatura viva pela externalReference e devolve o cliente que a PÁGINA criou", async () => {
    const { adaptador, caminhos } = montar([
      { id: "sub_velha", customer: "cus_velho", dateCreated: "2026-10-01" },
      { id: "sub_nova", customer: "cus_da_pagina", dateCreated: "2026-10-05" },
      { id: "sub_apagada", customer: "cus_x", deleted: true, dateCreated: "2026-10-06" },
    ]);

    const r = await adaptador.acharAssinaturaDoCheckout!({ orgId: ORG });

    expect(r).toEqual({ clienteRef: "cus_da_pagina", assinaturaRef: "sub_nova" });
    expect(caminhos[0]).toBe(`GET /subscriptions?externalReference=${ORG}&status=ACTIVE&limit=10`);
  });

  it("AC-003.3: sem assinatura (fechou a página, cartão recusado) devolve null", async () => {
    const { adaptador } = montar([]);

    expect(await adaptador.acharAssinaturaDoCheckout!({ orgId: ORG })).toBeNull();
  });
});

describe("Asaas iniciarTrialComCartao sem cliente nosso", () => {
  it("AC-003.7: com clienteRef vazio não consulta assinaturas da conta inteira e abre o checkout", async () => {
    const { adaptador, caminhos } = montar([{ id: "sub_de_outro", customer: "cus_outro" }]);

    const r = await adaptador.iniciarTrialComCartao!({
      clienteRef: "",
      orgId: ORG,
      plano: { id: "p1", nome: "Plano Pro", precoCents: 4990, intervalo: "mes" },
      primeiraCobrancaEm: new Date("2026-10-12T15:00:00Z"),
      urlDeSucesso: "https://marca.exemplo/cobranca/volta?ok=1",
      urlDeCancelamento: "https://marca.exemplo/cobranca/volta?cancelado=1",
      urlDeExpirado: "https://marca.exemplo/cobranca/volta?expirado=1",
      chaveIdempotencia: "c1",
    });

    expect(r.sessaoId).toBe("chk_1");
    expect(caminhos).toEqual(["POST /checkouts"]);
  });
});
