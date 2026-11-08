/**
 * Visual de mensageiro 5/17 (#87): a barra lateral vira uma FAIXA estreita de
 * ícones, com o "mais" abrindo o hub de navegação existente.
 *
 * Seams (confirmados pelo texto da issue): a faixa desenhada (links, nomes,
 * "mais") e a união faixa + "mais" contra `sidebarGroups()` / `searchable()`.
 * jsdom não mede pixel; a largura é provada pela classe que a produz.
 * A projeção do registro entra SEM mock: mockar provaria a fiação, não a herança.
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
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/components/shell/ContadorDaFila", () => ({ ContadorDaFila: () => null }));
vi.mock("@/components/shell/ContadorDeCasos", () => ({ ContadorDeCasos: () => null }));
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

import { hubSections, searchable, sidebarGroups } from "@/lib/navigation/registry";
import { FaixaDeIcones, ITENS_DA_FAIXA } from "./FaixaDeIcones";

const ADMIN = [false, "admin", undefined, [], []] as const;

function montar() {
  return render(<FaixaDeIcones />);
}

describe("faixa de ícones", () => {
  it("é uma faixa estreita (64px), grudada e que ocupa lugar na linha", () => {
    const { container } = montar();
    const faixa = container.querySelector("aside") as HTMLElement;
    const classes = faixa.className.split(/\s+/);
    expect(classes).toContain("w-16");
    expect(classes).toContain("sticky");
    expect(classes).toContain("h-dvh");
    expect(classes).toContain("shrink-0");
    expect(classes).not.toContain("fixed");
  });

  it("mostra Inbox, Contatos, Funis, Agenda e Configurações, cada um com nome acessível", () => {
    // Configurações mora no rodapé da faixa, fora do <nav> que rola.
    const { container } = montar();
    const nomes = within(container)
      .getAllByRole("link")
      .map((l) => l.getAttribute("aria-label"));
    for (const nome of ["Inbox", "Contatos", "Funis", "Agenda", "Configurações"]) {
      expect(nomes, nome).toContain(nome);
    }
  });

  it("só põe na faixa os destinos principais, na ordem declarada, e nada de rótulo escrito", () => {
    montar();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"));
    expect(hrefs.slice(0, ITENS_DA_FAIXA.length)).toEqual([...ITENS_DA_FAIXA]);
    // Faixa estreita: o texto vive no balão (tooltip) e no aria-label.
    expect(within(nav).queryByText("Contatos")).toBeNull();
  });

  it("o nome aparece ao passar o mouse e ao focar por teclado", async () => {
    montar();
    const link = screen.getByRole("link", { name: "Contatos" });
    fireEvent.focus(link);
    expect((await screen.findByRole("tooltip")).textContent).toContain("Contatos");
  });

  it("a tela atual anuncia a página; os outros não", () => {
    estado.caminho = "/app/contacts";
    montar();
    const atuais = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(atuais).toHaveLength(1);
    expect(atuais[0]?.getAttribute("href")).toBe("/app/contacts");
    estado.caminho = "/app/inbox";
  });

  it("o ícone «mais» existe, tem nome e abre o hub com a navegação completa", () => {
    montar();
    const mais = screen.getByRole("button", { name: "Mais" });
    fireEvent.click(mais);
    const gaveta = screen.getByRole("dialog");
    const hrefs = new Set(
      within(gaveta)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    );
    for (const { group, items } of sidebarGroups(...ADMIN)) {
      for (const d of items) expect(hrefs.has(d.href), d.href).toBe(true);
      if (group.hub) expect(hrefs.has(group.hub.href), group.hub.href).toBe(true);
    }
  });

  it("NENHUMA rota some: faixa + «mais» + «Ver tudo» alcançam todo destino do catálogo", () => {
    const { container } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    const links = new Set(
      [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") as string),
    );
    expect(container).toBeTruthy();
    const porHub = new Set<string>();
    for (const { group } of sidebarGroups(...ADMIN)) {
      if (!group.hub || !links.has(group.hub.href)) continue;
      for (const s of hubSections(group.id, ...ADMIN)) for (const d of s.items) porHub.add(d.href);
    }
    const sem = searchable(...ADMIN)
      .map((d) => d.href)
      .filter((h) => !links.has(h) && !porHub.has(h));
    // O ⌘K é a porta de último recurso dos que a regra do catálogo já deixa só nele.
    expect(sem.filter((h) => h !== "/app/integrations/nuvemshop")).toEqual([]);
  });
});
