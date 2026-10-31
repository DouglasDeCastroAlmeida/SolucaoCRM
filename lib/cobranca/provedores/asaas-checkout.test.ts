import { describe, expect, it } from "vitest";

import { ErroDoProvedor, type PlanoParaProvedor } from "./contrato";
import { CSP_DA_PAGINA } from "@/lib/billing-trial/pagina";

import { criarAdaptadorAsaas } from "./asaas";

/**
 * Trial com cartão pelo Checkout hospedado (mudança 003, T-014/T-015). `fetch`
 * simulado na forma real medida na sonda do sandbox (POST /v3/checkouts devolve
 * `id` e `link`; não existe GET /v3/checkouts/{id}). O PAGAMENTO real na página
 * do Asaas não está provado (reCAPTCHA): nada aqui o exercita.
 */

const CHAVE = ["$aact", "hmlg", "000ChaveDeMentiraDoSandbox00"].join("_");
const AGORA = new Date("2026-10-05T15:00:00Z");
const CLIENTE = "cus_000005219613";
const ORG = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const PLANO: PlanoParaProvedor = {
  id: "p1",
  nome: "Plano Pro",
  precoCents: 4990,
  intervalo: "mes",
};
const LINK = "https://sandbox.asaas.com/c/checkoutSession/show/abc";

type Chamada = { metodo: string; caminho: string; corpo: unknown; headers: Headers };

function montar(
  opcoes: {
    ativas?: unknown[];
    checkout?: () => Response;
    nota?: () => Response;
    agora?: Date;
    baseUrl?: string;
  } = {},
) {
  const chamadas: Chamada[] = [];
  const fetchFalso: typeof fetch = async (entrada, init) => {
    const url = new URL(String(entrada));
    const metodo = init?.method ?? "GET";
    const caminho = url.pathname.replace(/^\/v3/, "");
    const corpo: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    chamadas.push({ metodo, caminho, corpo, headers: new Headers(init?.headers) });
    if (metodo === "GET" && caminho === "/subscriptions") {
      return Response.json({ data: opcoes.ativas ?? [] });
    }
    if (metodo === "POST" && caminho === "/checkouts") {
      return opcoes.checkout ? opcoes.checkout() : Response.json({ id: "chk_1", link: LINK });
    }
    if (metodo === "POST" && /^\/subscriptions\/[^/]+\/invoiceSettings$/.test(caminho)) {
      return opcoes.nota ? opcoes.nota() : Response.json({ id: "inv_1" });
    }
    return Response.json({ errors: [{ code: "rota_nao_declarada" }] }, { status: 404 });
  };
  const adaptador = criarAdaptadorAsaas({
    lerChave: async () => CHAVE,
    fetch: fetchFalso,
    esperar: async () => {},
    agora: () => opcoes.agora ?? AGORA,
    ...(opcoes.baseUrl ? { baseUrl: opcoes.baseUrl } : {}),
    marca: "a1b2c3d4e5f60718",
  });
  return { adaptador, chamadas };
}

const pedido = (extra: Record<string, unknown> = {}) => ({
  clienteRef: CLIENTE,
  orgId: ORG,
  plano: PLANO,
  primeiraCobrancaEm: new Date("2026-10-12T15:00:00Z"),
  urlDeSucesso: "https://marca.exemplo/cobranca/volta?ok=1",
  urlDeCancelamento: "https://marca.exemplo/cobranca/volta?cancelado=1",
  urlDeExpirado: "https://marca.exemplo/cobranca/volta?expirado=1",
  chaveIdempotencia: "chave-1",
  ...extra,
});

