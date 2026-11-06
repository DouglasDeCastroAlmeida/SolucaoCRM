import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, operacao, valorDoFiltro, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({
  ligada: true,
  segredo: "whsec_teste" as string | null,
  sinal: { eventoId: "evt_1", tipo: "invoice.paid", clienteRef: "cus_1" } as { eventoId: string; tipo: string; clienteRef: string | null; checkoutRef?: string | null } | null,
  permitido: true,
  baldes: [] as string[],
  aviso: vi.fn(),
  info: vi.fn(),
  banco: undefined as unknown as BancoFalso,
}));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: async () => h.ligada }));
vi.mock("@/lib/cobranca/configuracao", () => ({ segredoDoWebhook: async () => h.segredo }));
vi.mock("@/lib/cobranca/provedores", () => ({ adaptador: () => ({ verificarWebhook: () => h.sinal }) }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: async (balde: string) => {
    h.baldes.push(balde);
    return { allowed: h.permitido };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/logger", () => ({ logger: { warn: h.aviso, error: vi.fn(), info: h.info } }));

import { POST } from "./route";

const ORG = "cccccccc-0000-4000-8000-000000000001";

interface Mundo {
  duplicado: boolean;
  statusExistente: string;
  dona: { organization_id: string } | null;
  donaPorCheckout: { organization_id: string } | null;
  emit: Resposta;
}
let m: Mundo;

function responder(c: Cadeia): Resposta {
  if (c.tabela === "webhook_events_log") {
    const op = operacao(c);
    if (op === "insert") return m.duplicado ? { error: { code: "23505", message: "dup" } } : { data: { id: "linha-1", status: "received" } };
    if (op === "select") return { data: { id: "linha-1", status: m.statusExistente } };
    return { data: null };
  }
  if (c.tabela === "cobranca_assinaturas") {
    return { data: valorDoFiltro(c, "eq", "checkout_provedor_id") !== undefined ? m.donaPorCheckout : m.dona };
  }
  return {};
}

const pedido = (provedor = "stripe", corpo = '{"id":"evt_1"}', ip: string | null = "10.0.0.1") =>
  POST(
    new NextRequest(`http://localhost/api/v1/webhooks/cobranca/${provedor}`, {
      method: "POST",
      body: corpo,
      headers: { "stripe-signature": "t=1,v1=ab", ...(ip ? { "x-forwarded-for": ip } : {}) },
    }),
    { params: Promise.resolve({ provedor }) },
  );
const doLog = (op: string) => h.banco.cadeias.filter((c) => c.tabela === "webhook_events_log" && operacao(c) === op);
const emits = () => h.banco.rpcs.filter((r) => r.nome === "emit_event");
const TOKEN_ASAAS = ["token", "do", "aviso", "0123456789abcdef"].join("_");
const doAsaas = (headers: Record<string, string>) =>
  POST(
    new NextRequest("http://localhost/api/v1/webhooks/cobranca/asaas", { method: "POST", body: '{"id":"evt_1"}', headers }),
    { params: Promise.resolve({ provedor: "asaas" }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.ligada = true;
  h.segredo = "whsec_teste";
  h.sinal = { eventoId: "evt_1", tipo: "invoice.paid", clienteRef: "cus_1" };
  h.permitido = true;
  h.baldes = [];
  m = { duplicado: false, statusExistente: "received", dona: { organization_id: ORG }, donaPorCheckout: null, emit: { data: "ev-1" } };
  h.banco = bancoFalso(responder, () => m.emit);
});

describe("webhook da cobrança", () => {
  it("provedor fora da lista, chave desligada ou sem segredo: 404 e nada gravado", async () => {
    expect((await pedido("mercadopago")).status).toBe(404);
    h.ligada = false;
    expect((await pedido()).status).toBe(404);
    h.ligada = true;
    h.segredo = null;
    expect((await pedido()).status).toBe(404);
    expect(h.banco.cadeias.filter((c) => c.tabela === "webhook_events_log")).toEqual([]);
  });

  it("⭐ assinatura inválida: 401 e deixa RASTRO que o dono vê (linha valid_signature=false, sem org, sem id, sem cabeçalhos)", async () => {
    h.sinal = null;
    expect((await pedido()).status).toBe(401);
    expect(doLog("insert").map((c) => argumentos(c, "insert")?.[0])).toEqual([
      {
        organization_id: null, provider: "stripe", raw_body: "{}", headers: null, signature_header: null,
        valid_signature: false, external_id: null, status: "error", error_message: "assinatura_invalida",
      },
    ]);
    expect(h.aviso).toHaveBeenCalledWith("cobranca.webhook_recusado", { provedor: "stripe", motivo: "assinatura_invalida" });
    expect(emits()).toEqual([]);
  });

  it("⭐ válido: ponteiro sem org, sem cabeçalhos e com corpo {id,type}; emite o sinal e fecha a linha", async () => {
    const res = await pedido();
    expect(res.status).toBe(200);
    expect(argumentos(doLog("insert")[0]!, "insert")?.[0]).toEqual({
      organization_id: null, provider: "stripe", raw_body: '{"id":"evt_1","type":"invoice.paid"}', headers: null,
      signature_header: "t=1,v1=ab", valid_signature: true, external_id: "evt_1", event_type: "invoice.paid", status: "received",
    });
    expect(emits()[0]?.args).toEqual({
      p_event_type: "cobranca.sinal", p_entity_kind: "organization", p_entity_id: ORG,
      p_payload: { provedor: "stripe", evento_id: "evt_1", tipo: "invoice.paid" }, p_metadata: { origem: "webhook_cobranca" }, p_organization_id: ORG,
    });
    expect(argumentos(doLog("update")[0]!, "update")?.[0]).toMatchObject({ status: "processed" });
  });

  it("⭐ duplicado já processado: 200 sem emitir", async () => {
    m.duplicado = true;
    m.statusExistente = "processed";
    expect((await pedido()).status).toBe(200);
    expect(emits()).toEqual([]);
  });

  it("⭐ duplicado ainda received (o emit anterior falhou): emite de novo e fecha a linha", async () => {
    m.duplicado = true;
    expect((await pedido()).status).toBe(200);
    expect(emits()).toHaveLength(1);
    expect(argumentos(doLog("update")[0]!, "update")?.[0]).toMatchObject({ status: "processed" });
  });

  it("cliente desconhecido: linha error com o motivo, 200 e nenhum sinal (a reconciliação cura)", async () => {
    m.dona = null;
    expect((await pedido()).status).toBe(200);
    expect(argumentos(doLog("update")[0]!, "update")?.[0]).toMatchObject({ status: "error", error_message: "cliente_desconhecido" });
    expect(emits()).toEqual([]);
  });

  it("emit que falha: 503 e a linha fica received (o provedor reentrega)", async () => {
    m.emit = { data: null, error: { code: "XX000", message: "boom" } };
    expect((await pedido()).status).toBe(503);
    expect(doLog("update")).toEqual([]);
  });

  it("⭐ aviso VÁLIDO nunca recebe 429, mesmo com o balde de recusas cheio (a reativação de quem pagou não espera)", async () => {
    h.permitido = false;
    expect((await pedido()).status).toBe(200);
    expect(h.baldes).toEqual([]);
  });

  it("assinatura inválida acima de 120/min do mesmo IP: 429 e nenhuma linha", async () => {
    h.sinal = null;
    h.permitido = false;
    expect((await pedido()).status).toBe(429);
    expect(h.baldes).toEqual(["cobranca-webhook-recusado:10.0.0.1"]);
    expect(doLog("insert")).toEqual([]);
  });

  it("recusa sem proxy à frente conta num balde próprio de recusas (só recusas o dividem)", async () => {
    h.sinal = null;
    await pedido("stripe", '{"id":"evt_1"}', null);
    expect(h.baldes).toEqual(["cobranca-webhook-recusado:sem-proxy"]);
  });

  it("corpo acima de 1 MB: 413", async () => {
    expect((await pedido("stripe", "x".repeat(1_048_577))).status).toBe(413);
    expect(doLog("insert")).toEqual([]);
  });
});

describe("webhook da cobrança pelo Asaas (PR 3b)", () => {
  it("⭐ Asaas: o token do cabeçalho nunca é gravado — nem como assinatura, que só a Stripe tem", async () => {
    const res = await doAsaas({ "asaas-access-token": TOKEN_ASAAS, "stripe-signature": "t=1,v1=forjada" });
    expect(res.status).toBe(200);
    expect(argumentos(doLog("insert")[0]!, "insert")?.[0]).toMatchObject({ provider: "asaas", signature_header: null, headers: null });
    expect(JSON.stringify([h.banco.cadeias, h.banco.rpcs])).not.toContain(TOKEN_ASAAS);
  });

  it("Asaas com token errado: 401, a linha de recusa sem token e sem assinatura", async () => {
    h.sinal = null;
    expect((await doAsaas({ "asaas-access-token": TOKEN_ASAAS, "stripe-signature": "t=1,v1=forjada" })).status).toBe(401);
    expect(argumentos(doLog("insert")[0]!, "insert")?.[0]).toMatchObject({ provider: "asaas", signature_header: null, valid_signature: false });
    expect(JSON.stringify(h.banco.cadeias)).not.toContain(TOKEN_ASAAS);
  });

  it("⭐ token vazado inundando com clientes que não existem: acima do balde, 200 SEM gravar linha (429 pararia a fila do Asaas)", async () => {
    m.dona = null;
    h.permitido = false;
    const res = await doAsaas({ "asaas-access-token": TOKEN_ASAAS, "x-forwarded-for": "10.0.0.9" });
    expect(res.status).toBe(200);
    // Trocar o x-forwarded-for não troca o balde: a chave é global por provedor.
    await doAsaas({ "asaas-access-token": TOKEN_ASAAS, "x-forwarded-for": "10.0.0.10" });
    expect(h.baldes).toEqual(["cobranca-webhook-desconhecido:asaas", "cobranca-webhook-desconhecido:asaas"]);
    expect(doLog("insert")).toEqual([]);
  });

  it("abaixo do balde, o aviso de cliente desconhecido do Asaas segue gravado como antes (a reconciliação cura)", async () => {
    m.dona = null;
    expect((await doAsaas({ "asaas-access-token": TOKEN_ASAAS })).status).toBe(200);
    expect(doLog("insert")).toHaveLength(1);
    expect(argumentos(doLog("update")[0]!, "update")?.[0]).toMatchObject({ status: "error", error_message: "cliente_desconhecido" });
  });

  it("controle: aviso VÁLIDO de cliente conhecido do Asaas nunca passa por balde nenhum", async () => {
    h.permitido = false;
    expect((await doAsaas({ "asaas-access-token": TOKEN_ASAAS })).status).toBe(200);
    expect(h.baldes).toEqual([]);
  });
});

describe("webhook do Asaas achando a empresa pelo checkout (mudança 011, AC-001)", () => {
  const CK = "5b7c0e6a-1d2f-4a3b-9c8d-7e6f5a4b3c2d";
  const comCheckout = (checkoutRef: string | null) => {
    h.sinal = { eventoId: "evt_ck", tipo: "PAYMENT_CONFIRMED", clienteRef: null, checkoutRef };
  };
  const consultasPorCheckout = () =>
    h.banco.cadeias.filter((c) => c.tabela === "cobranca_assinaturas" && valorDoFiltro(c, "eq", "checkout_provedor_id") !== undefined);

  it("AC-001.1: aviso com o checkout da empresa suspensa (cliente ainda não gravado) acha a empresa e dispara a releitura", async () => {
    comCheckout(CK);
    m.dona = null;
    m.donaPorCheckout = { organization_id: ORG };

    const res = await doAsaas({ "asaas-access-token": TOKEN_ASAAS });

    expect(res.status).toBe(200);
    expect(emits()).toHaveLength(1);
    expect(emits()[0]?.args).toMatchObject({ p_event_type: "cobranca.sinal", p_entity_id: ORG, p_organization_id: ORG });
    expect(argumentos(doLog("update")[0]!, "update")?.[0]).toMatchObject({ status: "processed" });
    expect(valorDoFiltro(consultasPorCheckout()[0]!, "eq", "checkout_provedor_id")).toBe(CK);
    expect(valorDoFiltro(consultasPorCheckout()[0]!, "eq", "provedor")).toBe("asaas");
  });

  it("AC-001.2: achado pelo checkout nunca passa pelo balde de desconhecidos e deixa o log de medição sem dado pessoal", async () => {
    comCheckout(CK);
    m.dona = null;
    m.donaPorCheckout = { organization_id: ORG };
    h.permitido = false;

    const res = await doAsaas({ "asaas-access-token": TOKEN_ASAAS });

    expect(res.status).toBe(200);
    expect(h.baldes).toEqual([]);
    expect(emits()).toHaveLength(1);
    expect(h.info).toHaveBeenCalledWith("cobranca.webhook_achado_por_checkout", { organization_id: ORG, provedor: "asaas" });
  });

  it("AC-001.2: cliente achado pela via de hoje não consulta o checkout", async () => {
    h.sinal = { eventoId: "evt_ck", tipo: "PAYMENT_CONFIRMED", clienteRef: "cus_1", checkoutRef: CK };
    m.donaPorCheckout = { organization_id: "outra" };

    await doAsaas({ "asaas-access-token": TOKEN_ASAAS });

    expect(consultasPorCheckout()).toEqual([]);
    expect(emits()[0]?.args).toMatchObject({ p_entity_id: ORG });
  });

  it("AC-001.3: checkoutSession que não é de nenhum checkout nosso: cliente_desconhecido, sem sinal e sob o mesmo balde", async () => {
    comCheckout(CK);
    m.dona = null;
    m.donaPorCheckout = null;

    const res = await doAsaas({ "asaas-access-token": TOKEN_ASAAS });

    expect(res.status).toBe(200);
    expect(h.baldes).toEqual(["cobranca-webhook-desconhecido:asaas"]);
    expect(argumentos(doLog("update")[0]!, "update")?.[0]).toMatchObject({ status: "error", error_message: "cliente_desconhecido" });
    expect(emits()).toEqual([]);
    expect(h.info).toHaveBeenCalledWith("cobranca.webhook_cliente_desconhecido", { provedor: "asaas", tem_checkout_session: true });
  });

  it("AC-001.3: checkout desconhecido acima do balde: 200 sem gravar linha nova", async () => {
    comCheckout(CK);
    m.dona = null;
    h.permitido = false;

    expect((await doAsaas({ "asaas-access-token": TOKEN_ASAAS })).status).toBe(200);
    expect(doLog("insert")).toEqual([]);
  });

  it("AC-001.6: aviso sem checkoutSession mantém o descarte de hoje e não consulta checkout", async () => {
    comCheckout(null);
    m.dona = null;
    m.donaPorCheckout = { organization_id: ORG };

    await doAsaas({ "asaas-access-token": TOKEN_ASAAS });

    expect(consultasPorCheckout()).toEqual([]);
    expect(emits()).toEqual([]);
    expect(argumentos(doLog("update")[0]!, "update")?.[0]).toMatchObject({ status: "error", error_message: "cliente_desconhecido" });
    expect(h.info).toHaveBeenCalledWith("cobranca.webhook_cliente_desconhecido", { provedor: "asaas", tem_checkout_session: false });
  });

  it("AC-001.4: aviso forjado só acorda a releitura: o evento carrega apenas ponteiros e nenhuma conta ou assinatura é escrita", async () => {
    comCheckout(CK);
    m.dona = null;
    m.donaPorCheckout = { organization_id: ORG };

    await doAsaas({ "asaas-access-token": TOKEN_ASAAS });

    expect(Object.keys(emits()[0]?.args.p_payload as object).sort()).toEqual(["evento_id", "provedor", "tipo"]);
    const escritas = h.banco.cadeias.filter((c) => operacao(c) !== "select" && c.tabela !== "webhook_events_log");
    expect(escritas).toEqual([]);
  });

  it("AC-001.7: o token nunca é gravado nem emitido, e a rota não compara o token (quem compara é o adaptador, em tempo constante)", async () => {
    comCheckout(CK);
    m.dona = null;
    m.donaPorCheckout = { organization_id: ORG };

    await doAsaas({ "asaas-access-token": TOKEN_ASAAS });

    expect(JSON.stringify([h.banco.cadeias, h.banco.rpcs, h.info.mock.calls, h.aviso.mock.calls])).not.toContain(TOKEN_ASAAS);
    // O ponteiro gravado é só {id,type}: o checkoutSession do corpo não vai para o arquivo de avisos.
    expect(JSON.stringify(argumentos(doLog("insert")[0]!, "insert"))).not.toContain(CK);
  });
});

describe("webhook do trial com cartão: segurança e ordem (mudança 003, AC-008.1 e AC-008.2)", () => {
  it("AC-008.1: token inválido do Asaas é recusado sem alterar nada de cobrança (nem emite sinal, nem toca a assinatura)", async () => {
    h.sinal = null;

    const res = await doAsaas({ "asaas-access-token": "errado" });

    expect(res.status).toBe(401);
    expect(emits()).toEqual([]);
    expect(h.banco.cadeias.filter((c) => c.tabela === "cobranca_assinaturas")).toEqual([]);
  });

  it("AC-008.2: o mesmo evento entregue duas vezes emite um sinal só", async () => {
    await doAsaas({ "asaas-access-token": TOKEN_ASAAS });
    m.duplicado = true;
    m.statusExistente = "processed";

    const segunda = await doAsaas({ "asaas-access-token": TOKEN_ASAAS });

    expect(segunda.status).toBe(200);
    expect(emits()).toHaveLength(1);
  });

  it("AC-008.2: eventos fora de ordem emitem só o sinal da empresa (sem estado no payload): quem decide é a releitura, igual em qualquer ordem", async () => {
    h.sinal = { eventoId: "evt_2", tipo: "PAYMENT_RECEIVED", clienteRef: "cus_1" };
    await doAsaas({ "asaas-access-token": TOKEN_ASAAS });
    h.sinal = { eventoId: "evt_1", tipo: "SUBSCRIPTION_UPDATED", clienteRef: "cus_1" };
    await doAsaas({ "asaas-access-token": TOKEN_ASAAS });

    expect(emits().map((e) => Object.keys(e.args.p_payload as object).sort())).toEqual([
      ["evento_id", "provedor", "tipo"],
      ["evento_id", "provedor", "tipo"],
    ]);
    expect(emits().every((e) => e.args.p_entity_id === ORG)).toBe(true);
  });
});
