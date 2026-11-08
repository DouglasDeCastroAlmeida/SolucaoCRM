/**
 * A lista de Configurações mostra EXATAMENTE as seções que o hub antigo (`NavHub` em
 * /app/settings) mostrava: módulos da INSTALAÇÃO ligados e nenhum filtro por capacidade
 * (a página nunca passou `capacidadesLigadas`). Rota de /app/settings fora da lista segue
 * alcançável, com uma indicação de onde a pessoa está.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const estado = {
  caminho: "/app/settings",
  modulos: ["propostas", "financeiro", "banco_externo"] as string[],
  capacidades: [] as string[],
};

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { is_platform_admin: false, support: null },
    activeOrg: {
      orgId: "org-1",
      role: "admin",
      interface_settings: undefined,
      modulos_ligados: estado.modulos,
      capacidades_ligadas: estado.capacidades,
    },
  }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("next/navigation", () => ({ usePathname: () => estado.caminho }));

import type { ModuloOpcional } from "@/lib/instalacao/modulos";
import { hubSections } from "@/lib/navigation/registry";
import { ConfiguracoesEmDuasColunas } from "./ConfiguracoesEmDuasColunas";

function hrefsDaLista(): string[] {
  const lista = screen.getByRole("navigation", { name: "Seções de configurações" });
  return within(lista)
    .getAllByRole("link")
    .map((l) => l.getAttribute("href") ?? "");
}

describe("lista de Configurações x hub antigo", () => {
  it("mostra as mesmas seções do hub, na mesma ordem, mesmo com a capacidade da empresa desligada", () => {
    estado.caminho = "/app/settings";
    render(<ConfiguracoesEmDuasColunas><p>x</p></ConfiguracoesEmDuasColunas>);
    // O hub antigo: módulos da instalação, SEM capacidades (a página não as passava).
    const doHub = hubSections("organizacao", false, "admin", undefined, estado.modulos as ModuloOpcional[])
      .flatMap((s) => s.items.map((i) => i.href));
    expect(hrefsDaLista()).toEqual(doHub);
    expect(doHub).toContain("/app/settings/tenant/proposals/modelos");
  });

  it("rota de Configurações fora da lista continua mostrando o detalhe e uma indicação do lugar", () => {
    estado.caminho = "/app/settings/canal-oficial";
    render(<ConfiguracoesEmDuasColunas><p>detalhe fora da lista</p></ConfiguracoesEmDuasColunas>);
    expect(screen.getByText("detalhe fora da lista")).toBeTruthy();
    const aqui = screen.getByTestId("secao-fora-da-lista");
    expect(aqui.getAttribute("aria-current")).toBe("page");
    expect(aqui.textContent).toContain("Outra seção");
  });
});
