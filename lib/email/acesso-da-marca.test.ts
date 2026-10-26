import { describe, expect, it, vi } from "vitest";

import type { Brand } from "@/lib/brands/tipos";
import { MARCA_PADRAO_EMBUTIDA } from "@/lib/brands/tipos";
import type { MarcaDeSaida } from "@/lib/branding/saida";

const marcaDaSaida = vi.hoisted(() => vi.fn());
vi.mock("@/lib/branding/saida", async (orig) => ({
  ...(await orig<typeof import("@/lib/branding/saida")>()),
  marcaDaSaida,
}));

import { montarEmailDeAcesso, marcaDeSaidaDaMarca, ACOES_DE_ACESSO } from "./acesso-da-marca";

function saida(nome: string, logo: string | null): MarcaDeSaida {
  return { nome, logoUrl: logo, accent: "#123456", accentFg: "#ffffff", origens: { nome: "marca", cor: "marca" } };
}

const CORRETORA = saida("Corretora Alfa", "https://alfa.example/logo.png");
const NUTRI = saida("Nutri Beta", "https://beta.example/logo.png");

describe("e-mails de acesso por marca", () => {
  it.each(ACOES_DE_ACESSO)("AC-006.1: %s traz nome, logo, remetente e o link no domínio da marca", (acao) => {
    const email = montarEmailDeAcesso({
      acao,
      marca: CORRETORA,
      senderName: "Equipe Alfa",
      replyTo: "ajuda@alfa.example",
      supportEmail: "suporte@alfa.example",
      baseUrl: "https://app.alfa.example",
      tokenHash: "abc123",
      token: "654321",
    });
    expect(email.subject).toContain("Corretora Alfa");
    expect(email.html).toContain("Corretora Alfa");
    expect(email.html).toContain("https://alfa.example/logo.png");
    expect(email.fromName).toBe("Equipe Alfa");
    expect(email.replyTo).toBe("ajuda@alfa.example");
    if (acao === "reauthentication") {
      expect(email.html).toContain("654321");
    } else {
      expect(email.link).toMatch(/^https:\/\/app\.alfa\.example\/auth\/confirm\?token_hash=abc123&type=/);
      expect(email.html).toContain("https://app.alfa.example/auth/confirm?token_hash=abc123");
      expect(email.text).toContain(email.link as string);
    }
  });

  it("AC-006.1: o remetente cai para o nome da marca quando não há sender_name", () => {
    const email = montarEmailDeAcesso({
      acao: "recovery", marca: CORRETORA, senderName: null, replyTo: null, supportEmail: null,
      baseUrl: "https://app.alfa.example", tokenHash: "h", token: null,
    });
    expect(email.fromName).toBe("Corretora Alfa");
    expect(email.replyTo).toBeUndefined();
  });

  it("AC-006.4: o e-mail de uma marca nunca cita nome, logo ou domínio de outra", () => {
    const email = montarEmailDeAcesso({
      acao: "signup", marca: CORRETORA, senderName: null, replyTo: null, supportEmail: null,
      baseUrl: "https://app.alfa.example", tokenHash: "h", token: null,
    });
    const tudo = `${email.subject}\n${email.html}\n${email.text}`;
    expect(tudo).not.toContain(NUTRI.nome);
    expect(tudo).not.toContain("beta.example");
  });

  it("AC-006.4: o nome vindo da marca é escapado no HTML", () => {
    const email = montarEmailDeAcesso({
      acao: "signup", marca: saida('<b>X</b> "Y"', null), senderName: null, replyTo: null, supportEmail: null,
      baseUrl: "https://app.alfa.example", tokenHash: "h", token: null,
    });
    expect(email.html).not.toContain("<b>X</b>");
    expect(email.html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });

  it("AC-006.4: marca que não é a padrão e não tem app_name usa o NOME DA MARCA, não o da plataforma", async () => {
    marcaDaSaida.mockResolvedValue(CORRETORA);
    const marca: Brand = { ...MARCA_PADRAO_EMBUTIDA, id: "b1", slug: "alfa", name: "Corretora Alfa", is_default: false, app_name: null };
    await marcaDeSaidaDaMarca(marca);
    expect(marcaDaSaida).toHaveBeenCalledWith(null, expect.objectContaining({ app_name: "Corretora Alfa" }));
  });

  it("AC-006.4: a marca padrão sem app_name segue herdando da instalação", async () => {
    marcaDaSaida.mockClear();
    await marcaDeSaidaDaMarca(MARCA_PADRAO_EMBUTIDA);
    expect(marcaDaSaida).toHaveBeenCalledWith(null, expect.objectContaining({ app_name: null }));
  });
});
