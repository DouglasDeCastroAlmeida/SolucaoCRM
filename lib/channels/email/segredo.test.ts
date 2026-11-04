import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: h.encrypt, decryptWebhookSecret: h.decrypt }));
vi.mock("@/lib/logger", () => ({ logger: h.log }));

import { gravarSenhaDaCaixa, lerSenhaDaCaixa, ultimosQuatro } from "./segredo";

const SENHA = "abcdwxyz12345678";

/** Banco falso: guarda o que foi gravado em email_credenciais, por (organização, caixa). */
function bancoFalso(linhas: Array<Record<string, unknown>> = []) {
  const filtros: Array<[string, unknown]> = [];
  const admin = {
    from: (tabela: string) => {
      expect(tabela).toBe("email_credenciais");
      const api = {
        update: (valores: Record<string, unknown>) => {
          filtros.length = 0;
          const cadeia = {
            eq: (coluna: string, valor: unknown) => {
              filtros.push([coluna, valor]);
              return cadeia;
            },
            select: async () => {
              const alvo = linhas.filter((l) => filtros.every(([c, v]) => l[c] === v));
              alvo.forEach((l) => Object.assign(l, valores));
              return { data: alvo, error: null };
            },
          };
          return cadeia;
        },
        insert: async (linha: Record<string, unknown>) => {
          linhas.push(linha);
          return { error: null };
        },
        select: () => {
          filtros.length = 0;
          const cadeia = {
            eq: (coluna: string, valor: unknown) => {
              filtros.push([coluna, valor]);
              return cadeia;
            },
            maybeSingle: async () => ({
              data: linhas.find((l) => filtros.every(([c, v]) => l[c] === v)) ?? null,
              error: null,
            }),
          };
          return cadeia;
        },
      };
      return api;
    },
  };
  return { admin: admin as never, linhas };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.encrypt.mockImplementation(async (_: unknown, v: string) => `\\x${Buffer.from([...v].reverse().join("")).toString("hex")}`);
  h.decrypt.mockImplementation(async (_: unknown, c: string) => [...Buffer.from(c.slice(2), "hex").toString()].reverse().join(""));
});

describe("segredo da caixa de e-mail", () => {
  it("AC-007.1: guarda só o cifrado, nunca a senha em claro, com a organização à mão", async () => {
    const { admin, linhas } = bancoFalso();
    const r = await gravarSenhaDaCaixa(admin, { organizationId: "org-1", channelSessionId: "cx-1", senha: SENHA });

    expect(r).toEqual({ ok: true });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ organization_id: "org-1", channel_session_id: "cx-1" });
    expect(JSON.stringify(linhas)).not.toContain(SENHA);
    expect(linhas[0]?.senha_encrypted).toBe(h.encrypt.mock.results[0] && (await h.encrypt.mock.results[0].value));
  });

  it("AC-007.1: trocar a senha atualiza a linha existente em vez de criar outra", async () => {
    const { admin, linhas } = bancoFalso([
      { organization_id: "org-1", channel_session_id: "cx-1", senha_encrypted: "\\xantigo" },
    ]);
    await gravarSenhaDaCaixa(admin, { organizationId: "org-1", channelSessionId: "cx-1", senha: SENHA });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.senha_encrypted).not.toBe("\\xantigo");
  });

  it("AC-007.1: sem a chave de cifra a senha NÃO é gravada (nunca em claro como alternativa)", async () => {
    h.encrypt.mockResolvedValue(null);
    const { admin, linhas } = bancoFalso();
    const r = await gravarSenhaDaCaixa(admin, { organizationId: "org-1", channelSessionId: "cx-1", senha: SENHA });

    expect(r).toEqual({ ok: false, motivo: "cifra_indisponivel" });
    expect(linhas).toHaveLength(0);
  });

  it("AC-007.1: a leitura decifra só a linha da própria organização", async () => {
    const { admin } = bancoFalso();
    await gravarSenhaDaCaixa(admin, { organizationId: "org-1", channelSessionId: "cx-1", senha: SENHA });

    expect(await lerSenhaDaCaixa(admin, { organizationId: "org-1", channelSessionId: "cx-1" })).toBe(SENHA);
    expect(await lerSenhaDaCaixa(admin, { organizationId: "org-2", channelSessionId: "cx-1" })).toBeNull();
  });

  it("AC-007.1: mostra só os 4 últimos caracteres, e nada quando a senha é curta demais para mostrar parte dela", () => {
    expect(ultimosQuatro(SENHA)).toBe("5678");
    expect(ultimosQuatro("curta12")).toBe("");
  });

  it("AC-007.2: nenhum caminho do módulo escreve a senha no log nem no console", async () => {
    const consola = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "info")];
    const { admin } = bancoFalso();
    await gravarSenhaDaCaixa(admin, { organizationId: "org-1", channelSessionId: "cx-1", senha: SENHA });
    await lerSenhaDaCaixa(admin, { organizationId: "org-1", channelSessionId: "cx-1" });
    h.encrypt.mockResolvedValue(null);
    await gravarSenhaDaCaixa(admin, { organizationId: "org-1", channelSessionId: "cx-2", senha: SENHA });

    const tudo = JSON.stringify([...Object.values(h.log).map((f) => f.mock.calls), ...consola.map((c) => c.mock.calls)]);
    expect(tudo).not.toContain(SENHA);
    consola.forEach((c) => c.mockRestore());
  });
});
