import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const B = "00000000-0000-4000-8000-00000000000b";
const cena = vi.hoisted(() => ({ idioma: "pt-BR" as "pt-BR" | "es", previa: true }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@empresa.test",
    is_platform_admin: false,
    support: null,
    idioma: cena.idioma,
    organizations: [{ organization_id: B, organization_name: "Empresa B", role: "admin" }],
  }),
  orgAtivaSemPortao: async () => ({ orgId: B, name: "Empresa B", role: "admin", org_status: "suspended" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ in: async () => ({ data: [{ id: B, status: "suspended", suspended_kind: "cobranca" }], error: null }) }),
    }),
  }),
}));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: async () => true }));
vi.mock("@/lib/cobranca/hub", () => ({
  lerPainelDoHub: async () => null,
  oQueOHubMostra: () => "contato",
}));
vi.mock("@/lib/billing-trial/iniciar", () => ({
  lerPreviaDoTrial: async () =>
    cena.previa ? { planoNome: "Pro", precoCents: 4990, intervalo: "mes", primeiraCobrancaEm: new Date("2026-11-07T15:00:00Z"), precisaDeDocumento: true } : null,
  diaDaPrimeiraCobranca: () => "07/11",
}));
vi.mock("@/lib/branding/saida", () => ({ emailDeSuporte: async () => "" }));
vi.mock("@/app/actions/auth/signOut", () => ({ signOut: vi.fn() }));
vi.mock("@/app/app/lgpd/requests/RequestsTable", () => ({ RequestsTable: () => <p /> }));
vi.mock("@/app/app/lgpd/requests/[id]/_client", () => ({ LgpdRequestDetail: () => <p /> }));
vi.mock("@/app/onboarding/_components/OutrasOrganizacoes", () => ({ OutrasOrganizacoes: () => <p /> }));

import AccountSuspendedPage from "./page";

const montar = async () => render(await AccountSuspendedPage({ searchParams: Promise.resolve({}) }));

beforeEach(() => {
  cena.idioma = "pt-BR";
  cena.previa = true;
});

describe("hub: conta à espera do cartão do teste grátis", () => {
  it("AC-003.2: link comum para /cobranca/iniciar com a data real da 1ª cobrança", async () => {
    await montar();

    const link = screen.getByRole("link", { name: "Cadastrar cartão e começar o teste grátis" });
    expect(link.getAttribute("href")).toBe("/cobranca/iniciar");
    expect(screen.getByText("Você só será cobrado em 07/11.")).toBeTruthy();
  });

  it("AC-003.2: em espanhol o atalho e a frase saem traduzidos", async () => {
    cena.idioma = "es";

    await montar();

    expect(screen.getByRole("link", { name: "Registrar tarjeta y empezar la prueba gratis" })).toBeTruthy();
    expect(screen.getByText("Solo se te cobrará el 07/11.")).toBeTruthy();
  });

  it("AC-003.2: sem prévia (conta que não espera o cartão) não há atalho", async () => {
    cena.previa = false;

    await montar();

    expect(screen.queryByTestId("hub-trial-com-cartao")).toBeNull();
  });
});
