/**
 * Visual de mensageiro 11/17 (#93): Configurações em duas colunas, lista de
 * seções à esquerda e detalhe à direita; no celular, uma tela por vez.
 *
 * Seam: o componente desenhado, contra `hubSections("organizacao", ...)` sem
 * mock (a lista é a MESMA do hub: nenhuma seção some, nenhuma rota muda).
 * jsdom não mede pixel; "uma por vez" é provado pelo que fica visível ao
 * celular (a classe `hidden` sem `md:`) e o lado a lado, pelo que aparece no md.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const estado = { caminho: "/app/settings" };

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

import { hubSections } from "@/lib/navigation/registry";
import { ConfiguracoesEmDuasColunas } from "./ConfiguracoesEmDuasColunas";

function montar() {
  return render(
    <ConfiguracoesEmDuasColunas>
      <p>detalhe da seção</p>
    </ConfiguracoesEmDuasColunas>,
  );
}

function esperadas() {
  return hubSections("organizacao", false, "admin", undefined, [], []).flatMap((s) => s.items);
}

describe("Configurações em duas colunas", () => {
  it("lista todas as seções do hub como links, sem perder nenhuma rota", () => {
    estado.caminho = "/app/settings/security";
    montar();
    const lista = screen.getByRole("navigation", { name: "Seções de configurações" });
    const links = within(lista).getAllByRole("link");
    const itens = esperadas();
    expect(itens.length).toBeGreaterThan(5);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(itens.map((i) => i.href));
  });

  it("marca a seção aberta como página atual", () => {
    estado.caminho = "/app/settings/security";
    montar();
    const atual = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page")
      .map((l) => l.getAttribute("href"));
    expect(atual).toEqual(["/app/settings/security"]);
  });

  it("numa seção aberta, mostra o detalhe ao lado da lista no computador e só o detalhe no celular", () => {
    estado.caminho = "/app/settings/security";
    montar();
    const lista = screen.getByRole("navigation", { name: "Seções de configurações" });
    const detalhe = screen.getByText("detalhe da seção").closest("[data-painel='detalhe']");
    expect(lista.closest("[data-painel='lista']")?.className).toMatch(/\bhidden\b.*\bmd:block\b/);
    expect(detalhe?.className).not.toMatch(/\bhidden\b/);
  });

  it("no hub, o celular mostra só a lista e o computador convida a escolher uma seção", () => {
    estado.caminho = "/app/settings";
    montar();
    const lista = screen.getByRole("navigation", { name: "Seções de configurações" });
    expect(lista.closest("[data-painel='lista']")?.className).not.toMatch(/\bhidden\b/);
    expect(screen.queryByText("detalhe da seção")).toBeNull();
    expect(screen.getByText("Escolha uma seção para ver os detalhes.")).toBeTruthy();
  });

  it("numa seção aberta, o celular tem o caminho de volta para a lista", () => {
    estado.caminho = "/app/settings/security";
    montar();
    const voltar = screen.getByRole("link", { name: "Voltar para Configurações" });
    expect(voltar.getAttribute("href")).toBe("/app/settings");
  });
});
