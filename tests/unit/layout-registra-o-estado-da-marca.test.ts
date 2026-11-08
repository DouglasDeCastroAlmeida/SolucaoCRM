import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const registrar = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/branding/instalacao", async (original) => ({
  ...(await original<typeof import("@/lib/branding/instalacao")>()),
  registrarEstadoDaMarca: (...args: unknown[]) => registrar(...args),
}));

import { registrarEstadoDaMarcaResolvida } from "@/lib/branding/estado-da-marca";
import type { MarcaResolvida } from "@/lib/branding/resolve";
import type { LinhaDaMarca } from "@/lib/branding/instalacao";

const linha = { id: 1, fallback_at: null, fallback_reason: null } as unknown as LinhaDaMarca;

function marca(motivos: unknown[]): MarcaResolvida {
  return { cor: null, motivos } as unknown as MarcaResolvida;
}

describe("estado da marca (diagnóstico de /admin/marca) sem CSS de cor", () => {
  it("grava null quando nada foi recusado", () => {
    registrar.mockClear();
    registrarEstadoDaMarcaResolvida(linha, marca([]));
    expect(registrar).toHaveBeenCalledWith(linha, null);
  });

  it("grava o motivo da instalação e ignora o da camada de marca", () => {
    registrar.mockClear();
    registrarEstadoDaMarcaResolvida(
      linha,
      marca([
        { codigo: "envelope_malformado", origem: "instalacao", alvo: "claro" },
        { codigo: "envelope_malformado", origem: "marca", alvo: "escuro" },
      ]),
    );
    const motivo = registrar.mock.calls[0]?.[1] as string | null;
    expect(motivo).toContain("envelope_malformado@claro");
    expect(motivo).not.toContain("escuro");
  });

  it("o layout raiz chama esse registro e continua sem injetar <style> de cor", () => {
    const fonte = readFileSync("app/layout.tsx", "utf8");
    expect(fonte).toContain("registrarEstadoDaMarcaResolvida(");
    expect(fonte).not.toContain('id="marca-instalacao"');
  });
});
