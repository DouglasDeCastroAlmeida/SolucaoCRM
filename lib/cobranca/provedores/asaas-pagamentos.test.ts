import { describe, expect, it } from "vitest";

import { criarAdaptadorAsaas } from "./asaas";
import { ErroDoProvedor } from "./contrato";

/**
 * O 1º pagamento e a nota fiscal lidos do Asaas (mudança 003, Fatia 8).
 * Reembolso (AC-006.3) olha a 1ª cobrança PAGA; a nota (AC-007.2) é o link da
 * NFS-e do pagamento mais recente. O corpo de `/invoices` NÃO foi provado no
 * sandbox (pessoa física): o teste fixa o contrato que o código assume, e a
 * falha de leitura sobe como `ErroDoProvedor` para quem chama engolir.
 * `fetch` simulado.
 */
const CHAVE = ["$aact", "hmlg", "000ChaveDeMentiraDoSandbox00"].join("_");

function montar(respostas: { pagamentos?: unknown[]; notas?: unknown[]; notasStatus?: number }) {
  const caminhos: string[] = [];
  const adaptador = criarAdaptadorAsaas({
    lerChave: async () => CHAVE,
    fetch: (async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(entrada));
      caminhos.push(`${init?.method ?? "GET"} ${url.pathname.replace(/^\/v3/, "")}${url.search}`);
      if (url.pathname.endsWith("/payments")) return Response.json({ data: respostas.pagamentos ?? [] });
      if (url.pathname.endsWith("/invoices")) {
        return Response.json({ data: respostas.notas ?? [] }, { status: respostas.notasStatus ?? 200 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch,
    esperar: async () => {},
    agora: () => new Date("2026-10-12T15:00:00Z"),
    marca: "a1b2c3d4e5f60718",
  });
  return { adaptador, caminhos };
}

const pg = (id: string, status: string, dueDate: string, extra: Record<string, unknown> = {}) => ({ id, status, dueDate, subscription: "sub_1", ...extra });

describe("Asaas lerPrimeiroPagamento", () => {
  it("AC-006.3: devolve a 1ª cobrança PAGA (a mais antiga), com o dia da confirmação", async () => {
    const { adaptador, caminhos } = montar({
      pagamentos: [
        pg("pay_2", "CONFIRMED", "2026-11-08", { confirmedDate: "2026-11-08" }),
        pg("pay_1", "CONFIRMED", "2026-10-08", { confirmedDate: "2026-10-09", paymentDate: "2026-10-09" }),
        pg("pay_0", "PENDING", "2026-09-08"),
      ],
    });

    const r = await adaptador.lerPrimeiroPagamento!("sub_1");

    expect(r?.pagamentoRef).toBe("pay_1");
    // O dia 09/10 em São Paulo (UTC-3): a janela é do dia civil, não da hora.
    expect(r?.pagoEm.toISOString()).toBe("2026-10-09T03:00:00.000Z");
    expect(r?.pagoAte.toISOString()).toBe("2026-10-10T02:59:59.000Z");
    expect(caminhos).toEqual(["GET /payments?subscription=sub_1&limit=100"]);
  });

  it("AC-006.3: sem cobrança paga (ainda no teste) devolve null", async () => {
    const { adaptador } = montar({ pagamentos: [pg("pay_1", "PENDING", "2026-10-08")] });

    expect(await adaptador.lerPrimeiroPagamento!("sub_1")).toBeNull();
  });

  it("AC-006.4: paga sem data de confirmação cai no vencimento (nunca inventa uma data melhor)", async () => {
    const { adaptador } = montar({ pagamentos: [pg("pay_1", "RECEIVED", "2026-10-08")] });

    const r = await adaptador.lerPrimeiroPagamento!("sub_1");
    expect(r?.pagoEm.toISOString()).toBe("2026-10-08T03:00:00.000Z");
    expect(r?.pagoAte.toISOString()).toBe("2026-10-09T02:59:59.000Z");
  });
});

describe("Asaas lerLinkDaNota", () => {
  it("AC-007.2: devolve o PDF da nota autorizada do pagamento mais recente", async () => {
    const { adaptador, caminhos } = montar({
      pagamentos: [pg("pay_1", "CONFIRMED", "2026-10-08"), pg("pay_2", "CONFIRMED", "2026-11-08")],
      notas: [{ id: "inv_1", status: "AUTHORIZED", pdfUrl: "https://www.asaas.com/i/nota.pdf" }],
    });

    expect(await adaptador.lerLinkDaNota!("sub_1")).toBe("https://www.asaas.com/i/nota.pdf");
    expect(caminhos[1]).toBe("GET /invoices?payment=pay_2&limit=10");
  });

  it("AC-007.2: nota ainda não autorizada (agendada, cancelada, com erro) não vira link", async () => {
    const { adaptador } = montar({
      pagamentos: [pg("pay_1", "CONFIRMED", "2026-10-08")],
      notas: [{ id: "inv_1", status: "SCHEDULED", pdfUrl: "https://www.asaas.com/i/nota.pdf" }],
    });

    expect(await adaptador.lerLinkDaNota!("sub_1")).toBeNull();
  });

  it("AC-007.2: link que não é https nunca chega à tela", async () => {
    const { adaptador } = montar({
      pagamentos: [pg("pay_1", "CONFIRMED", "2026-10-08")],
      notas: [{ id: "inv_1", status: "AUTHORIZED", pdfUrl: "javascript:alert(1)" }],
    });

    expect(await adaptador.lerLinkDaNota!("sub_1")).toBeNull();
  });

  it("AC-007.2: sem pagamento confirmado não há nota para procurar", async () => {
    const { adaptador, caminhos } = montar({ pagamentos: [pg("pay_1", "PENDING", "2026-10-08")] });

    expect(await adaptador.lerLinkDaNota!("sub_1")).toBeNull();
    expect(caminhos).toHaveLength(1);
  });

  it("AC-007.3: falha do provedor sobe como ErroDoProvedor (quem chama engole)", async () => {
    const { adaptador } = montar({ pagamentos: [pg("pay_1", "CONFIRMED", "2026-10-08")], notasStatus: 400 });

    await expect(adaptador.lerLinkDaNota!("sub_1")).rejects.toBeInstanceOf(ErroDoProvedor);
  });
});
