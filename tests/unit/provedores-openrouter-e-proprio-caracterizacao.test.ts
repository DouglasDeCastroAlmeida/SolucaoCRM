/**
 * Caracterização (mudança 006, T-006): OpenRouter e provedor com endereço
 * próprio já existem. Estes testes fixam o comportamento que os critérios do
 * REQ-001 pedem, para uma regressão futura reprovar aqui.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultRegistry } from "@/lib/agent-engine/edge/llm/providers";
import { descreverErroDeValidacao } from "@/lib/ai/credenciais/erro-de-validacao";
import { PROVEDOR_POR_ID } from "@/lib/ai/pontos/provedores";
import { validateProviderKey } from "@/lib/ai/provider-validators";
import { buildModel } from "@/lib/ai/runtime/agent";

// A chave de cifragem das credenciais, só para este arquivo.
vi.mock("@/lib/env", async (original) => {
  const real = await original<typeof import("@/lib/env")>();
  const chave = Buffer.alloc(32, 7).toString("base64");
  const env = new Proxy(real.env, {
    get: (alvo, nome) => (nome === "AI_CRED_AES_KEY" ? chave : Reflect.get(alvo, nome)),
  });
  return { ...real, env };
});
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  return { lookup, default: { lookup } };
});

describe("REQ-001: provedores OpenRouter e com endereço próprio", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC-001.1: OpenRouter está na lista e o modelo se monta só com chave e modelo (endereço já preenchido)", () => {
    expect(PROVEDOR_POR_ID.get("openrouter")?.rotulo).toBe("OpenRouter");
    // Sem endereço informado: o provedor sabe o seu.
    expect(buildModel("openrouter", "sk-or-v1-abcdef", "openai/gpt-4o-mini")).toBeDefined();
    expect(createDefaultRegistry().openrouter!("sk-or-v1-abcdef", "openai/gpt-4o-mini")).toBeDefined();
  });

  it("AC-001.2: o provedor com endereço próprio exige endereço, chave e modelo", () => {
    expect(PROVEDOR_POR_ID.get("custom")?.aceitaEndpointProprio).toBe(true);
    expect(() => buildModel("custom", "sk-x", "gpt-x")).toThrow(/custom_provider_sem_base_url/);
    expect(buildModel("custom", "sk-x", "gpt-x", "https://gw.exemplo/v1")).toBeDefined();
  });

  it("AC-001.3: o teste da chave prova a credencial no OpenRouter (chave falsa é recusada, não aceita)", async () => {
    const espiao = vi.fn(async (url: string) => {
      void url;
      return new Response("", { status: 401 });
    });
    vi.stubGlobal("fetch", espiao);

    const r = await validateProviderKey("openrouter", "sk-or-v1-falsa");

    expect(r).toEqual({ ok: false, error: "auth_failed_401" });
    expect(String(espiao.mock.calls[0]?.[0])).toMatch(/\/key$/);
  });

  it("AC-001.3: cada causa vira frase em português que aponta a ação certa", () => {
    expect(descreverErroDeValidacao("auth_failed_401", "openrouter").frase).toMatch(/OpenRouter recusou a chave/);
    expect(descreverErroDeValidacao("provider_status_402", "openrouter").frase).toMatch(/tem crédito/);
    expect(descreverErroDeValidacao("provider_status_404", "custom").frase).toMatch(/base URL/);
    expect(descreverErroDeValidacao("unsafe_url:dns_failed", "custom").frase).toMatch(/não resolve/);
    expect(descreverErroDeValidacao("network_error", "custom").generico).toBe(false);
  });

  it("AC-001.4: a chave nunca volta inteira, só os 4 últimos caracteres", async () => {
    const { encryptKey } = await import("@/lib/crypto/aes_gcm");
    const segredo = "sk-or-v1-0123456789abcdef";

    const cifrada = encryptKey(segredo);

    expect(cifrada.last4).toBe("cdef");
    expect(cifrada.ciphertext.toString("utf8")).not.toContain(segredo);
  });

  it("AC-001.5: OpenRouter e endereço próprio entram pelo mesmo registry dos demais provedores", () => {
    const registry = createDefaultRegistry();
    for (const id of ["anthropic", "openai", "openrouter", "custom"] as const) {
      expect(typeof registry[id]).toBe("function");
    }
  });
});
