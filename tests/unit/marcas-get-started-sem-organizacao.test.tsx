// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARCA_PADRAO_EMBUTIDA } from "@/lib/brands/tipos";

/**
 * AC-004.1 pela tela: conta que só tem organização na marca B abre /get-started no
 * host da marca A (fechada). Tem de ler a verdade ("sua conta não tem organização
 * nesta marca"), sem formulário que só poderia recusar, e sem redirecionar de volta.
 */

const h = vi.hoisted(() => ({ marca: null as unknown }));

vi.mock("next/navigation", () => ({
  redirect: (d: string) => {
    throw new Error(`NEXT_REDIRECT:${d}`);
  },
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({ id: "u1", idioma: "pt-BR" }),
  // Lista já filtrada pela marca do host: a conta não tem organização aqui.
  resolveActiveOrg: async () => null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { user_metadata: {} } } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/branding/marca-do-pedido", () => ({
  marcaDoPedido: async () => ({ brand: h.marca, domainKind: "subdominio" }),
}));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: async () => ({ nome: "Marca A" }) }));
vi.mock("@/lib/auth/politica-de-cadastro", () => ({ modoDeCadastro: async () => "aberto" }));
vi.mock("@/lib/auth/registration-requests", () => ({ estadoDoPedido: async () => null }));
vi.mock("@/lib/cobranca/cadastro", () => ({
  lerCadastroNaTela: async () => ({ oferecidos: [], padraoId: null, exigeEscolha: false }),
  planoInicialDoSeletor: () => null,
}));
vi.mock("@/components/auth/RecoverOrganizationForm", () => ({
  RecoverOrganizationForm: () => <form data-testid="form-organizacao" />,
}));

beforeEach(() => {
  vi.resetModules();
});

describe("AC-004.1: /get-started para conta sem organização nesta marca", () => {
  it("AC-004.1: marca fechada mostra a mensagem clara e nenhum formulário", async () => {
    h.marca = { ...MARCA_PADRAO_EMBUTIDA, id: "marca-a", is_default: false, cadastro_aberto: false };
    const { default: Pagina } = await import("@/app/get-started/page");
    const html = renderToStaticMarkup(await Pagina());
    expect(html).toContain("Sua conta não tem organização nesta marca");
    expect(html).not.toContain("form-organizacao");
  });

  it("AC-005.3: marca aberta oferece o formulário para criar a organização nesta marca", async () => {
    h.marca = { ...MARCA_PADRAO_EMBUTIDA, id: "marca-a", is_default: false, cadastro_aberto: true };
    const { default: Pagina } = await import("@/app/get-started/page");
    const html = renderToStaticMarkup(await Pagina());
    expect(html).toContain("form-organizacao");
    expect(html).not.toContain("Sua conta não tem organização nesta marca");
  });
});
