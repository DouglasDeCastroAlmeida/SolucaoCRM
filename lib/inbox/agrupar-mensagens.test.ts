/**
 * Agrupamento das mensagens do fio e separador de dia (REQ-002).
 * O relogio e o fuso entram por parametro: nada aqui le o relogio do navegador.
 */
import { describe, expect, it } from "vitest";

import { chaveDoDia, horaNoFuso, marcarGrupos, rotuloDoDia } from "./agrupar-mensagens";

const t = (texto: string) => texto;
const SP = "America/Sao_Paulo";

describe("marcarGrupos", () => {
  it("AC-002.1: seguidas do mesmo lado em menos de 2 minutos se agrupam; a cauda fica so na ultima", () => {
    const r = marcarGrupos([
      { lado: "out", ts: "2026-10-27T12:00:00Z" },
      { lado: "out", ts: "2026-10-27T12:00:30Z" },
      { lado: "out", ts: "2026-10-27T12:01:50Z" },
    ]);
    expect(r.map((x) => x.comCauda)).toEqual([false, false, true]);
    expect(r.map((x) => x.colada)).toEqual([false, true, true]);
  });

  it("AC-002.1: 2 minutos ou mais, ou lado diferente, quebram o grupo", () => {
    const r = marcarGrupos([
      { lado: "out", ts: "2026-10-27T12:00:00Z" },
      { lado: "out", ts: "2026-10-27T12:02:00Z" },
      { lado: "in", ts: "2026-10-27T12:02:10Z" },
    ]);
    expect(r.map((x) => x.comCauda)).toEqual([true, true, true]);
    expect(r.map((x) => x.colada)).toEqual([false, false, false]);
  });

  it("AC-002.1: item que nao e mensagem (lado nulo) quebra o grupo", () => {
    const r = marcarGrupos([
      { lado: "in", ts: "2026-10-27T12:00:00Z" },
      { lado: null, ts: "2026-10-27T12:00:10Z" },
      { lado: "in", ts: "2026-10-27T12:00:20Z" },
    ]);
    expect(r.map((x) => x.comCauda)).toEqual([true, true, true]);
    expect(r[1]).toEqual({ comCauda: true, colada: false });
  });

  it("lista vazia nao quebra", () => {
    expect(marcarGrupos([])).toEqual([]);
  });
});

describe("separador de dia", () => {
  const agora = new Date("2026-10-27T15:00:00Z");

  it("AC-002.2: Hoje, Ontem e a data, contados no fuso da organizacao", () => {
    expect(rotuloDoDia("2026-10-27T13:00:00Z", agora, SP, t)).toBe("Hoje");
    expect(rotuloDoDia("2026-10-26T20:00:00Z", agora, SP, t)).toBe("Ontem");
    expect(rotuloDoDia("2026-10-20T15:00:00Z", agora, SP, t)).toBe("20/10/2026");
  });

  it("AC-002.2: 02:00Z ainda e o dia anterior em Sao Paulo", () => {
    expect(chaveDoDia("2026-10-27T02:00:00Z", SP)).toBe("2026-10-26");
    expect(chaveDoDia("2026-10-27T02:00:00Z", "UTC")).toBe("2026-10-27");
    expect(rotuloDoDia("2026-10-27T02:00:00Z", agora, SP, t)).toBe("Ontem");
  });

  it("fuso ausente ou invalido nao quebra", () => {
    expect(rotuloDoDia("2026-10-27T13:00:00Z", agora, undefined, t)).toBeTruthy();
    expect(rotuloDoDia("2026-10-27T13:00:00Z", agora, "Lugar/Nenhum", t)).toBeTruthy();
  });
});

describe("horaNoFuso", () => {
  it("AC-002.5: hora curta no fuso da organizacao", () => {
    expect(horaNoFuso("2026-10-27T15:05:00Z", SP)).toBe("12:05");
    expect(horaNoFuso("2026-10-27T15:05:00Z", "UTC")).toBe("15:05");
  });
});
