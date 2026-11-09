/**
 * #123: o avatar da lista de conversas mostra um círculo cinza neutro distinto do
 * fundo da lista (como no mensageiro), nos dois temas e na linha selecionada.
 * O fundo das iniciais era `surface-elevated`, quase igual ao fundo da lista no claro.
 *
 * Os valores são literais da decisão (token próprio `--color-avatar`, hex nunca do
 * app de mensagens); o contraste usa a mesma régua da marca.
 */
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import { conversaDeExemplo } from "@/components/inbox/__fixtures__/conversa";
import { razaoDeContraste } from "@/lib/branding/contraste";

const css = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
function bloco(seletor: string): string {
  const i = css.indexOf(`\n${seletor} {`);
  expect(i, `bloco ${seletor} ausente`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("\n}", i));
}
function token(corpo: string, nome: string): string {
  const m = new RegExp(`${nome}:\\s*([^;]+);`).exec(corpo)?.[1]?.trim();
  expect(m, nome).toBeTruthy();
  return m!;
}

const TEMAS = [
  { nome: "claro", seletor: ":root", avatar: "#d1d8dc", texto: "#17222b" },
  { nome: "claro (data-theme)", seletor: '[data-theme="light"]', avatar: "#d1d8dc", texto: "#17222b" },
  { nome: "escuro", seletor: '[data-theme="dark"]', avatar: "#44545d", texto: "#e7ecef" },
] as const;

describe("avatar da lista de conversas", () => {
  for (const t of TEMAS) {
    it(`tema ${t.nome}: círculo distinto do fundo e do selecionado, texto >= 4,5:1`, () => {
      const corpo = bloco(t.seletor);
      const avatar = token(corpo, "--color-avatar");
      expect(avatar).toBe(t.avatar);
      const texto = token(corpo, "--color-avatar-fg");
      expect(texto).toBe(t.texto);
      expect(razaoDeContraste(texto, avatar), "texto sobre avatar").toBeGreaterThanOrEqual(4.5);
      for (const fundo of ["--color-surface", "--color-selected"]) {
        expect(razaoDeContraste(avatar, token(corpo, fundo)), `avatar sobre ${fundo}`).toBeGreaterThanOrEqual(1.25);
      }
    });
  }

  it("cabeçalho e painel do contato usam o mesmo círculo, sem bg-muted", () => {
    for (const f of ["components/inbox/ConversationHeader.tsx", "components/inbox/CRMSidePanel.tsx"]) {
      const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      const m = /(?:avatar-da-conversa|avatar-do-painel)[\s\S]{0,300}?className="([^"]+)"/.exec(src);
      expect(m, f).not.toBeNull();
      expect(m![1], f).toContain("bg-avatar");
      expect(m![1], f).toContain("text-avatar-fg");
      expect(m![1], f).not.toContain("bg-muted");
    }
  });

  it("as ações do painel têm a mesma forma: 'Marcar compromisso' não é um link sublinhado solto", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components/inbox/CRMSidePanel.tsx"), "utf8");
    const linha = src.split("\n").find((l) => l.includes('t("Marcar compromisso")'));
    expect(linha).toBeTruthy();
    expect(linha).not.toContain('className="underline"');
    expect(src).toMatch(/<Button asChild size="sm" variant="outline"[^>]*>\s*<Link[^>]*agenda\?contato/);
  });

  it("o fallback usa o token do círculo, não surface-elevated", () => {
    const { container } = render(
      <ConversationListItem {...conversaDeExemplo.props} conversation={conversaDeExemplo.conversation} isSelected />,
    );
    const iniciais = container.querySelector('[class*="bg-avatar"]');
    expect(iniciais, "AvatarFallback com bg-avatar").not.toBeNull();
    expect(iniciais!.className).toContain("text-avatar-fg");
    expect(iniciais!.className).not.toContain("bg-surface-elevated");
  });
});
