import { describe, expect, it, vi } from "vitest";

import {
  fetchComIpFixado,
  lerCorpoComTeto,
  lookupFixado,
  resolverDestinoSeguro,
  type RequisicaoFixada,
} from "./destino-seguro";

const publico = (ips: string[]) => async () => ips;

describe("resolverDestinoSeguro", () => {
  it.each([
    ["loopback", "127.0.0.1"],
    ["loopback v6", "::1"],
    ["link-local", "169.254.1.1"],
    ["metadata de nuvem", "169.254.169.254"],
    ["RFC1918 10/8", "10.0.0.5"],
    ["RFC1918 172.16/12", "172.20.1.1"],
    ["RFC1918 192.168/16", "192.168.1.10"],
    ["CGNAT", "100.64.0.1"],
    ["multicast", "224.0.0.1"],
    ["reservada", "240.0.0.1"],
    ["ULA v6", "fd00::1"],
  ])("AC-002.1: recusa nome que resolve para %s", async (_nome, ip) => {
    const r = await resolverDestinoSeguro("https://api.exemplo.com/v1", { resolver: publico([ip]) });
    expect(r).toEqual({ ok: false, motivo: "ip_especial" });
  });

  it("AC-002.1: recusa se QUALQUER endereco resolvido for especial (rebinding)", async () => {
    const r = await resolverDestinoSeguro("https://api.exemplo.com", {
      resolver: publico(["8.8.8.8", "10.0.0.1"]),
    });
    expect(r).toEqual({ ok: false, motivo: "ip_especial" });
  });

  it("AC-002.1: recusa IP literal especial, inclusive entre colchetes", async () => {
    expect(await resolverDestinoSeguro("https://127.0.0.1/x")).toEqual({
      ok: false,
      motivo: "ip_especial",
    });
    expect(await resolverDestinoSeguro("https://[::1]/x")).toEqual({
      ok: false,
      motivo: "ip_especial",
    });
  });

  it("AC-002.1: DNS que falha ou volta vazio e recusado", async () => {
    const falha = await resolverDestinoSeguro("https://nao.existe", {
      resolver: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    const vazio = await resolverDestinoSeguro("https://nao.existe", { resolver: publico([]) });
    expect(falha).toEqual({ ok: false, motivo: "dns_falhou" });
    expect(vazio).toEqual({ ok: false, motivo: "dns_falhou" });
  });

  it("AC-002.1: endereco que nao e URL e recusado", async () => {
    expect(await resolverDestinoSeguro("isto nao e url")).toEqual({
      ok: false,
      motivo: "host_invalido",
    });
  });

  it("AC-002.2: http e recusado", async () => {
    const r = await resolverDestinoSeguro("http://api.exemplo.com", { resolver: publico(["8.8.8.8"]) });
    expect(r).toEqual({ ok: false, motivo: "http" });
  });

  it("AC-002.3: devolve o IP validado e o nome para o TLS", async () => {
    const r = await resolverDestinoSeguro("https://api.exemplo.com:8443/v1", {
      resolver: publico(["8.8.4.4"]),
    });
    expect(r).toEqual({ ok: true, ip: "8.8.4.4", servername: "api.exemplo.com" });
  });
});

describe("fetchComIpFixado", () => {
  it("AC-002.3: a conexao usa o IP validado, sem segunda resolucao", async () => {
    const resolver = vi.fn(async () => ["8.8.8.8"]);
    const chamadas: RequisicaoFixada[] = [];
    const requisitar = async (req: RequisicaoFixada) => {
      chamadas.push(req);
      return new Response("ok", { status: 200 });
    };

    const res = await fetchComIpFixado("https://api.exemplo.com/v1", undefined, { resolver, requisitar });

    expect(res.status).toBe(200);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(chamadas[0]?.ip).toBe("8.8.8.8");
    expect(chamadas[0]?.servername).toBe("api.exemplo.com");
  });

  it("AC-002.1: destino especial nem chega a conectar", async () => {
    const requisitar = vi.fn();
    await expect(
      fetchComIpFixado("https://x.exemplo.com", undefined, {
        resolver: publico(["10.0.0.1"]),
        requisitar,
      }),
    ).rejects.toThrow("unsafe_url:ip_especial");
    expect(requisitar).not.toHaveBeenCalled();
  });

  it("AC-002.4: redirecionamento para destino interno nao e seguido", async () => {
    const resolver = async (host: string) => (host === "interno.exemplo.com" ? ["10.0.0.9"] : ["8.8.8.8"]);
    const urls: string[] = [];
    const requisitar = async (req: RequisicaoFixada) => {
      urls.push(req.url.href);
      return new Response(null, { status: 302, headers: { location: "https://interno.exemplo.com/x" } });
    };

    await expect(
      fetchComIpFixado("https://api.exemplo.com/v1", undefined, { resolver, requisitar }),
    ).rejects.toThrow("unsafe_url:redirect_not_followed");
    expect(urls).toEqual(["https://api.exemplo.com/v1"]);
  });

  it("AC-002.4: redirecionamento para http e recusado", async () => {
    const requisitar = async () =>
      new Response(null, { status: 301, headers: { location: "http://api.exemplo.com/x" } });
    await expect(
      fetchComIpFixado("https://api.exemplo.com/v1", undefined, {
        resolver: publico(["8.8.8.8"]),
        requisitar,
      }),
    ).rejects.toThrow("unsafe_url:redirect_not_followed");
  });

  it("AC-002.4: redirecionamento para destino valido e revalidado e fixado de novo", async () => {
    const chamadas: RequisicaoFixada[] = [];
    const requisitar = async (req: RequisicaoFixada) => {
      chamadas.push(req);
      return chamadas.length === 1
        ? new Response(null, { status: 307, headers: { location: "https://outro.exemplo.com/y" } })
        : new Response("fim", { status: 200 });
    };
    const resolver = async (host: string) => (host === "outro.exemplo.com" ? ["1.1.1.1"] : ["8.8.8.8"]);

    const res = await fetchComIpFixado("https://api.exemplo.com/v1", undefined, { resolver, requisitar });

    expect(res.status).toBe(200);
    expect(chamadas.map((c) => c.ip)).toEqual(["8.8.8.8", "1.1.1.1"]);
  });
});

describe("fetchComIpFixado com redirect manual", () => {
  it("AC-002.4: com redirect manual o 3xx volta ao chamador sem ser seguido", async () => {
    const chamadas: RequisicaoFixada[] = [];
    const requisitar = async (req: RequisicaoFixada) => {
      chamadas.push(req);
      return new Response(null, { status: 302, headers: { location: "https://outro.exemplo.com/" } });
    };

    const res = await fetchComIpFixado(
      "https://api.exemplo.com/v1",
      { redirect: "manual" },
      { resolver: publico(["8.8.8.8"]), requisitar },
    );

    expect(res.status).toBe(302);
    expect(chamadas).toHaveLength(1);
  });
});

describe("lookupFixado", () => {
  it("AC-002.3: o lookup da conexao devolve sempre o IP fixado, qualquer que seja o nome", () => {
    const lookup = lookupFixado("8.8.8.8");
    const unico = vi.fn();
    lookup("qualquer.nome", {}, unico);
    expect(unico).toHaveBeenCalledWith(null, "8.8.8.8", 4);

    const todos = vi.fn();
    lookup("qualquer.nome", { all: true }, todos);
    expect(todos).toHaveBeenCalledWith(null, [{ address: "8.8.8.8", family: 4 }]);
  });
});

const AUTH = { authorization: "Bearer segredo", cookie: "a=1", "proxy-authorization": "x" };

describe("fetchComIpFixado: redirecionamento nao vaza credencial", () => {
  function cenario(statusDoRedirect: number, destino: string) {
    const chamadas: RequisicaoFixada[] = [];
    const requisitar = async (req: RequisicaoFixada) => {
      chamadas.push(req);
      return chamadas.length === 1
        ? new Response(null, { status: statusDoRedirect, headers: { location: destino } })
        : new Response("fim", { status: 200 });
    };
    return { chamadas, requisitar };
  }
  const resolver = async (h: string) => (h === "outro.exemplo.com" ? ["1.1.1.1"] : ["8.8.8.8"]);

  it("AC-002.4: para OUTRO host, Authorization e Cookie nao chegam", async () => {
    const { chamadas, requisitar } = cenario(307, "https://outro.exemplo.com/y");
    await fetchComIpFixado(
      "https://api.exemplo.com/v1",
      { method: "POST", body: "{}", headers: AUTH },
      { resolver, requisitar },
    );
    const h = new Headers(chamadas[1]?.init.headers);
    expect(h.get("authorization")).toBeNull();
    expect(h.get("cookie")).toBeNull();
    expect(h.get("proxy-authorization")).toBeNull();
    expect(chamadas[1]?.init.body).toBe("{}"); // 307 preserva metodo e corpo
  });

  it("AC-002.4: para o MESMO host, as credenciais seguem", async () => {
    const { chamadas, requisitar } = cenario(307, "https://api.exemplo.com/outro");
    await fetchComIpFixado("https://api.exemplo.com/v1", { headers: AUTH }, { resolver, requisitar });
    expect(new Headers(chamadas[1]?.init.headers).get("authorization")).toBe("Bearer segredo");
  });

  it.each([301, 302, 303])("AC-002.4: %s vira GET e descarta o corpo", async (status) => {
    const { chamadas, requisitar } = cenario(status, "https://api.exemplo.com/outro");
    await fetchComIpFixado(
      "https://api.exemplo.com/v1",
      { method: "POST", body: "{}", headers: { "content-type": "application/json" } },
      { resolver, requisitar },
    );
    expect(chamadas[1]?.init.method).toBe("GET");
    expect(chamadas[1]?.init.body).toBeUndefined();
    expect(new Headers(chamadas[1]?.init.headers).get("content-type")).toBeNull();
  });
});

describe("fetchComIpFixado: cabecalhos que o chamador nao controla", () => {
  it("AC-002.3: Host e Content-Length de init.headers sao ignorados; o SNI segue o nome original", async () => {
    const chamadas: RequisicaoFixada[] = [];
    await fetchComIpFixado(
      "https://api.exemplo.com/v1",
      { headers: { Host: "interno.local", "Content-Length": "999", "X-Ok": "1" } },
      {
        resolver: publico(["8.8.8.8"]),
        requisitar: async (req) => {
          chamadas.push(req);
          return new Response("ok");
        },
      },
    );
    const h = new Headers(chamadas[0]?.init.headers);
    expect(h.get("host")).toBeNull();
    expect(h.get("content-length")).toBeNull();
    expect(h.get("x-ok")).toBe("1");
    expect(chamadas[0]?.servername).toBe("api.exemplo.com");
  });
});

describe("fetchComIpFixado: limites de tempo e tamanho", () => {
  it("AC-002.5: corpo acima do teto e destruido e rejeita response_too_large", async () => {
    const res = await fetchComIpFixado("https://api.exemplo.com/v1", undefined, {
      resolver: publico(["8.8.8.8"]),
      maxBytes: 10,
      requisitar: async () => new Response("x".repeat(100)),
    });
    await expect(res.text()).rejects.toThrow("unsafe_url:response_too_large");
  });

  it("AC-002.5: content-length declarado acima do teto rejeita antes de ler", async () => {
    await expect(
      fetchComIpFixado("https://api.exemplo.com/v1", undefined, {
        resolver: publico(["8.8.8.8"]),
        maxBytes: 10,
        requisitar: async () => new Response("x", { headers: { "content-length": "5000" } }),
      }),
    ).rejects.toThrow("unsafe_url:response_too_large");
  });

  it("AC-002.5: corpo dentro do teto passa inteiro", async () => {
    const res = await fetchComIpFixado("https://api.exemplo.com/v1", undefined, {
      resolver: publico(["8.8.8.8"]),
      maxBytes: 10,
      requisitar: async () => new Response("curto"),
    });
    expect(await res.text()).toBe("curto");
  });

  it("AC-002.5: resposta que nao chega no prazo rejeita com timeout e aborta o sinal", async () => {
    let sinal: AbortSignal | undefined;
    await expect(
      fetchComIpFixado("https://api.exemplo.com/v1", undefined, {
        resolver: publico(["8.8.8.8"]),
        timeoutMs: 20,
        requisitar: (req) => {
          sinal = req.init.signal ?? undefined;
          return new Promise<Response>(() => undefined);
        },
      }),
    ).rejects.toThrow("unsafe_url:timeout");
    expect(sinal?.aborted).toBe(true);
  });
});

describe("lerCorpoComTeto", () => {
  it("AC-002.5: le dentro do teto e rejeita acima dele", async () => {
    expect(await lerCorpoComTeto(new Response('{"a":1}'), 100)).toBe('{"a":1}');
    await expect(lerCorpoComTeto(new Response("x".repeat(50)), 10)).rejects.toThrow(
      "unsafe_url:response_too_large",
    );
  });
});
