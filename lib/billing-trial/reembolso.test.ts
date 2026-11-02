import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErroDoProvedor, type AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";
import { argumentos, bancoFalso, operacao, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

import { dentroDaJanelaDeReembolso, JANELA_DO_REEMBOLSO_DIAS, pedirReembolso, reembolsoDisponivel } from "./reembolso";

/**
 * Reembolso de arrependimento (mudança 003, AC-006.3 a AC-006.5): janela de 7 dias
 * depois da 1ª cobrança PAGA, um pedido por pagamento, item na Central da plataforma
 * (`incidents`) e conta cancelada. A devolução em si é manual, no painel do Asaas.
 */
const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const DIA = 24 * 3_600_000;
const PAGO_EM = new Date("2026-10-10T02:59:59.000Z");
const DENTRO = new Date(PAGO_EM.getTime() + 3 * DIA);
const FORA = new Date(PAGO_EM.getTime() + 7 * DIA + 1000);

describe("dentroDaJanelaDeReembolso", () => {
  it("AC-006.3: vale do instante do pagamento até exatamente 7 dias depois", () => {
    expect(JANELA_DO_REEMBOLSO_DIAS).toBe(7);
    expect(dentroDaJanelaDeReembolso(PAGO_EM, PAGO_EM)).toBe(true);
    expect(dentroDaJanelaDeReembolso(PAGO_EM, new Date(PAGO_EM.getTime() + 7 * DIA))).toBe(true);
  });

  it("AC-006.4: um segundo depois dos 7 dias já está fora", () => {
    expect(dentroDaJanelaDeReembolso(PAGO_EM, FORA)).toBe(false);
  });

  it("AC-006.4: pagamento no futuro (relógio torto) nunca abre a janela", () => {
    expect(dentroDaJanelaDeReembolso(new Date(PAGO_EM.getTime() + DIA), PAGO_EM)).toBe(false);
  });
});

interface Mundo {
  linha: Record<string, unknown> | null;
  pedidoJaExiste: boolean;
  falhaNoIncidente: boolean;
}
let m: Mundo;
let banco: BancoFalso;
const lerPrimeiroPagamento = vi.fn<NonNullable<AdaptadorDeCobranca["lerPrimeiroPagamento"]>>();
const cancelarNoFim = vi.fn<AdaptadorDeCobranca["cancelarNoFim"]>();
const sincronizar = vi.fn();
let agora = DENTRO;

function responder(c: Cadeia): Resposta {
  if (c.tabela === "cobranca_assinaturas" && operacao(c) === "select") return { data: m.linha };
  if (c.tabela === "cobranca_reembolsos" && operacao(c) === "insert") {
    return m.pedidoJaExiste ? { error: { code: "23505", message: "duplicate key" } } : { data: null };
  }
  if (c.tabela === "incidents" && operacao(c) === "insert" && m.falhaNoIncidente) return { error: { code: "XX000", message: "fora" } };
  return { data: null };
}
const executar = () =>
  pedirReembolso(banco.cliente as never, ORG, {
    adaptador: () => ({ lerPrimeiroPagamento, cancelarNoFim } as unknown as AdaptadorDeCobranca),
    agora: () => agora,
    sincronizar,
  });
const escritasEm = (tabela: string, op: string) => banco.cadeias.filter((c) => c.tabela === tabela && operacao(c) === op);

beforeEach(() => {
  vi.clearAllMocks();
  agora = DENTRO;
  m = { linha: { provedor: "asaas", provedor_assinatura_id: "sub_1", cancela_no_fim: false }, pedidoJaExiste: false, falhaNoIncidente: false };
  banco = bancoFalso(responder);
  lerPrimeiroPagamento.mockResolvedValue({ pagamentoRef: "pay_1", pagoEm: PAGO_EM });
  cancelarNoFim.mockResolvedValue(undefined);
  sincronizar.mockResolvedValue({ tipo: "aplicada", estado: "cancelada", mudou: true, acao: "nada" });
});

describe("pedirReembolso", () => {
  it("⭐ AC-006.3: dentro da janela grava o pedido, abre o item na Central e cancela a conta", async () => {
    expect(await executar()).toEqual({ tipo: "criado", pagamentoRef: "pay_1" });

    expect(argumentos(escritasEm("cobranca_reembolsos", "insert")[0]!, "insert")?.[0]).toEqual({ organization_id: ORG, pagamento_ref: "pay_1" });
    const incidente = argumentos(escritasEm("incidents", "insert")[0]!, "insert")?.[0] as Record<string, unknown>;
    expect(incidente).toMatchObject({ organization_id: ORG, type: "cobranca.reembolso_pedido", severity: "warning" });
    expect(incidente.payload).toEqual({ acao: "devolver_no_asaas", pagamento_ref: "pay_1" });
    expect(cancelarNoFim).toHaveBeenCalledWith("sub_1");
    expect(argumentos(escritasEm("cobranca_assinaturas", "update")[0]!, "update")?.[0]).toMatchObject({ cancela_no_fim: true });
    expect(sincronizar).toHaveBeenCalledWith(banco.cliente, ORG);
  });

  it("⭐ AC-006.4: fora da janela é recusado sem escrever nada nem cancelar", async () => {
    agora = FORA;
    expect(await executar()).toMatchObject({ tipo: "recusado", status: 422, code: "reembolso_fora_da_janela" });
    expect(banco.cadeias.filter((c) => operacao(c) !== "select")).toEqual([]);
    expect(cancelarNoFim).not.toHaveBeenCalled();
  });

  it("AC-006.4: nada pago ainda (no teste) também é recusado", async () => {
    lerPrimeiroPagamento.mockResolvedValue(null);
    expect(await executar()).toMatchObject({ tipo: "recusado", code: "reembolso_fora_da_janela" });
    expect(escritasEm("cobranca_reembolsos", "insert")).toEqual([]);
  });

  it("⭐ AC-006.5: segundo pedido da mesma cobrança não cria outro item da Central", async () => {
    m.pedidoJaExiste = true;
    expect(await executar()).toEqual({ tipo: "ja_pedido", pagamentoRef: "pay_1" });
    expect(escritasEm("incidents", "insert")).toEqual([]);
  });

  it("AC-006.5: o segundo pedido ainda tenta cancelar a conta que o primeiro deixou de cancelar", async () => {
    m.pedidoJaExiste = true;
    await executar();
    expect(cancelarNoFim).toHaveBeenCalledWith("sub_1");
  });

  it("AC-006.5: conta já cancelada no segundo pedido não chama o provedor de novo", async () => {
    m.pedidoJaExiste = true;
    m.linha = { ...m.linha, cancela_no_fim: true };
    await executar();
    expect(cancelarNoFim).not.toHaveBeenCalled();
  });

  it("AC-006.3: sem assinatura no provedor não há o que reembolsar (409)", async () => {
    m.linha = { provedor: null, provedor_assinatura_id: null, cancela_no_fim: false };
    expect(await executar()).toMatchObject({ tipo: "recusado", status: 409 });
  });

  it("provedor fora do ar ao ler o pagamento: 503 e nada gravado", async () => {
    lerPrimeiroPagamento.mockRejectedValue(new ErroDoProvedor(503, "api_error", true));
    expect(await executar()).toMatchObject({ tipo: "recusado", status: 503, code: "provedor_indisponivel" });
    expect(escritasEm("cobranca_reembolsos", "insert")).toEqual([]);
  });

  it("falha ao abrir o item da Central desfaz o pedido, para o cliente poder tentar de novo", async () => {
    m.falhaNoIncidente = true;
    expect(await executar()).toMatchObject({ tipo: "recusado", status: 500 });
    expect(escritasEm("cobranca_reembolsos", "delete")).toHaveLength(1);
    expect(cancelarNoFim).not.toHaveBeenCalled();
  });

  it("falha ao cancelar no provedor depois do pedido gravado: 503, e o pedido segue de pé", async () => {
    cancelarNoFim.mockRejectedValue(new ErroDoProvedor(503, "api_error", true));
    expect(await executar()).toMatchObject({ tipo: "recusado", status: 503 });
    expect(escritasEm("cobranca_reembolsos", "delete")).toEqual([]);
  });
});

describe("reembolsoDisponivel (o botão da tela)", () => {
  const ler = () =>
    reembolsoDisponivel(banco.cliente as never, ORG, {
      adaptador: () => ({ lerPrimeiroPagamento } as unknown as AdaptadorDeCobranca),
      agora: () => agora,
    });

  it("AC-006.3: dentro da janela mostra o botão e diz até quando", async () => {
    expect(await ler()).toEqual({ disponivel: true, ate: new Date(PAGO_EM.getTime() + 7 * DIA) });
  });

  it("AC-006.4: fora da janela não mostra o botão", async () => {
    agora = FORA;
    expect(await ler()).toEqual({ disponivel: false, ate: null });
  });

  it("AC-006.4: conta já cancelada não mostra o botão", async () => {
    m.linha = { provedor: "asaas", provedor_assinatura_id: "sub_1", cancela_no_fim: true };
    expect(await ler()).toEqual({ disponivel: false, ate: null });
  });

  it("provedor fora do ar: sem botão, nunca erro na tela", async () => {
    lerPrimeiroPagamento.mockRejectedValue(new Error("rede"));
    expect(await ler()).toEqual({ disponivel: false, ate: null });
  });
});
