import { describe, expect, it } from "vitest";

import { lerCorpoLimitado } from "./corpo-limitado";

function stream(partes: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const p of partes) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

describe("lerCorpoLimitado", () => {
  it("S1: corpo dentro do limite é lido inteiro", async () => {
    expect(await lerCorpoLimitado(stream(["ab", "cd"]), 10)).toBe("abcd");
  });

  it("S1: corpo sem content-length que passa do limite é abortado (null)", async () => {
    expect(await lerCorpoLimitado(stream(["aaaaaa", "bbbbbb"]), 10)).toBeNull();
  });

  it("S1: corpo ausente é string vazia", async () => {
    expect(await lerCorpoLimitado(null, 10)).toBe("");
  });

  it("S1: conta bytes, não caracteres", async () => {
    expect(await lerCorpoLimitado(stream(["ééééé", "é"]), 10)).toBeNull();
  });
});
