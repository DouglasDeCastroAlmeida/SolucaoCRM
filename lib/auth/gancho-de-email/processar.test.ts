import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";
import type { MarcaDeSaida } from "@/lib/branding/saida";

import { baseDoLink, processarGanchoDeEmail, type DepsDoGancho } from "./processar";

const CHAVE = Buffer.from("segredo-de-teste-com-bytes-suficientes").toString("base64");
const SEGREDO = `v1,whsec_${CHAVE}`;
const AGORA_MS = 1_800_000_000_000;

const ALFA: Brand = {
  ...MARCA_PADRAO_EMBUTIDA,
  id: "alfa",
  slug: "alfa",
  name: "Corretora Alfa",
  is_default: false,
  app_name: "Corretora Alfa",
  sender_name: "Equipe Alfa",
};
const PADRAO: Brand = { ...MARCA_PADRAO_EMBUTIDA, id: "padrao", app_name: "Produto Padrao" };

function saidaDe(b: Brand): MarcaDeSaida {
  return {
    nome: b.app_name ?? b.name,
    logoUrl: null,
    accent: "#123456",
    accentFg: "#ffffff",
    origens: { nome: "marca", cor: "marca" },
  };
}

function corpoDe(over: Record<string, unknown> = {}, acao = "recovery"): string {
  return JSON.stringify({
    user: { id: "u1", email: "Ana@Exemplo.com" },
    email_data: {
      token: "123456",
      token_hash: "hash-1",
      redirect_to: "https://app.alfa.example/auth/confirm?type=recovery",
      email_action_type: acao,
      site_url: "https://x.example",
      ...over,
    },
  });
}

function pedido(corpo: string, id = "msg_1", ts = AGORA_MS / 1000) {
  const mac = createHmac("sha256", Buffer.from(CHAVE, "base64")).update(`${id}.${ts}.${corpo}`).digest("base64");
  return { corpo, id, timestamp: String(ts), assinatura: `v1,${mac}` };
}

type Estado = { entregas: Set<string>; contexto: Brand | null };

function montar(over: Partial<DepsDoGancho> = {}, estado: Estado = { entregas: new Set(), contexto: ALFA }) {
  const enviar = vi.fn().mockResolvedValue({ ok: true, id: "e1", via: "resend" });
  const reportar = vi.fn();
  const auditar = vi.fn().mockResolvedValue(undefined);
  const deps: DepsDoGancho = {
    segredo: SEGREDO,
    agoraMs: () => AGORA_MS,
    appUrl: "https://app.padrao.example",
    repo: {
      registrarEntrega: async (id) => {
        if (estado.entregas.has(id)) return "repetida";
        estado.entregas.add(id);
        return "nova";
      },
      apagarEntrega: async (id) => {
        estado.entregas.delete(id);
      },
      marcaDoContexto: async () => estado.contexto,
      marcaPadrao: async () => PADRAO,
      hostsDaMarca: async (id) => (id === "alfa" ? ["app.alfa.example"] : []),
    },
    marcaDeSaida: async (b) => saidaDe(b),
    enviar,
    reportar,
    auditar,
    ...over,
  };
  return { deps, enviar, reportar, auditar, estado };
}

