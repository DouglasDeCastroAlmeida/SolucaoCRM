/**
 * Visual de mensageiro 15/17 (#97): login, cadastro, recuperação, confirmação,
 * onboarding e início só usam tokens de cor. Paleta crua do Tailwind (amber,
 * emerald...) não acompanha a marca do endereço nem o tema escuro desenhado à
 * parte; o token (`warning`, `success`, `primary`...) sim.
 *
 * Exceção única e justificada: o QR code precisa de fundo claro nos dois temas
 * para ser lido pela câmera, então `bg-white` ao redor dele é permitido.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZES = [
  "app/(public)",
  "app/auth",
  "app/onboarding",
  "app/get-started",
  "components/auth",
];
const PALETA_CRUA =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline)-(?:red|green|amber|yellow|blue|emerald|rose|orange|sky|slate|gray|zinc|neutral|stone|indigo|violet|purple|pink|teal|cyan|lime|white|black)(?:-\d+)?(?:\/\d+)?\b|\bdark:bg-white\b/;
const QR_COM_FUNDO_CLARO = /\bbg-white\b.*\b(?:p-2|object-contain)\b/;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome) ? [caminho] : [];
  });
}

describe("Acesso e onboarding sem cor solta", () => {
  it("nenhuma tela usa paleta crua do Tailwind", () => {
    const culpados = RAIZES.flatMap((r) => arquivos(join(process.cwd(), r))).filter((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .some(
          (linha) =>
            !/^\s*(\/\/|\*|\{\/\*)/.test(linha) &&
            PALETA_CRUA.test(linha) &&
            !QR_COM_FUNDO_CLARO.test(linha),
        ),
    );
    expect(culpados).toEqual([]);
  });
});
