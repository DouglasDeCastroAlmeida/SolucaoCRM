import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErroDoProvedor, type AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";
import { argumentos, bancoFalso, operacao, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

import { limparCacheDaNota, lerLinkDaNota, pedirNotaDaAssinatura, TIPO_DO_AVISO_DE_NOTA } from "./nota";

/**
 * A nota fiscal (mudança 003, AC-007.2 e AC-007.3). O Asaas emite; nós só PEDIMOS na
 * criação da assinatura e LEMOS o link para a tela. Nada disso pode travar o pagamento:
 * toda falha é engolida, e a de emissão avisa a Central da plataforma, uma vez.
 */
const ORG = "bbbbbbbb-0000-4000-8000-000000000001";
const AGORA = new Date("2026-10-20T12:00:00Z");

interface Mundo {
  linha: Record<string, unknown> | null;
  avisoAberto: boolean;
}
let m: Mundo;
let banco: BancoFalso;
let agora = AGORA;
const lerLinkDaNotaNoProvedor = vi.fn<NonNullable<AdaptadorDeCobranca["lerLinkDaNota"]>>();
const pedirNotaFiscal = vi.fn<NonNullable<AdaptadorDeCobranca["pedirNotaFiscal"]>>();
const deps = () => ({
  adaptador: () => ({ lerLinkDaNota: lerLinkDaNotaNoProvedor, pedirNotaFiscal } as unknown as AdaptadorDeCobranca),
  agora: () => agora,
});

function responder(c: Cadeia): Resposta {
  if (c.tabela === "cobranca_assinaturas") return { data: m.linha };
  if (c.tabela === "incidents" && operacao(c) === "select") return { data: m.avisoAberto ? [{ id: "i1" }] : [] };
  return { data: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  limparCacheDaNota();
  agora = AGORA;
  m = { linha: { provedor: "asaas", provedor_assinatura_id: "sub_1" }, avisoAberto: false };
  banco = bancoFalso(responder);
  lerLinkDaNotaNoProvedor.mockResolvedValue("https://www.asaas.com/i/nota.pdf");
  pedirNotaFiscal.mockResolvedValue(undefined);
});

describe("lerLinkDaNota", () => {
  it("⭐ AC-007.2: devolve o link da nota lido do provedor", async () => {
    expect(await lerLinkDaNota(banco.cliente as never, ORG, deps())).toBe("https://www.asaas.com/i/nota.pdf");
    expect(lerLinkDaNotaNoProvedor).toHaveBeenCalledWith("sub_1");
  });

  it("AC-007.2: guarda por poucos minutos: reabrir a tela não bate no provedor de novo", async () => {
    await lerLinkDaNota(banco.cliente as never, ORG, deps());
    agora = new Date(AGORA.getTime() + 60_000);
    await lerLinkDaNota(banco.cliente as never, ORG, deps());
    expect(lerLinkDaNotaNoProvedor).toHaveBeenCalledTimes(1);
  });

  it("AC-007.2: passado o tempo do cache, lê de novo (a nota pode ter saído)", async () => {
    lerLinkDaNotaNoProvedor.mockResolvedValueOnce(null);
    expect(await lerLinkDaNota(banco.cliente as never, ORG, deps())).toBeNull();
    agora = new Date(AGORA.getTime() + 10 * 60_000);
    expect(await lerLinkDaNota(banco.cliente as never, ORG, deps())).toBe("https://www.asaas.com/i/nota.pdf");
    expect(lerLinkDaNotaNoProvedor).toHaveBeenCalledTimes(2);
  });

  it("⭐ AC-007.3: provedor fora do ar não derruba a tela: sem link, sem erro", async () => {
    lerLinkDaNotaNoProvedor.mockRejectedValue(new ErroDoProvedor(503, "api_error", true));
    expect(await lerLinkDaNota(banco.cliente as never, ORG, deps())).toBeNull();
  });

  it("AC-007.2: sem assinatura no provedor não há nota (e nada é perguntado)", async () => {
    m.linha = { provedor: null, provedor_assinatura_id: null };
    expect(await lerLinkDaNota(banco.cliente as never, ORG, deps())).toBeNull();
    expect(lerLinkDaNotaNoProvedor).not.toHaveBeenCalled();
  });

  it("AC-007.2: provedor que não sabe ler nota (Stripe) devolve null", async () => {
    expect(await lerLinkDaNota(banco.cliente as never, ORG, { ...deps(), adaptador: () => ({} as AdaptadorDeCobranca) })).toBeNull();
  });
});

describe("pedirNotaDaAssinatura", () => {
  const pedir = () => pedirNotaDaAssinatura(banco.cliente as never, { orgId: ORG, provedor: "asaas", assinaturaRef: "sub_1" }, deps());
  const avisos = () => banco.cadeias.filter((c) => c.tabela === "incidents" && operacao(c) === "insert");

  it("AC-007.1: pede a emissão na criação da assinatura", async () => {
    expect(await pedir()).toBe("pedida");
    expect(pedirNotaFiscal).toHaveBeenCalledWith({ assinaturaRef: "sub_1", descricao: expect.any(String) });
    expect(avisos()).toEqual([]);
  });

  it("⭐ AC-007.3: o provedor recusa (sem dados fiscais): não lança e avisa a Central da plataforma", async () => {
    pedirNotaFiscal.mockRejectedValue(new ErroDoProvedor(400, "invalid_action", false));
    expect(await pedir()).toBe("falhou");
    expect(argumentos(avisos()[0]!, "insert")?.[0]).toMatchObject({
      organization_id: ORG,
      type: TIPO_DO_AVISO_DE_NOTA,
      severity: "warning",
      payload: { acao: "conferir_dados_fiscais", codigo: "invalid_action" },
    });
  });

  it("AC-007.3: falha repetida não enche a Central: um aviso aberto por empresa", async () => {
    pedirNotaFiscal.mockRejectedValue(new ErroDoProvedor(400, "invalid_action", false));
    m.avisoAberto = true;
    expect(await pedir()).toBe("falhou");
    expect(avisos()).toEqual([]);
  });

  it("AC-007.3: nem o aviso gravar atrapalha: resolve mesmo com o banco falhando", async () => {
    pedirNotaFiscal.mockRejectedValue(new Error("rede"));
    banco = bancoFalso((c) => (c.tabela === "incidents" ? { error: { code: "XX000", message: "fora" } } : responder(c)));
    await expect(pedir()).resolves.toBe("falhou");
  });

  it("AC-007.3: provedor sem pedido de nota (Stripe) não é falha nem aviso", async () => {
    const r = await pedirNotaDaAssinatura(banco.cliente as never, { orgId: ORG, provedor: "stripe", assinaturaRef: "sub_1" }, {
      ...deps(),
      adaptador: () => ({} as AdaptadorDeCobranca),
    });
    expect(r).toBe("nao_suportada");
    expect(avisos()).toEqual([]);
  });
});