describe("gancho de e-mail: assinatura e idempotência", () => {
  beforeEach(() => vi.clearAllMocks());

  it("AC-006.2: assinatura inválida devolve 401 e não envia", async () => {
    const { deps, enviar } = montar();
    const p = pedido(corpoDe());
    const r = await processarGanchoDeEmail({ ...p, assinatura: "v1,AAAA" }, deps);
    expect(r.status).toBe(401);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("AC-006.2: sem assinatura nenhuma também é 401", async () => {
    const { deps, enviar } = montar();
    const r = await processarGanchoDeEmail({ corpo: corpoDe(), id: "", timestamp: "", assinatura: "" }, deps);
    expect(r.status).toBe(401);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("AC-006.5: o mesmo webhook-id entregue duas vezes envia um só e-mail", async () => {
    const { deps, enviar } = montar();
    const p = pedido(corpoDe());
    const primeira = await processarGanchoDeEmail(p, deps);
    const segunda = await processarGanchoDeEmail(p, deps);
    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("AC-006.5: sem contexto usa a marca padrão, sem nome de outra marca", async () => {
    const { deps, enviar } = montar({}, { entregas: new Set(), contexto: null });
    const r = await processarGanchoDeEmail(
      pedido(corpoDe({ redirect_to: "https://qualquer.example/auth/confirm" }), "msg_2"),
      deps,
    );
    expect(r.status).toBe(200);
    const args = enviar.mock.calls[0]![0] as { html: string; to: string };
    expect(args.html).toContain("Produto Padrao");
    expect(args.html).not.toContain("Corretora Alfa");
    expect(args.html).toContain("https://app.padrao.example/auth/confirm?token_hash=hash-1");
  });

  it("AC-006.1: com contexto da marca envia ao destinatário com a marca e o link no domínio dela", async () => {
    const { deps, enviar } = montar();
    await processarGanchoDeEmail(pedido(corpoDe()), deps);
    const args = enviar.mock.calls[0]![0] as { html: string; to: string; fromName: string };
    expect(args.to).toBe("Ana@Exemplo.com");
    expect(args.fromName).toBe("Equipe Alfa");
    expect(args.html).toContain("Corretora Alfa");
    expect(args.html).toContain("https://app.alfa.example/auth/confirm?token_hash=hash-1&amp;type=recovery");
  });

  it("corpo que não é do formato do GoTrue devolve 400 e não envia", async () => {
    const { deps, enviar } = montar();
    const r = await processarGanchoDeEmail(pedido(JSON.stringify({ user: {} })), deps);
    expect(r.status).toBe(400);
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe("gancho de e-mail: falha de envio", () => {
  it("AC-006.3: falha vira 500 com mensagem reconhecível, alerta no Sentry e linha de auditoria", async () => {
    const { deps, enviar, reportar, auditar } = montar();
    enviar.mockResolvedValue({ ok: false, error: "send_failed", via: "resend" });
    const r = await processarGanchoDeEmail(pedido(corpoDe()), deps);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.corpo)).toContain("email_hook_send_failed");
    expect(reportar).toHaveBeenCalledTimes(1);
    expect(auditar).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.email_hook_send_failed" }));
  });

  it("AC-006.3: o alerta e a auditoria não carregam o e-mail em claro nem o token", async () => {
    const { deps, enviar, reportar, auditar } = montar();
    enviar.mockResolvedValue({ ok: false, error: "not_configured", via: "resend" });
    await processarGanchoDeEmail(pedido(corpoDe()), deps);
    const visto = JSON.stringify([reportar.mock.calls, auditar.mock.calls]);
    expect(visto).not.toContain("Ana@Exemplo.com");
    expect(visto).not.toContain("hash-1");
    expect(visto).not.toContain("123456");
  });

  it("AC-006.3: a falha libera o webhook-id, para a retentativa do GoTrue poder enviar", async () => {
    const { deps, enviar } = montar();
    enviar.mockResolvedValueOnce({ ok: false, error: "send_failed", via: "resend" });
    const p = pedido(corpoDe());
    expect((await processarGanchoDeEmail(p, deps)).status).toBe(500);
    expect((await processarGanchoDeEmail(p, deps)).status).toBe(200);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("AC-006.3: exceção no envio também vira 500 (nunca derruba a rota)", async () => {
    const { deps, enviar } = montar();
    enviar.mockRejectedValue(new Error("rede"));
    const r = await processarGanchoDeEmail(pedido(corpoDe()), deps);
    expect(r.status).toBe(500);
  });
});

describe("gancho de e-mail: revisão", () => {
  it("S2: erro de banco ao registrar a entrega vira 500 email_hook_send_failed, com alerta", async () => {
    const { deps, enviar, reportar } = montar();
    deps.repo.registrarEntrega = async () => {
      throw new Error("auth_hook_deliveries: 57P01");
    };
    const r = await processarGanchoDeEmail(pedido(corpoDe()), deps);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.corpo)).toContain("email_hook_send_failed");
    expect(reportar).toHaveBeenCalledTimes(1);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("S3: o texto livre do erro do roteador (com o destinatário) não vai ao Sentry nem à auditoria", async () => {
    const { deps, enviar, reportar, auditar } = montar();
    enviar.mockResolvedValue({ ok: false, error: "rejeitado para Ana@Exemplo.com", via: "smtp" });
    await processarGanchoDeEmail(pedido(corpoDe()), deps);
    const visto = JSON.stringify([reportar.mock.calls, auditar.mock.calls]);
    expect(visto).not.toContain("Ana@Exemplo.com");
    expect(visto).toContain("envio_falhou:desconhecido");
  });

  it("S3: código conhecido do roteador é preservado", async () => {
    const { deps, enviar, reportar } = montar();
    enviar.mockResolvedValue({ ok: false, error: "sender_rejected", via: "smtp" });
    await processarGanchoDeEmail(pedido(corpoDe()), deps);
    expect(JSON.stringify(reportar.mock.calls)).toContain("envio_falhou:sender_rejected");
  });

  it("S4: marca não padrão sem domínio ativo não envia com o domínio da plataforma: 500 e alerta", async () => {
    const { deps, enviar, reportar } = montar();
    deps.repo.hostsDaMarca = async () => [];
    const r = await processarGanchoDeEmail(pedido(corpoDe()), deps);
    expect(r.status).toBe(500);
    expect(enviar).not.toHaveBeenCalled();
    expect(JSON.stringify(reportar.mock.calls)).toContain("marca_sem_dominio_ativo");
    expect(JSON.stringify(reportar.mock.calls)).not.toContain("Ana@Exemplo.com");
  });
});

describe("baseDoLink", () => {
  it("S4: marca não padrão sem domínio ativo devolve null (nunca o endereço da plataforma)", () => {
    expect(baseDoLink({ redirectTo: null, marca: ALFA, hosts: [], appUrl: "https://app.padrao.example" })).toBeNull();
  });
  it("AC-006.1: usa o host do redirect quando ele é um domínio ativo da marca", () => {
    expect(
      baseDoLink({ redirectTo: "https://app.alfa.example/x", marca: ALFA, hosts: ["app.alfa.example"], appUrl: "https://app.padrao.example" }),
    ).toBe("https://app.alfa.example");
  });
  it("AC-006.4: host de redirect que não é da marca é ignorado (nunca o domínio de outro)", () => {
    expect(
      baseDoLink({ redirectTo: "https://app.beta.example/x", marca: ALFA, hosts: ["app.alfa.example"], appUrl: "https://app.padrao.example" }),
    ).toBe("https://app.alfa.example");
  });
  it("marca padrão usa o endereço do app", () => {
    expect(
      baseDoLink({ redirectTo: "https://outro.example/x", marca: PADRAO, hosts: [], appUrl: "https://app.padrao.example/" }),
    ).toBe("https://app.padrao.example");
  });
});
