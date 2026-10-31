import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmar = vi.hoisted(() => vi.fn());
const limite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({ env: { INTERNAL_SECRET: "segredo-interno-de-teste-com-mais-de-32-chars" } }));
vi.mock("@/lib/billing-trial/confirmar", () => ({ confirmarTrialDoCheckout: confirmar }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: limite }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: async () => ({ nome: "Marca" }) }));
vi.mock("@/lib/cobranca/url", () => ({ destinoDaVolta: () => "/account-suspended?voltou=1" }));

import { urlDeRetorno } from "@/lib/billing-trial/retorno";

import { GET } from "./route";

const ORG = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const TENTATIVA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeEach(() => {
  confirmar.mockReset().mockResolvedValue({ tipo: "confirmada", reativada: true, primeiraVez: true });
  limite.mockReset().mockResolvedValue({ allowed: true });
});

describe("GET /cobranca/volta", () => {
  it("AC-003.2: o retorno selado do Checkout confirma o trial ANTES de entregar a ponte", async () => {
    const r = await GET(new Request(urlDeRetorno("https://marca.exemplo", ORG, "ok", TENTATIVA)));

    expect(confirmar).toHaveBeenCalledWith(expect.anything(), { orgId: ORG, resultado: "ok", tentativa: TENTATIVA });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("/account-suspended?voltou=1");
  });

  it("AC-003.3: o cancelamento selado passa o resultado cancelado", async () => {
    await GET(new Request(urlDeRetorno("https://marca.exemplo", ORG, "cancelado", TENTATIVA)));

    expect(confirmar).toHaveBeenCalledWith(expect.anything(), { orgId: ORG, resultado: "cancelado", tentativa: TENTATIVA });
  });

  it("AC-003.3: volta sem selo (ou com selo trocado) segue sem efeito nenhum", async () => {
    await GET(new Request("https://marca.exemplo/cobranca/volta?para=hub&voltou=1&ok=1&o=" + ORG));
    const forjada = urlDeRetorno("https://marca.exemplo", ORG, "ok", TENTATIVA).replace("ok=1", "cancelado=1");
    await GET(new Request(forjada));

    expect(confirmar).not.toHaveBeenCalled();
  });

  it("AC-008.4: confirmação que falha ou limite estourado não derrubam a volta", async () => {
    confirmar.mockRejectedValueOnce(new Error("banco fora"));
    const falhou = await GET(new Request(urlDeRetorno("https://marca.exemplo", ORG, "ok", TENTATIVA)));
    limite.mockResolvedValueOnce({ allowed: false });
    const limitada = await GET(new Request(urlDeRetorno("https://marca.exemplo", ORG, "ok", TENTATIVA)));

    expect(falhou.status).toBe(200);
    expect(limitada.status).toBe(200);
    expect(confirmar).toHaveBeenCalledTimes(1);
  });
});
