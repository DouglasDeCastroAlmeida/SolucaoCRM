/**
 * Limpeza final do visual de mensageiro (#99): o conteúdo da barra lateral não
 * tem mais controle de recolher.
 *
 * O desktop desenha a faixa de ícones (`FaixaDeIcones`), que tem o seu próprio
 * controle; `SidebarContent` só é montado, aberto, dentro da gaveta do celular
 * (`MobileSidebar`), onde o botão já vinha desligado. O botão e a prop
 * `showCollapseControl` eram código sem caminho de produção.
 *
 * Os casos de baixo seguem protegendo o que ainda vale: a marca não estoura a
 * linha da logo (#2722 / review #2723).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SidebarContent } from "@/components/shell/Sidebar";
import { MarcaDaInstalacaoProvider } from "@/lib/branding/contexto";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: null,
};

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => authRef,
  usePermission: () => false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
}));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/components/shell/ContadorDeCasos", () => ({
  ContadorDeCasos: () => null,
}));
vi.mock("@/components/shell/ContadorDaFila", () => ({
  ContadorDaFila: () => null,
}));
vi.mock("@/components/shell/VersionFooter", () => ({
  VersionFooter: () => null,
}));

function comoPapel(role: ActiveOrg["role"]) {
  authRef.user = { is_platform_admin: false };
  authRef.activeOrg = { orgId: "org-1", name: "Org", role };
}

afterEach(cleanup);

describe("Sidebar — sem controle de recolher (#99)", () => {
  it("aberta: nenhum botão de recolher na barra", () => {
    comoPapel("admin");
    render(<SidebarContent />);
    expect(screen.queryByRole("button", { name: /recolher sidebar/i })).toBeNull();
  });

  it("nenhum botão de expandir na barra", () => {
    comoPapel("admin");
    render(<SidebarContent />);
    expect(screen.queryByRole("button", { name: /expandir sidebar/i })).toBeNull();
  });
});

/**
 * O que o review do PR #2723 mediu com `getBoundingClientRect` numa réplica
 * da linha da logo (issue #2722): com marca própria, a linha ESTOURAVA a
 * barra de 240px — e não só no caso extremo.
 *
 * O jsdom não mede layout, então estes casos conferem a CLASSE que produz o
 * comportamento medido. Se alguém tirar uma delas num refactor, o teste cai
 * mesmo sem ninguém ter aberto a tela.
 */
describe("Sidebar — a marca não disputa a barra com o botão (#2722 / review #2723)", () => {
  it("com marca própria: a imagem tem teto que encolhe, e o wrapper é min-w-0", () => {
    authRef.user = { is_platform_admin: false };
    authRef.activeOrg = {
      orgId: "org-1",
      name: "Org",
      role: "admin",
      marca: { nome: "Clínica Sorriso Feliz", logoUrl: "https://marca/logo.png" },
    };
    render(<SidebarContent />);
    const img = document.querySelector("img")!;
    // O review provou a pegadinha: `max-w-full` + `max-w-[10rem]` disputam a
    // MESMA propriedade e só um vale. O teto tem de ser um único `min()`.
    expect(img.className).toContain("max-w-[min(10rem,100%)]");
    expect(img.className).not.toContain("max-w-[10rem]");
    // `min-w-0` porque item de flex não encolhe abaixo do `min-width: auto`.
    expect(img.parentElement?.className).toContain("min-w-0");
  });

  it("sem logo: o nome longo trunca, com o nome completo no title", () => {
    // O nome da barra vem de `marca.nome ?? brand.name`, NUNCA de
    // `activeOrg.name` — e `logo` é `marca.logoUrl || brand.logoUrl`. Sem o
    // provider, o contexto default devolve a marca do PRODUTO e a barra
    // desenha o símbolo no lugar do texto (foi o que este teste pegou na
    // primeira rodada). `logoUrl: null` nos dois lados é o que dá a tela sem
    // arte, que é o caso medido no review.
    authRef.user = { is_platform_admin: false };
    authRef.activeOrg = {
      orgId: "org-1",
      name: "Org",
      role: "admin",
      marca: { nome: "Clínica Odontológica Sorriso Feliz", logoUrl: null },
    };
    render(
      <MarcaDaInstalacaoProvider
        marca={{ name: "Sistema do Revendedor", logoUrl: null, initial: "S" }}
      >
        <SidebarContent />
      </MarcaDaInstalacaoProvider>,
    );
    // Medido no review: 3 linhas (72px) dentro de uma linha de 56px.
    const nome = screen.getByText("Clínica Odontológica Sorriso Feliz");
    expect(nome.className).toContain("truncate");
    expect(nome).toHaveAttribute("title", "Clínica Odontológica Sorriso Feliz");
  });

  it("só com a arte do escuro: o nome do tema claro também trunca (é bloco)", () => {
    // Instalação que cadastrou só a arte do tema escuro: no claro a barra mostra
    // o NOME dentro do wrapper da marca, que não é flex. Ali o `<span>` é inline,
    // e `truncate` (overflow + ellipsis) não vale em elemento inline — medido
    // numa réplica, o nome ia até x=255 numa barra de 240px, por cima do botão.
    // `block` é o que faz o corte valer.
    authRef.user = { is_platform_admin: false };
    authRef.activeOrg = {
      orgId: "org-1",
      name: "Org",
      role: "admin",
      marca: {
        nome: "Clínica Odontológica Sorriso Feliz",
        logoUrl: null,
        logoDarkUrl: "https://marca/logo-escuro.png",
      },
    };
    render(
      <MarcaDaInstalacaoProvider
        marca={{ name: "Sistema do Revendedor", logoUrl: null, initial: "S" }}
      >
        <SidebarContent />
      </MarcaDaInstalacaoProvider>,
    );
    const nome = screen.getByText("Clínica Odontológica Sorriso Feliz");
    expect(nome.className).toContain("truncate");
    expect(nome.className.split(/\s+/)).toContain("block");
  });
});
