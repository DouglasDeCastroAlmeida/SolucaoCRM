import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { traduzir } from "@/lib/i18n/dicionario";

const ORIENTACAO = "Isso costuma levar alguns minutos. Se passar de 1 hora, fale com o suporte.";

describe("hub: orientação da confirmação do pagamento", () => {
  it("AC-002.5: pt-BR, en e es saem do dicionário", () => {
    expect(traduzir(ORIENTACAO, "pt-BR")).toBe(ORIENTACAO);
    expect(traduzir(ORIENTACAO, "es")).toBe("Esto suele tardar unos minutos. Si pasa de 1 hora, habla con soporte.");
    const en = JSON.parse(readFileSync("lib/i18n/traducoes/en.json", "utf8")) as Record<string, string>;
    expect(en[ORIENTACAO]).toBe("This usually takes a few minutes. If it takes more than 1 hour, contact support.");
  });

  it("AC-002.5: a página não grava marca no texto novo", () => {
    const fonte = readFileSync("app/account-suspended/page.tsx", "utf8");
    const linha = fonte.split("\n").find((l) => l.includes("Isso costuma levar")) ?? "";
    expect(linha).not.toBe("");
    expect(linha).not.toMatch(/Deskcomm|DeskcommCRM/i);
  });
});
