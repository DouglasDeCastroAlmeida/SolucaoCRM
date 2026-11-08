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
import { fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/components/shell/ContadorDaFila", () => ({ ContadorDaFila: () => null }));
vi.mock("@/components/shell/ContadorDeCasos", () => ({ ContadorDeCasos: () => null }));
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

import { FaixaDeIcones } from "@/components/shell/FaixaDeIcones";
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

function hrefsRenderizados(): Set<string> {
  const { container, unmount } = render(<SidebarContent />);
  const hrefs = new Set(
    [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") as string),
  );
  unmount();
  return hrefs;
}

/**
 * Visual de mensageiro (#87): o menu do desktop é a FAIXA de ícones. O que não
 * cabe nela está atrás do ícone «mais», que abre a gaveta com a navegação
 * completa. Os hrefs contam faixa + gaveta aberta, exatamente como a pessoa os
 * alcança com dois cliques.
 */
function hrefsDaFaixaComMais(): Set<string> {
  const { unmount } = render(<FaixaDeIcones />);
  fireEvent.click(screen.getByRole("button", { name: "Mais" }));
  const hrefs = new Set(
    [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") as string),
  );
  unmount();
  return hrefs;
}

describe("faixa de ícones + «mais»: nenhuma rota do menu atual some (#87)", () => {
  const todos = searchable(...ADMIN_DE_PLATAFORMA);

  it("todo ícone e todo \"Ver tudo\" de sidebarGroups() é alcançável pela faixa ou pelo «mais»", () => {
    const links = hrefsDaFaixaComMais();
    const esperados = sidebarGroups(...ADMIN_DE_PLATAFORMA).flatMap(({ group, items }) => [
      ...items.map((i) => i.href),
      ...(group.hub ? [group.hub.href] : []),
    ]);
    expect(esperados.length).toBeGreaterThan(10);
    expect(esperados.filter((h) => !links.has(h))).toEqual([]);
  });

  it("nenhum destino do catálogo fica sem porta (faixa, «mais», \"Ver tudo\" ou ⌘K registrado)", () => {
    const links = hrefsDaFaixaComMais();
    const porHub = new Set<string>();
    for (const { group } of sidebarGroups(...ADMIN_DE_PLATAFORMA)) {
      if (!group.hub || !links.has(group.hub.href)) continue;
      for (const s of hubSections(group.id, ...ADMIN_DE_PLATAFORMA)) {
        for (const d of s.items) porHub.add(d.href);
      }
    }
    const semPorta = todos
      .map((d) => d.href)
      .filter((h) => !links.has(h) && !porHub.has(h) && !(h in SO_NA_PALETA));
    expect(semPorta).toEqual([]);
  });

  it("a faixa leva os principais e o «mais» leva o resto: a faixa sozinha não é o inventário", () => {
    const { container, unmount } = render(<FaixaDeIcones />);
    const soFaixa = new Set(
      [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") as string),
    );
    unmount();
    expect(soFaixa.size).toBeLessThan(10);
    expect(hrefsDaFaixaComMais().size).toBeGreaterThan(soFaixa.size + 10);
  });
});

describe("todo destino do catálogo é alcançável pelo menu desenhado", () => {
  const todos = searchable(...ADMIN_DE_PLATAFORMA);

  it("AC-006.3: o universo medido não é vazio — senão o resto não prova nada", () => {
    expect(todos.length).toBeGreaterThan(20);
  });

  it("AC-006.3: todo destino só-na-paleta está de fato no ⌘K e não tem outra porta no menu", () => {
    const naPaleta = new Set(todos.map((d) => d.href));
    const links = hrefsRenderizados();
    for (const [href, motivo] of Object.entries(SO_NA_PALETA)) {
      expect(motivo.trim().length).toBeGreaterThan(20);
      expect(naPaleta.has(href), `${href} saiu do ⌘K`).toBe(true);
      expect(links.has(href), `${href} já tem ícone: tire da lista`).toBe(false);
    }
  });

  {
    const quem = "gaveta do celular";
    it(`AC-006.3: no ${quem}, nenhum destino fica sem porta (ícone, "Ver tudo" ou ⌘K)`, () => {
      const links = hrefsRenderizados();
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
      const links = hrefsRenderizados();
      const esperados = sidebarGroups(...ADMIN_DE_PLATAFORMA).flatMap(({ group, items }) => [
        ...items.map((i) => i.href),
        ...(group.hub ? [group.hub.href] : []),
      ]);
      expect(esperados.length).toBeGreaterThan(10);
      expect(esperados.filter((h) => !links.has(h))).toEqual([]);
    });
  }
});