describe("Asaas iniciarTrialComCartao", () => {
  it("AC-003.2: a origem do redirecionamento do POST está coberta pelo form-action da página", async () => {
    const { adaptador } = montar();
    const r = await adaptador.iniciarTrialComCartao!(pedido());
    const formAction = CSP_DA_PAGINA.split(";").map((d) => d.trim()).find((d) => d.startsWith("form-action "))!;
    expect(formAction.split(" ")).toContain(new URL(r.url).origin);
  });

  it("AC-003.1: cria o checkout só de cartão, recorrente, com a 1a cobrança em hoje+trial e as URLs da marca", async () => {
    const { adaptador, chamadas } = montar();
    const r = await adaptador.iniciarTrialComCartao!(pedido());
    expect(r.url).toBe(LINK);
    expect(r.sessaoId).toBe("chk_1");
    expect(r.expiraEm).toEqual(new Date(AGORA.getTime() + 60 * 60_000));
    const post = chamadas.find((c) => c.metodo === "POST" && c.caminho === "/checkouts")!;
    expect(post.corpo).toMatchObject({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      callback: {
        successUrl: "https://marca.exemplo/cobranca/volta?ok=1",
        cancelUrl: "https://marca.exemplo/cobranca/volta?cancelado=1",
        expiredUrl: "https://marca.exemplo/cobranca/volta?expirado=1",
      },
      items: [{ name: "Plano Pro", quantity: 1, value: 49.9 }],
      subscription: { cycle: "MONTHLY", nextDueDate: "2026-10-12 00:00:00" },
    });
  });

  it("AC-003.1: plano anual vira YEARLY", async () => {
    const { adaptador, chamadas } = montar();
    await adaptador.iniciarTrialComCartao!(pedido({ plano: { ...PLANO, intervalo: "ano" } }));
    const post = chamadas.find((c) => c.caminho === "/checkouts")!;
    expect((post.corpo as { subscription: { cycle: string } }).subscription.cycle).toBe("YEARLY");
  });

  it("AC-003.1: URL de retorno que não é https é recusada antes de falar com o Asaas", async () => {
    const { adaptador, chamadas } = montar();
    await expect(
      adaptador.iniciarTrialComCartao!(pedido({ urlDeSucesso: "http://marca.exemplo/volta" })),
    ).rejects.toMatchObject({ codigo: "url_de_retorno_invalida", transitorio: false });
    expect(chamadas).toHaveLength(0);
  });

  it("AC-003.1: primeira cobrança no passado é recusada sem chamar o Asaas", async () => {
    const { adaptador, chamadas } = montar();
    await expect(
      adaptador.iniciarTrialComCartao!(
        pedido({ primeiraCobrancaEm: new Date("2026-10-04T15:00:00Z") }),
      ),
    ).rejects.toMatchObject({ codigo: "data_da_primeira_cobranca_invalida" });
    expect(chamadas).toHaveLength(0);
  });

  it("AC-003.4: o corpo enviado não tem campo de cartão e a chave só vai no header", async () => {
    const { adaptador, chamadas } = montar();
    await adaptador.iniciarTrialComCartao!(pedido());
    const post = chamadas.find((c) => c.caminho === "/checkouts")!;
    const texto = JSON.stringify(post.corpo);
    expect(texto).not.toMatch(/creditCard|cardNumber|ccv|holderName|expiryMonth|"number"/i);
    expect(texto).not.toContain(CHAVE);
    expect(post.headers.get("access_token")).toBe(CHAVE);
    expect(Object.keys(post.corpo as object).sort()).toEqual(
      [
        "billingTypes",
        "callback",
        "chargeTypes",
        "externalReference",
        "items",
        "minutesToExpire",
        "subscription",
      ].sort(),
    );
  });

  it("AC-003.4: a resposta devolve só url, sessão e validade", async () => {
    const { adaptador } = montar({
      checkout: () => Response.json({ id: "chk_1", link: LINK, creditCard: { number: "4111" } }),
    });
    const r = await adaptador.iniciarTrialComCartao!(pedido());
    expect(Object.keys(r).sort()).toEqual(["expiraEm", "sessaoId", "url"]);
  });

  it("AC-003.1: releitura antes de criar: com assinatura ativa do cliente não cria outro checkout", async () => {
    const { adaptador, chamadas } = montar({ ativas: [{ id: "sub_1", deleted: false }] });
    await expect(adaptador.iniciarTrialComCartao!(pedido())).rejects.toMatchObject({
      codigo: "assinatura_ja_existe",
      transitorio: false,
    });
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("AC-008.4: Asaas fora do ar (503) vira erro tipado transitório, sem texto livre do Asaas", async () => {
    const { adaptador } = montar({
      checkout: () =>
        Response.json(
          { errors: [{ code: "x", description: "Joao Silva CPF 123" }] },
          { status: 503 },
        ),
    });
    const erro = await adaptador.iniciarTrialComCartao!(pedido()).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDoProvedor);
    expect(erro).toMatchObject({ status: 503, codigo: "provedor_fora", transitorio: true });
    expect(String((erro as Error).message)).not.toMatch(/Joao|CPF|123/);
  });

  it("AC-008.4: recusa 400 do Asaas sai com código canônico, sem a descrição", async () => {
    const { adaptador } = montar({
      checkout: () =>
        Response.json(
          { errors: [{ code: "invalid_action", description: "texto livre com dado do pagador" }] },
          { status: 400 },
        ),
    });
    const erro = (await adaptador.iniciarTrialComCartao!(pedido()).catch(
      (e: unknown) => e,
    )) as ErroDoProvedor;
    expect(erro.codigo).toBe("invalid_action");
    expect(erro.message).not.toMatch(/texto livre/);
    expect(erro.transitorio).toBe(false);
  });

  it("AC-008.4: rede caída vira erro transitório e não repete o POST", async () => {
    let posts = 0;
    const adaptador = criarAdaptadorAsaas({
      lerChave: async () => CHAVE,
      fetch: async (_entrada, init) => {
        if ((init?.method ?? "GET") === "GET") return Response.json({ data: [] });
        posts += 1;
        throw new TypeError("fetch failed");
      },
      esperar: async () => {},
      agora: () => AGORA,
      marca: "a1b2c3d4e5f60718",
    });
    await expect(adaptador.iniciarTrialComCartao!(pedido())).rejects.toMatchObject({
      codigo: "sem_resposta",
      transitorio: true,
    });
    expect(posts).toBe(1);
  });

  it("AC-008.4: resposta sem link https vira resposta_invalida", async () => {
    const { adaptador } = montar({
      checkout: () => Response.json({ id: "chk_1", link: "javascript:alert(1)" }),
    });
    await expect(adaptador.iniciarTrialComCartao!(pedido())).rejects.toMatchObject({
      codigo: "resposta_invalida",
    });
  });
});

describe("Asaas pedirNotaFiscal", () => {
  it("AC-007.1: pede a emissão da NFS-e na confirmação de cada pagamento da assinatura", async () => {
    const { adaptador, chamadas } = montar();
    await adaptador.pedirNotaFiscal!({ assinaturaRef: "sub_1", descricao: "Plano Pro" });
    const c = chamadas.find((x) => x.caminho === "/subscriptions/sub_1/invoiceSettings")!;
    expect(c.metodo).toBe("POST");
    expect(c.corpo).toMatchObject({
      effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
      municipalServiceName: "Plano Pro",
      updatePayment: true,
    });
  });

  it("AC-007.1: falha do Asaas sobe como ErroDoProvedor (quem chama vira aviso, melhor esforço)", async () => {
    const { adaptador } = montar({
      nota: () => Response.json({ errors: [{ code: "invalid_action" }] }, { status: 400 }),
    });
    await expect(
      adaptador.pedirNotaFiscal!({ assinaturaRef: "sub_1", descricao: "Plano Pro" }),
    ).rejects.toBeInstanceOf(ErroDoProvedor);
  });
});

describe("Asaas iniciarTrialComCartao: campos provados no sandbox (30/10/2026)", () => {
  it("AC-003.1: não envia `customer` (o sandbox o recusa sem endereço e telefone) e envia a externalReference da org", async () => {
    const { adaptador, chamadas } = montar();
    await adaptador.iniciarTrialComCartao!(pedido());
    const corpo = chamadas.find((c) => c.caminho === "/checkouts")!.corpo as Record<
      string,
      unknown
    >;
    expect(corpo).not.toHaveProperty("customer");
    expect(corpo.externalReference).toBe(ORG);
  });

  it("AC-003.1: às 23h de 05/10 em São Paulo (02:00Z de 06/10), a data de 'ontem' (04/10) é recusada", async () => {
    const { adaptador, chamadas } = montar({ agora: new Date("2026-10-06T02:00:00Z") });
    await expect(
      adaptador.iniciarTrialComCartao!(
        pedido({ primeiraCobrancaEm: new Date("2026-10-04T15:00:00Z") }),
      ),
    ).rejects.toMatchObject({ codigo: "data_da_primeira_cobranca_invalida" });
    expect(chamadas).toHaveLength(0);
  });

  it("AC-003.1: no mesmo instante, 'hoje' em São Paulo (05/10) é aceito e vai como 2026-10-05", async () => {
    const { adaptador, chamadas } = montar({ agora: new Date("2026-10-06T02:00:00Z") });
    await adaptador.iniciarTrialComCartao!(
      pedido({ primeiraCobrancaEm: new Date("2026-10-06T02:30:00Z") }),
    );
    const corpo = chamadas.find((c) => c.caminho === "/checkouts")!.corpo as {
      subscription: { nextDueDate: string };
    };
    expect(corpo.subscription.nextDueDate).toBe("2026-10-05 00:00:00");
  });

  it("AC-003.1: a exceção de loopback não abre brecha: sem baseUrl, URL http de retorno continua recusada", async () => {
    const { adaptador, chamadas } = montar();
    await expect(
      adaptador.iniciarTrialComCartao!(
        pedido({ urlDeCancelamento: "http://127.0.0.1:3000/volta" }),
      ),
    ).rejects.toMatchObject({ codigo: "url_de_retorno_invalida" });
    expect(chamadas).toHaveLength(0);
  });

  it("AC-003.1: com baseUrl de loopback (dublê do e2e), http de retorno passa", async () => {
    const { adaptador } = montar({ baseUrl: "http://127.0.0.1:4010/v3" });
    await expect(
      adaptador.iniciarTrialComCartao!(pedido({ urlDeSucesso: "http://127.0.0.1:3000/volta" })),
    ).resolves.toMatchObject({ sessaoId: "chk_1" });
  });
});
