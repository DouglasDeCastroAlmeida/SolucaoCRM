/**
 * Mudança 009, Fatia 3 (REQ-002): barra de baixo e gaveta "Mais".
 *
 * jsdom não mede pixel (isso é da jornada em `tests/journeys/celular-390.spec.ts`);
 * aqui se prova a regra. `sidebarGroups` e a gaveta entram SEM mock: mockar a
 * projeção provaria a fiação, e não que nenhum destino some.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("next/navigation", () => ({ usePathname: () => "/app/inbox" }));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({ toggleSidebar: vi.fn() }));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/components/shell/ContadorDaFila", () => ({ ContadorDaFila: () => null }));
vi.mock("@/components/shell/ContadorDeCasos", () => ({ ContadorDeCasos: () => null }));
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

import { sidebarGroups } from "@/lib/navigation/registry";
import { BarraInferior } from "./BarraInferior";

describe("barra de baixo e gaveta Mais", () => {
  it("AC-002.1: a barra mostra de 4 a 5 destinos principais e um item Mais", () => {
    render(<BarraInferior />);
    const barra = screen.getByRole("navigation", { name: "Navegação rápida" });
    const links = within(barra).getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(links.length).toBeLessThanOrEqual(5);
    expect(within(barra).getByRole("button", { name: "Mais" })).toBeTruthy();
    // Barra fixa embaixo, só em tela estreita.
    expect(barra.className).toContain("fixed");
    expect(barra.className).toContain("md:hidden");
  });

  it("AC-002.2: o Mais abre a gaveta com todos os destinos do catálogo, agrupados, sem nenhum a menos", () => {
    render(<BarraInferior />);
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const gaveta = screen.getByRole("dialog");
    const hrefs = new Set(
      within(gaveta)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    );
    const grupos = sidebarGroups(false, "admin", undefined, [], []);
    expect(grupos.length).toBeGreaterThan(1);
    const faltando: string[] = [];
    for (const { items } of grupos) {
      for (const d of items) if (!hrefs.has(d.href)) faltando.push(d.href);
    }
    expect(faltando).toEqual([]);
  });
});
