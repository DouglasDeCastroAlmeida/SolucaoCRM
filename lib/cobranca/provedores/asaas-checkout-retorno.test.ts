import { describe, expect, it } from "vitest";

import { criarAdaptadorAsaas } from "./asaas";

/**
 * O retorno do Checkout (mudança 003, Fatia 5): achar a assinatura pelo
 * `checkoutSession` (o Asaas não propaga a `externalReference`, provado no sandbox em
 * 2/11/2026; a página cria o cliente dela) e abrir o checkout sem cliente nosso.
 * `fetch` simulado.
 */
const CHAVE = ["$aact", "hmlg", "000ChaveDeMentiraDoSandbox00"].join("_");
const ORG = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const CK = "5b7c0e6a-1d2f-4a3b-9c8d-7e6f5a4b3c2d";
const OUTRO = "99999999-9999-4999-8999-999999999999";

function montar(paginas: unknown[][]) {
  const caminhos: string[] = [];
  const adaptador = criarAdaptadorAsaas({
    lerChave: async () => CHAVE,
    fetch: (async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(entrada));
      caminhos.push(`${init?.method ?? "GET"} ${url.pathname.replace(/^\/v3/, "")}${url.search}`);
      if (url.pathname.endsWith("/subscriptions")) {
        const n = Number(url.searchParams.get("offset") ?? "0") / 100;
        return Response.json({ data: paginas[n] ?? [], hasMore: n + 1 < paginas.length });
      }
      return Response.json({ id: "chk_1", link: `https://sandbox.asaas.com/checkoutSession/show?id=${CK}` });
    }) as typeof fetch,
    esperar: async () => {},
    agora: () => new Date("2026-10-05T15:00:00Z"),
    marca: "a1b2c3d4e5f60718",
  });
  return { adaptador, caminhos };
}

const cheia = (n: number) => Array.from({ length: n }, (_, k) => ({ id: `sub_x${k}`, customer: "cus_x", checkoutSession: OUTRO }));

describe("Asaas acharAssinaturaDoCheckout", () => {
  it("AC-003.2: acha a assinatura pelo checkoutSession entre várias e devolve o cliente que a PÁGINA criou", async () => {
    const { adaptador, caminhos } = montar([
      [
        { id: "sub_de_outro", customer: "cus_outro", checkoutSession: OUTRO },
        { id: "sub_apagada", customer: "cus_x", checkoutSession: CK, deleted: true },
        { id: "sub_nossa", customer: "cus_da_pagina", checkoutSession: CK.toUpperCase() },
        { id: "sub_avulsa", customer: "cus_y", checkoutSession: null },
      ],
    ]);

    const r = await adaptador.acharAssinaturaDoCheckout!({ orgId: ORG, checkoutId: CK });

    expect(r).toEqual({ clienteRef: "cus_da_pagina", assinaturaRef: "sub_nossa" });
    expect(caminhos).toEqual(["GET /subscriptions?limit=100&offset=0"]);
  });

  it("AC-003.2: externalReference sozinha não vale: assinatura só com a org na referência não é achada", async () => {
    const { adaptador } = montar([[{ id: "sub_falsa", customer: "cus_f", externalReference: ORG, checkoutSession: null }]]);

    expect(await adaptador.acharAssinaturaDoCheckout!({ orgId: ORG, checkoutId: CK })).toBeNull();
  });

  it("AC-003.2: pagina até achar (a assinatura está na 2ª página)", async () => {
    const { adaptador, caminhos } = montar([cheia(100), [{ id: "sub_nossa", customer: "cus_p", checkoutSession: CK }]]);

    expect(await adaptador.acharAssinaturaDoCheckout!({ orgId: ORG, checkoutId: CK })).toEqual({ clienteRef: "cus_p", assinaturaRef: "sub_nossa" });
    expect(caminhos).toEqual(["GET /subscriptions?limit=100&offset=0", "GET /subscriptions?limit=100&offset=100"]);
  });

  it("AC-003.3: para depois de 5 páginas e devolve null", async () => {
    const { adaptador, caminhos } = montar(Array.from({ length: 8 }, () => cheia(100)));

    expect(await adaptador.acharAssinaturaDoCheckout!({ orgId: ORG, checkoutId: CK })).toBeNull();
    expect(caminhos).toHaveLength(5);
  });

  it("AC-003.3: sem assinatura (fechou a página, cartão recusado) devolve null", async () => {
    const { adaptador } = montar([[]]);

    expect(await adaptador.acharAssinaturaDoCheckout!({ orgId: ORG, checkoutId: CK })).toBeNull();
  });

  it("AC-003.3: duas assinaturas do mesmo checkout: recusa com assinatura_ambigua, não escolhe", async () => {
    const { adaptador } = montar([
      [
        { id: "sub_1", customer: "cus_1", checkoutSession: CK },
        { id: "sub_2", customer: "cus_2", checkoutSession: CK },
      ],
    ]);

    await expect(adaptador.acharAssinaturaDoCheckout!({ orgId: ORG, checkoutId: CK })).rejects.toMatchObject({ codigo: "assinatura_ambigua" });
  });

  it("AC-008.4: id de checkout que não é uuid nem chega a consultar o provedor", async () => {
    const { adaptador, caminhos } = montar([[]]);

    await expect(adaptador.acharAssinaturaDoCheckout!({ orgId: ORG, checkoutId: "../x" })).rejects.toMatchObject({ codigo: "checkout_invalido" });
    expect(caminhos).toEqual([]);
  });

  it("AC-008.4: erro do provedor sobe como ErroDoProvedor", async () => {
    const adaptador = criarAdaptadorAsaas({
      lerChave: async () => CHAVE,
      fetch: (async () => new Response("{}", { status: 500 })) as typeof fetch,
      esperar: async () => {},
      agora: () => new Date("2026-10-05T15:00:00Z"),
      marca: "a1b2c3d4e5f60718",
    });

    await expect(adaptador.acharAssinaturaDoCheckout!({ orgId: ORG, checkoutId: CK })).rejects.toMatchObject({ name: "ErroDoProvedor" });
  });
});

describe("Asaas iniciarTrialComCartao sem cliente nosso", () => {
  it("AC-003.7: com clienteRef vazio não consulta assinaturas da conta inteira e abre o checkout", async () => {
    const { adaptador, caminhos } = montar([[{ id: "sub_de_outro", customer: "cus_outro" }]]);

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
    expect(r.checkoutId).toBe(CK);
    expect(caminhos).toEqual(["POST /checkouts"]);
  });
});
