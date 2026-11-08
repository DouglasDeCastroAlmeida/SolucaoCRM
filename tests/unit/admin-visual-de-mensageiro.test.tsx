/**
 * #96 (épico #82): a casca do Admin segue o padrão da faixa de ícones do app
 * (#87): fundo cinza-claro (`surface-elevated`), borda `border-border`, item
 * ativo como pílula branca (`surface`) com sombra leve e destaque que NÃO é a
 * cor de marca chapada. Só apresentação: os links, rótulos e a navegação
 * seguem os mesmos (ver `admin-cobranca-porta` e `admin-navegacao-completude`).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/tenants/abc" }));

import { AdminSidebar } from "@/components/admin/AdminSidebar";

afterEach(cleanup);

describe("menu do Admin no visual de mensageiro", () => {
  it("a coluna usa fundo cinza-claro e borda de token, sem card branco", () => {
    const { container } = render(<AdminSidebar userEmail="dono@x.test" />);
    const aside = container.querySelector("aside")!;
    expect(aside.className).toContain("bg-surface-elevated");
    expect(aside.className).toContain("border-border");
    expect(aside.className).not.toContain("bg-card");
  });

  it("o item ativo é a pílula branca com sombra, e só ele tem aria-current", () => {
    render(<AdminSidebar userEmail="dono@x.test" />);
    const ativo = screen.getByRole("link", { name: "Tenants" });
    expect(ativo.getAttribute("aria-current")).toBe("page");
    expect(ativo.className).toContain("bg-surface");
    expect(ativo.className).toContain("shadow-sm");
    expect(ativo.className).toContain("rounded-full");
    expect(ativo.className).not.toContain("bg-accent");
    const outro = screen.getByRole("link", { name: "Usage" });
    expect(outro.getAttribute("aria-current")).toBeNull();
    expect(outro.className).toContain("hover:bg-surface/70");
  });
});
