/**
 * Cerca de navegação, parte 2 (mudança 009, AC-006.3 e AC-001.5).
 *
 * `navegacao-completude.test.ts` prova que toda TELA tem porta no catálogo. Aqui
 * se prova o passo seguinte: que toda PORTA do catálogo é alcançável pelo menu
 * como ele é DESENHADO — recolhido (64px, só ícones) e na gaveta do celular —
 * por ícone, pelo "Ver tudo" do grupo ou pela paleta ⌘K. Destino de grupo sem
 * hub que não sobe ao menu seria uma tela que o menu estreito esconde.
 *
 * Nada é mockado da projeção: `sidebarGroups`, `hubSections` e `searchable`
 * entram de verdade.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { is_platform_admin: true, support: null },
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

import { SidebarContent } from "@/components/shell/Sidebar";
import { hubSections, searchable, sidebarGroups } from "@/lib/navigation/registry";

/**
 * Destinos que, POR DECISÃO REGISTRADA, só têm o ⌘K como porta (AC-001.5 aceita
 * a paleta como porta). Entrada nova exige o porquê; entrada que o menu já
 * alcança por outro caminho reprova (a lista só encolhe).
 */
const SO_NA_PALETA: Record<string, string> = {
  "/app/integrations/nuvemshop":
    "decisão do dono do produto: integração não usada nesta instalação, tirada do menu lateral; segue no ⌘K (ver comentário em catalogo.ts)",
};

const ADMIN_DE_PLATAFORMA = [true, "admin", undefined, [], []] as const;

function hrefsRenderizados(collapsed: boolean): Set<string> {
  const { container, unmount } = render(<SidebarContent collapsed={collapsed} />);
  const hrefs = new Set(
    [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") as string),
  );
  unmount();
  return hrefs;
}

describe("todo destino do catálogo é alcançável pelo menu desenhado", () => {
  const todos = searchable(...ADMIN_DE_PLATAFORMA);

  it("AC-006.3: o universo medido não é vazio — senão o resto não prova nada", () => {
    expect(todos.length).toBeGreaterThan(20);
  });

  it("AC-006.3: todo destino só-na-paleta está de fato no ⌘K e não tem outra porta no menu", () => {
    const naPaleta = new Set(todos.map((d) => d.href));
    const links = hrefsRenderizados(true);
    for (const [href, motivo] of Object.entries(SO_NA_PALETA)) {
      expect(motivo.trim().length).toBeGreaterThan(20);
      expect(naPaleta.has(href), `${href} saiu do ⌘K`).toBe(true);
      expect(links.has(href), `${href} já tem ícone: tire da lista`).toBe(false);
    }
  });

  for (const recolhido of [true, false]) {
    const quem = recolhido ? "menu recolhido" : "gaveta do celular";
    it(`AC-006.3: no ${quem}, nenhum destino fica sem porta (ícone, "Ver tudo" ou ⌘K)`, () => {
      const links = hrefsRenderizados(recolhido);
      const porHub = new Set<string>();
      for (const { group } of sidebarGroups(...ADMIN_DE_PLATAFORMA)) {
        if (!group.hub || !links.has(group.hub.href)) continue;
        for (const s of hubSections(group.id, ...ADMIN_DE_PLATAFORMA)) {
          for (const d of s.items) porHub.add(d.href);
        }
      }
      // O ⌘K lista `searchable()`, que é o próprio universo: a porta de último
      // recurso existe sempre. A cerca exige MAIS: que o menu em si (ícone ou hub)
      // alcance o destino, para o usuário não depender de saber que a paleta existe.
      const semPortaNoMenu = todos
        .map((d) => d.href)
        .filter((h) => !links.has(h) && !porHub.has(h) && !(h in SO_NA_PALETA));
      expect(
        semPortaNoMenu,
        `Destino sem ícone nem "Ver tudo" no ${quem}:\n  ${semPortaNoMenu.join("\n  ")}\n` +
          `Suba o destino ao menu ou crie o hub do grupo em lib/navigation/catalogo.ts.`,
      ).toEqual([]);
    });

    it(`AC-001.5: o ${quem} renderiza todo ícone e todo "Ver tudo" de sidebarGroups()`, () => {
      const links = hrefsRenderizados(recolhido);
      const esperados = sidebarGroups(...ADMIN_DE_PLATAFORMA).flatMap(({ group, items }) => [
        ...items.map((i) => i.href),
        ...(group.hub ? [group.hub.href] : []),
      ]);
      expect(esperados.length).toBeGreaterThan(10);
      expect(esperados.filter((h) => !links.has(h))).toEqual([]);
    });
  }
});
