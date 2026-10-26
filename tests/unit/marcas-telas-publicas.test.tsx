// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

/**
 * AC-005.1: login, cadastro, recuperar senha e a página de erro vivem todos dentro
 * da casca `app/(public)/layout.tsx`. Medir a casca com a marca do HOST (e a
 * resolução REAL de `marcaDaSaida`, sem dublê) prova as quatro telas de uma vez.
 */

const h = vi.hoisted(() => ({ marca: null as unknown }));

vi.mock("@/lib/branding/marca-do-pedido", () => ({
  marcaDoPedido: async () => ({ brand: h.marca, domainKind: "subdominio" }),
}));
vi.mock("@/lib/branding/instalacao", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  marcaDaInstalacao: async () => null,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}));

const marcaCorretor: Brand = {
  ...MARCA_PADRAO_EMBUTIDA,
  id: "marca-corretor",
  slug: "corretor",
  name: "Corretor",
  is_default: false,
  app_name: "Corretor Pro",
  logo_path: "marcas/corretor.png",
  accent_hex: "#7a1fa2",
};

async function tela(marca: Brand): Promise<string> {
  h.marca = marca;
  const { default: PublicLayout } = await import("@/app/(public)/layout");
  return renderToStaticMarkup(await PublicLayout({ children: <p>conteúdo da tela</p> }));
}

describe("AC-005.1: as telas públicas mostram a marca do host", () => {
  beforeEach(() => {
    vi.resetModules();
    // Base do Storage para o logo (lida dinamicamente de process.env no servidor).
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sb.exemplo.test";
  });

  it("AC-005.1: o nome da marca do host aparece na fachada", async () => {
    const html = await tela(marcaCorretor);
    expect(html).toContain("conteúdo da tela");
    expect(html).toContain("Corretor Pro");
  });

  it("AC-005.1: o logo da marca do host é o da fachada", async () => {
    const html = await tela(marcaCorretor);
    expect(html).toContain('data-testid="logo-da-fachada"');
    expect(html).toContain("marcas/corretor.png");
    expect(html).toContain('alt="Corretor Pro"');
  });

  it("AC-005.1: a marca padrão não leva o nome nem o logo de outra marca", async () => {
    const html = await tela(MARCA_PADRAO_EMBUTIDA);
    expect(html).not.toContain("Corretor Pro");
    expect(html).not.toContain("marcas/corretor.png");
  });
});
