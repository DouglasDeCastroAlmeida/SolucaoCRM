import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { razaoDeContraste, PISOS } from "@/lib/branding/contraste";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

afterEach(() => cleanup());

const classes = (el: Element) => el.getAttribute("class") ?? "";

function montar() {
  return render(
    <Table>
      <TableCaption>Legenda</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Ana</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("visual de mensageiro: tabela (#110)", () => {
  it("a tabela fica num quadro de cantos arredondados com borda fina", () => {
    const { container } = montar();
    const quadro = container.firstElementChild as Element;
    expect(classes(quadro)).toContain("rounded-lg");
    expect(classes(quadro)).toContain("border");
    expect(classes(quadro)).toContain("border-border");
    expect(classes(quadro)).toContain("overflow-auto");
  });

  it("o cabeçalho é cinza-claro e as linhas têm divisória fina", () => {
    montar();
    const th = screen.getByRole("columnheader", { name: "Nome" });
    expect(classes(th.closest("thead") as Element)).toContain("bg-muted");
    expect(classes(th)).toContain("text-muted-foreground");
    const linha = screen.getByRole("cell", { name: "Ana" }).closest("tr") as Element;
    expect(classes(linha)).toContain("border-b");
    expect(classes(linha)).toContain("border-border");
  });

  it("mantém a semântica nativa de tabela (API intacta)", () => {
    montar();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Legenda").tagName).toBe("CAPTION");
  });

  it("texto do cabeçalho passa o piso de contraste nos dois temas", () => {
    // text-muted sobre surface-elevated (= --muted); literais de app/globals.css.
    expect(razaoDeContraste("#4f6069", "#f0f2f4")).toBeGreaterThanOrEqual(PISOS.texto);
    expect(razaoDeContraste("#a2b2bb", "#232f37")).toBeGreaterThanOrEqual(PISOS.texto);
  });
});
