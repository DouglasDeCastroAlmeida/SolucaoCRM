/**
 * T-030: a chamada ao servidor MCP externo usa destino seguro com IP fixado,
 * tem prazo de 10 segundos com erro claro e corpo com limite. AC-007.5, 007.6.
 *
 * A rede é a fronteira: `requisitar` (executor do destino seguro) e `fetch`
 * (transporte do SDK) são os únicos substitutos.
 */
import { describe, expect, it } from "vitest";

import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

import {
  chamarFerramentaRemota,
  ErroDeChamadaMcp,
  fetchDestinoSeguro,
  PRAZO_DA_CHAMADA_MS,
  TETO_DO_CORPO_BYTES,
} from "./chamada";

const CHAVE = "chave-secreta-9999";
const ENDPOINT = "https://erp.exemplo/mcp";
const IP_PUBLICO = "93.184.216.34";

const resolverPublico = async () => [IP_PUBLICO];

function json(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("AC-007.6: prazo de 10 segundos com erro claro", () => {
  it("AC-007.6: o prazo da chamada é de 10 segundos", () => {
    expect(PRAZO_DA_CHAMADA_MS).toBe(10_000);
  });

  it("AC-007.6: servidor que não responde termina no prazo com erro que nomeia o servidor, sem a chave", async () => {
    const mudo: FetchLike = () => new Promise<Response>(() => undefined);

    const erro = await chamarFerramentaRemota(
      { endpoint: ENDPOINT, chave: CHAVE, slug: "loja-a" },
      "buscar_pedido",
      {},
      { fetch: mudo, timeoutMs: 40 },
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeChamadaMcp);
    expect((erro as ErroDeChamadaMcp).codigo).toBe("timeout");
    expect((erro as Error).message).toContain("loja-a");
    expect((erro as Error).message).toContain("segundos");
    expect((erro as Error).message).not.toContain(CHAVE);
  });

  it("AC-007.6: falha de conexão vira erro claro e a chave que o motivo trouxer é mascarada", async () => {
    const quebrado: FetchLike = async () => {
      throw new Error(`ECONNREFUSED enquanto usava ${CHAVE}`);
    };

    const erro = await chamarFerramentaRemota(
      { endpoint: ENDPOINT, chave: CHAVE, slug: "loja-a" },
      "buscar_pedido",
      {},
      { fetch: quebrado, timeoutMs: 500 },
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeChamadaMcp);
    expect((erro as ErroDeChamadaMcp).codigo).toBe("indisponivel");
    expect((erro as Error).message).not.toContain("ECONNREFUSED");
    expect((erro as Error).message).not.toContain(CHAVE);
  });
});

describe("AC-007.5: destino seguro com IP fixado e corpo com limite", () => {
  it("AC-007.5: a conexão sai para o IP que foi validado, falando com o nome do servidor", async () => {
    const vistos: Array<{ ip: string; servername: string }> = [];
    const seguro = fetchDestinoSeguro(ENDPOINT, {
      resolver: resolverPublico,
      requisitar: async (req) => {
        vistos.push({ ip: req.ip, servername: req.servername });
        return json({ ok: true });
      },
    });

    const res = await seguro(ENDPOINT, { method: "POST", body: "{}" });

    expect(res.status).toBe(200);
    expect(vistos).toEqual([{ ip: IP_PUBLICO, servername: "erp.exemplo" }]);
  });

  it("AC-007.5: nome que resolve para IP interno não abre conexão", async () => {
    let abriu = false;
    const seguro = fetchDestinoSeguro(ENDPOINT, {
      resolver: async () => ["169.254.169.254"],
      requisitar: async () => {
        abriu = true;
        return json({});
      },
    });

    await expect(seguro(ENDPOINT, {})).rejects.toThrow(/unsafe_url:ip_especial/);
    expect(abriu).toBe(false);
  });

  it("AC-007.5: http é recusado", async () => {
    const seguro = fetchDestinoSeguro("http://erp.exemplo/mcp", { resolver: resolverPublico });
    await expect(seguro("http://erp.exemplo/mcp", {})).rejects.toThrow(/unsafe_url:http/);
  });

  it("AC-007.5: host diferente do cadastrado falha fechado, antes do DNS", async () => {
    let resolveu = false;
    const seguro = fetchDestinoSeguro(ENDPOINT, {
      resolver: async () => {
        resolveu = true;
        return [IP_PUBLICO];
      },
    });
    await expect(seguro("https://outro.exemplo/mcp", {})).rejects.toThrow(/unsafe_url:host_nao_cadastrado/);
    expect(resolveu).toBe(false);
  });

  it("AC-007.5: corpo acima do teto é interrompido", async () => {
    const seguro = fetchDestinoSeguro(ENDPOINT, {
      resolver: resolverPublico,
      maxBytes: 64,
      requisitar: async () => new Response("x".repeat(500), { status: 200 }),
    });

    const res = await seguro(ENDPOINT, {});
    await expect(res.text()).rejects.toThrow(/response_too_large/);
  });

  it("AC-007.5: redirecionamento 3xx não é seguido", async () => {
    let chamadas = 0;
    const seguro = fetchDestinoSeguro(ENDPOINT, {
      resolver: resolverPublico,
      requisitar: async () => {
        chamadas += 1;
        return new Response(null, { status: 302, headers: { location: "https://interno.exemplo/x" } });
      },
    });

    const res = await seguro(ENDPOINT, {});

    expect(res.status).toBe(302);
    expect(chamadas).toBe(1);
  });

  it("AC-007.5: o teto padrão do corpo é de 1 MiB", () => {
    expect(TETO_DO_CORPO_BYTES).toBe(1024 * 1024);
  });
});
