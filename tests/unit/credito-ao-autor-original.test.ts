// Mudança 008, REQ-004 — o crédito ao autor original é obrigação da licença MIT e não
// depende de o repositório ser público. O sistema não consulta nada: o NOTICE não tem URL.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf8").replace(/\r\n/g, "\n");

const AUTOR_ORIGINAL = "Copyright (c) 2026 Rafael Melgaço";
const DONO = "Copyright (c) 2026 Douglas de Castro Almeida — modificações";

describe("crédito ao autor original (008, REQ-004)", () => {
  it("AC-004.1: LICENSE mantém o copyright original, acrescenta o do dono abaixo e o texto MIT intacto", () => {
    const texto = ler("LICENSE");
    const linhas = texto.split("\n");
    const iOriginal = linhas.indexOf(AUTOR_ORIGINAL);
    const iDono = linhas.indexOf(DONO);
    expect(iOriginal, "linha do autor original").toBeGreaterThanOrEqual(0);
    expect(iDono, "linha do dono").toBeGreaterThan(iOriginal);
    expect(texto.startsWith("MIT License\n")).toBe(true);
    expect(texto).toContain("Permission is hereby granted, free of charge");
    expect(texto).toContain("The above copyright notice and this permission notice shall be included in all");
    expect(texto).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND');
    expect(texto).toContain("OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE");
  });

  it("AC-004.2: NOTICE existe, diz que nasceu de fork do DeskcommCRM sob MIT e não tem URL", () => {
    expect(existsSync(join(RAIZ, "NOTICE"))).toBe(true);
    const texto = ler("NOTICE");
    expect(texto).toMatch(/fork/i);
    expect(texto).toContain("DeskcommCRM");
    expect(texto).toContain("MIT");
    expect(texto).toContain("Rafael Melgaço");
    expect(texto).toContain("Douglas de Castro Almeida");
    expect(texto).not.toMatch(/https?:|github\.com|www\./i);
  });

  const READMES: Array<[string, string]> = [
    ["README.md", "Origem"],
    ["README.en.md", "Origin"],
    ["README.es.md", "Origen"],
  ];

  it.each(READMES)("AC-004.3: %s tem o parágrafo de origem", (arquivo, titulo) => {
    const texto = ler(arquivo);
    const achou = texto.split("\n").some((l) => new RegExp(`^##\\s+\\S*\\s*${titulo}\\s*$`).test(l));
    expect(achou, `título "${titulo}"`).toBe(true);
  });

  it.each(READMES)("AC-004.3: %s não tem comando de instalação que baixe do upstream", (arquivo) => {
    const ruins = ler(arquivo)
      .split("\n")
      .map((linha, i) => ({ linha, n: i + 1 }))
      .filter(({ linha }) => /\b(curl|git clone|wget|docker pull)\b/.test(linha))
      .filter(({ linha }) => /melgarafael|deskcomm\.com\.br/i.test(linha));
    expect(ruins).toEqual([]);
  });
});
