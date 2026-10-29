/**
 * Menu lateral RECOLHIDO (mudança 009, Fatia 2).
 *
 * jsdom não mede pixel; aqui se prova a regra: o nome do destino aparece no
 * hover e no foco, o item atual anuncia a página, o botão de expandir está
 * sempre presente e rotulado, e nenhum destino de `sidebarGroups()` some.
 * `sidebarGroups` entra SEM mock: mockar a projeção provaria a fiação, e não
 * a herança.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const estado = { caminho: "/app/inbox" };

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { is_platform_admin: false, support: null },
    activeOrg: {
      orgId: "org-1",
      role: "admin",
      interface_settings: undefined,
      modulos_ligados: [],
      capacidades_ligadas: [],
    },
  }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("next/navigation", () => ({ usePathname: () => estado.caminho }));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({ toggleSidebar: vi.fn() }));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/components/shell/ContadorDaFila", () => ({ ContadorDaFila: () => null }));
vi.mock("@/components/shell/ContadorDeCasos", () => ({ ContadorDeCasos: () => null }));
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

import { sidebarGroups } from "@/lib/navigation/registry";
import { SidebarContent } from "./Sidebar";

function montar(collapsed = true) {
  return render(<SidebarContent collapsed={collapsed} />);
}

function destinosEsperados() {
  const grupos = sidebarGroups(false, "admin", undefined, [], []);
  const rotulos: string[] = [];
  for (const { group, items } of grupos) {
    for (const i of items) rotulos.push(i.label);
    if (group.hub) rotulos.push(group.hub.label);
  }
  return rotulos;
}

describe("menu recolhido", () => {
  it("AC-001.2: o nome do destino aparece ao focar o ícone por teclado", async () => {
    montar();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const link = within(nav).getAllByRole("link")[0] as HTMLElement;
    const nome = link.getAttribute("aria-label");
    expect(nome).toBeTruthy();
    fireEvent.focus(link);
    const dica = await screen.findByRole("tooltip");
    expect(dica.textContent).toContain(nome);
  });

  it("AC-001.2: o nome do destino aparece ao passar o mouse", async () => {
    montar();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const link = within(nav).getAllByRole("link")[1] as HTMLElement;
    const nome = link.getAttribute("aria-label");
    fireEvent.pointerMove(link);
    const dica = await screen.findByRole("tooltip");
    expect(dica.textContent).toContain(nome);
  });

  it("AC-001.6: o item da tela atual anuncia a página; os outros não", () => {
    estado.caminho = "/app/inbox";
    montar();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const atuais = within(nav)
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(atuais).toHaveLength(1);
    expect(atuais[0]?.getAttribute("href")).toBe("/app/inbox");
  });

  it("AC-001.5: o recolhido renderiza todos os destinos de sidebarGroups(), com nome acessível", () => {
    estado.caminho = "/app/inbox";
    // Container inteiro: Configurações mora no rodapé, fora do <nav>.
    const { container } = montar();
    const nomes = within(container)
      .getAllByRole("link")
      .map((l) => l.getAttribute("aria-label"));
    const esperados = destinosEsperados();
    expect(esperados.length).toBeGreaterThan(10);
    const faltando = esperados.filter((r) => !nomes.includes(r));
    expect(faltando).toEqual([]);
  });

  it("AC-001.5: o botão de expandir está sempre visível e rotulado", () => {
    montar();
    const botao = screen.getByRole("button", { name: "Expandir sidebar" });
    expect(botao).toBeTruthy();
    expect(botao.className).not.toMatch(/\b(hidden|sr-only|opacity-0)\b/);
  });
});
