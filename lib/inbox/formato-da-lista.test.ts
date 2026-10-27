import { describe, expect, it } from "vitest";

import { horarioCurtoDaLista, previaDaLista, ultimaFoiNossa } from "./formato-da-lista";

const t = (s: string) => s;
// Quarta-feira, 14:00 em São Paulo (17:00 UTC).
const AGORA = new Date("2026-10-28T17:00:00.000Z");
const SP = "America/Sao_Paulo";

describe("horarioCurtoDaLista", () => {
  it("AC-001.5: hoje mostra a hora no fuso da organização", () => {
    expect(horarioCurtoDaLista("2026-10-28T12:05:00.000Z", AGORA, SP, "pt-BR", t)).toBe("09:05");
  });

  it("AC-001.5: o dia é o do fuso da organização, não o do UTC", () => {
    // 01:30 UTC de quarta ainda é terça à noite em São Paulo: ontem.
    expect(horarioCurtoDaLista("2026-10-28T01:30:00.000Z", AGORA, SP, "pt-BR", t)).toBe("Ontem");
  });

  it("AC-001.5: ontem mostra Ontem (traduzido pelo t)", () => {
    expect(
      horarioCurtoDaLista("2026-10-27T15:00:00.000Z", AGORA, SP, "es", (s) =>
        s === "Ontem" ? "Ayer" : s,
      ),
    ).toBe("Ayer");
  });

  it("AC-001.5: na última semana mostra o dia da semana", () => {
    const r = horarioCurtoDaLista("2026-10-24T15:00:00.000Z", AGORA, SP, "pt-BR", t);
    expect(r.toLowerCase()).toMatch(/^s[áa]b/);
  });

  it("AC-001.5: mais antigo mostra a data, com o ano quando muda", () => {
    expect(horarioCurtoDaLista("2026-10-10T15:00:00.000Z", AGORA, SP, "pt-BR", t)).toBe("10/10");
    expect(horarioCurtoDaLista("2025-12-31T15:00:00.000Z", AGORA, SP, "pt-BR", t)).toBe("31/12/25");
  });

  it("sem data, data inválida ou fuso inválido não quebram", () => {
    expect(horarioCurtoDaLista(null, AGORA, SP, "pt-BR", t)).toBe("");
    expect(horarioCurtoDaLista("lixo", AGORA, SP, "pt-BR", t)).toBe("");
    expect(horarioCurtoDaLista("2026-10-28T12:05:00.000Z", AGORA, "Nao/Existe", "pt-BR", t)).toBe(
      "09:05",
    );
  });
});

describe("ultimaFoiNossa", () => {
  it("AC-001.2: saída igual ou posterior à última atividade é nossa", () => {
    const m = "2026-10-28T12:00:00Z";
    expect(ultimaFoiNossa({ last_outbound_at: m, last_message_at: m })).toBe(true);
    expect(ultimaFoiNossa({ last_outbound_at: "2026-10-28T11:00:00Z", last_message_at: m })).toBe(false);
    expect(ultimaFoiNossa({ last_outbound_at: null, last_message_at: m })).toBe(false);
  });
});

describe("previaDaLista", () => {
  it("AC-001.2: mensagem nossa começa com Você:", () => {
    expect(previaDaLista("oi, tudo bem?", true, t)).toEqual({
      prefixo: "Você:",
      midia: null,
      texto: "oi, tudo bem?",
    });
    expect(previaDaLista("oi", false, t).prefixo).toBe("");
  });

  it("AC-001.3: o rótulo de mídia vira ícone + rótulo", () => {
    expect(previaDaLista("Imagem", false, t)).toMatchObject({ midia: "image", texto: "Imagem" });
    expect(previaDaLista("Áudio", false, t)).toMatchObject({ midia: "audio" });
    expect(previaDaLista("Documento", false, t)).toMatchObject({ midia: "document" });
    expect(previaDaLista("Vídeo", false, t)).toMatchObject({ midia: "video" });
    expect(previaDaLista("Figurinha", false, t)).toMatchObject({ midia: "sticker" });
    expect(previaDaLista("Localização compartilhada", false, t)).toMatchObject({ midia: "location" });
  });

  it("AC-001.3: endereço de arquivo nunca aparece", () => {
    const r = previaDaLista("https://exemplo.test/storage/v1/obj/foto.jpg?token=abc", false, t);
    expect(r).toMatchObject({ midia: "image", texto: "Imagem" });
    expect(r.texto).not.toContain("http");
    expect(previaDaLista("/media/ptt-123.ogg", true, t)).toMatchObject({
      prefixo: "Você:",
      midia: "audio",
    });
  });

  it("texto com link no meio segue como texto; vazio vira Sem mensagens", () => {
    expect(previaDaLista("veja https://exemplo.test/foto.jpg", false, t).midia).toBeNull();
    expect(previaDaLista("  ", false, t).texto).toBe("Sem mensagens");
    expect(previaDaLista(null, false, t).texto).toBe("Sem mensagens");
  });
});
