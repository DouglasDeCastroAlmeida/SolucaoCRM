import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Button } from "./button";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Card } from "./card";
import { Switch } from "./switch";
import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./dialog";
import { Skeleton } from "./skeleton";

afterEach(() => cleanup());

const classes = (el: Element) => el.getAttribute("class") ?? "";

/** Só tokens: nenhuma cor crua (hex ou paleta do Tailwind) nos componentes básicos. */
const ARQUIVOS = [
  "button", "input", "textarea", "card", "switch", "tabs", "dialog",
  "alert-dialog", "select", "sonner", "skeleton", "badge", "dropdown-menu",
];
const CRUA =
  /#[0-9a-fA-F]{3,8}\b|\b(?:bg|text|border|ring|from|to)-(?:red|green|blue|gray|slate|zinc|neutral|stone|yellow|amber|emerald|white|black)\b/;

describe("visual de mensageiro: componentes básicos (#86)", () => {
  it("botões são em pílula e usam a cor de destaque da marca", () => {
    render(<Button>Salvar</Button>);
    const c = classes(screen.getByRole("button"));
    expect(c).toContain("rounded-full");
    expect(c).toContain("bg-accent");
  });

  it("botão tem foco visível por teclado", () => {
    render(<Button>Salvar</Button>);
    expect(classes(screen.getByRole("button"))).toContain("focus-visible:ring-2");
  });

  it("campos de texto são arredondados e destacam o foco com a cor da marca", () => {
    render(
      <>
        <Input aria-label="a" />
        <Textarea aria-label="b" />
      </>,
    );
    for (const el of [screen.getByLabelText("a"), screen.getByLabelText("b")]) {
      const c = classes(el);
      expect(c).toContain("rounded-lg");
      expect(c).toContain("focus-visible:ring-2");
      expect(c).toContain("focus-visible:border-accent");
    }
  });

  it("cartão tem canto grande e sem sombra pesada", () => {
    render(<Card data-testid="c" />);
    const c = classes(screen.getByTestId("c"));
    expect(c).toContain("rounded-xl");
    expect(c).not.toMatch(/shadow-(md|lg|xl)/);
  });

  it("chave usa a cor de destaque quando ligada e tem foco visível", () => {
    render(<Switch aria-label="s" />);
    const c = classes(screen.getByRole("switch"));
    expect(c).toContain("data-[state=checked]:bg-accent");
    expect(c).toContain("focus-visible:ring-2");
  });

  it("abas: lista transparente, aba ativa sublinhada na cor de destaque", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList data-testid="l">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(classes(screen.getByTestId("l"))).toContain("bg-transparent");
    const t = classes(screen.getByRole("tab"));
    expect(t).toContain("data-[state=active]:border-accent");
    expect(t).toContain("focus-visible:ring-2");
  });

  it("diálogo tem canto grande e botão de fechar redondo com foco visível", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>t</DialogTitle>
          <DialogDescription>d</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(classes(screen.getByRole("dialog"))).toContain("sm:rounded-2xl");
    const fechar = screen.getByRole("button", { name: /fechar|close/i });
    expect(classes(fechar)).toContain("focus-visible:ring-2");
    expect(classes(fechar)).toContain("rounded-full");
  });

  it("carregamento (esqueleto) tem cantos arredondados", () => {
    render(<Skeleton data-testid="k" />);
    expect(classes(screen.getByTestId("k"))).toMatch(/rounded-(lg|full)/);
  });

  it.each(ARQUIVOS)("%s não usa cor crua, só tokens", (nome) => {
    const fonte = readFileSync(join(__dirname, `${nome}.tsx`), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(fonte).not.toMatch(CRUA);
  });
});

describe("avisos, estados vazios e contraste (#86)", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
  const bloco = (abre: string) => {
    const i = css.indexOf(abre);
    return css.slice(i, css.indexOf("\n}", i));
  };
  const cor = (b: string, nome: string) =>
    new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})`).exec(b)?.[1] ?? "";

  it("avisos (toasts) têm canto grande e ação na cor de destaque", () => {
    const fonte = readFileSync(join(__dirname, "sonner.tsx"), "utf8");
    expect(fonte).toContain("rounded-xl");
    expect(fonte).toContain("group-[.toast]:bg-accent");
  });

  it("estado vazio usa ícone centrado na cor de destaque", () => {
    const fonte = readFileSync(join(__dirname, "../empty/EmptyState.tsx"), "utf8");
    expect(fonte).toContain("bg-accent-soft text-accent");
    expect(fonte).toContain("items-center justify-center");
  });

  it.each([
    ["claro", ":root {"],
    ["light", '[data-theme="light"] {'],
    ["escuro", '[data-theme="dark"] {'],
  ])("texto sobre botão destrutivo passa de 4,5:1 (%s)", async (_n, abre) => {
    const { razaoDeContraste, PISOS } = await import("@/lib/branding/contraste");
    const b = bloco(abre);
    const fundo = cor(b, "color-error");
    const frente = cor(b, "color-on-error");
    expect(fundo).not.toBe("");
    expect(frente).not.toBe("");
    expect(razaoDeContraste(frente, fundo)).toBeGreaterThanOrEqual(PISOS.texto);
  });
});
