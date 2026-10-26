import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";
import { criarDecisorTlsAsk, type DepsTlsAsk } from "@/lib/brands/tls-ask";

const TOKEN = "segredo-de-teste-1234567890";
const IP = "203.0.113.10";

const marca = { ...MARCA_PADRAO_EMBUTIDA, id: "m1", slug: "m1", name: "M1", is_default: false } as Brand;

type Ajuste = Partial<DepsTlsAsk>;
function montar(extra: Ajuste = {}) {
  const alerta = vi.fn();
  const deps: DepsTlsAsk = {
    tokenEsperado: TOKEN,
    ipDaVps: IP,
    limitePorHora: 3,
    agora: () => 1_000_000,
    buscarMarca: async (host) =>
      host === "app.cliente.com.br" ? { brand: marca, domainKind: "proprio" } : { brand: marca, domainKind: "padrao" },
    resolverIpv4: async () => [IP],
    alertar: alerta,
    ...extra,
  };
  return { decidir: criarDecisorTlsAsk(deps), alerta };
}
const pedido = (extra: Partial<{ domain: string | null; token: string | null; xff: string | null }> = {}) => ({
  domain: "app.cliente.com.br",
  token: TOKEN,
  xff: null,
  ...extra,
});

describe("tls-ask (REQ-007)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("AC-007.1: domínio ativo de marca ativa com DNS na VPS => 200", async () => {
    const { decidir } = montar();
    expect((await decidir(pedido())).status).toBe(200);
  });

  it("AC-007.2: domínio desconhecido, inativo ou de marca inativa (cai na marca padrão) => 404", async () => {
    const { decidir } = montar();
    expect((await decidir(pedido({ domain: "outro.com.br" }))).status).toBe(404);
  });

  it("AC-007.2: DNS que não aponta para a VPS, sem DNS ou resolvedor que falha => 403", async () => {
    for (const resolverIpv4 of [
      async () => ["198.51.100.9"],
      async () => [] as string[],
      async () => {
        throw new Error("ENOTFOUND");
      },
    ]) {
      const { decidir } = montar({ resolverIpv4 });
      expect((await decidir(pedido())).status).toBe(403);
    }
  });

  it("AC-007.2: VPS_PUBLIC_IP não configurado => 403", async () => {
    const { decidir } = montar({ ipDaVps: "" });
    expect((await decidir(pedido())).status).toBe(403);
  });

  it("AC-007.2: domínio ausente ou malformado => 400", async () => {
    const { decidir } = montar();
    expect((await decidir(pedido({ domain: null }))).status).toBe(400);
    expect((await decidir(pedido({ domain: "a b/../c" }))).status).toBe(400);
  });

  it("AC-007.3: sem token, token errado ou token do servidor vazio => 403", async () => {
    const { decidir } = montar();
    expect((await decidir(pedido({ token: null }))).status).toBe(403);
    expect((await decidir(pedido({ token: "errado" }))).status).toBe(403);
    const vazio = montar({ tokenEsperado: "" });
    expect((await vazio.decidir(pedido({ token: "" }))).status).toBe(403);
  });

  it("AC-007.3: x-forwarded-for presente (veio por fora) => 403 mesmo com token certo", async () => {
    const { decidir } = montar();
    expect((await decidir(pedido({ xff: "198.51.100.77" }))).status).toBe(403);
  });

  it("AC-007.4: acima do limite por hora => 429 com alerta; passada a hora, volta a aprovar", async () => {
    let t = 1_000_000;
    const { decidir, alerta } = montar({
      agora: () => t,
      buscarMarca: async () => ({ brand: marca, domainKind: "proprio" }),
    });
    for (const h of ["a.x.com", "b.x.com", "c.x.com"]) expect((await decidir(pedido({ domain: h }))).status).toBe(200);
    expect((await decidir(pedido({ domain: "a.x.com" }))).status).toBe(200); // mesmo domínio não consome
    expect((await decidir(pedido({ domain: "d.x.com" }))).status).toBe(429);
    expect(alerta).toHaveBeenCalledTimes(1);
    t += 61 * 60 * 1000;
    expect((await decidir(pedido({ domain: "d.x.com" }))).status).toBe(200);
  });

  it("AC-007.5: domínio removido/marca desativada deixa de ser aprovado (renovação recusada)", async () => {
    let ativo = true;
    const { decidir } = montar({
      buscarMarca: async () => ({ brand: marca, domainKind: ativo ? "proprio" : "padrao" }),
    });
    expect((await decidir(pedido())).status).toBe(200);
    ativo = false;
    expect((await decidir(pedido())).status).toBe(404);
  });
});
