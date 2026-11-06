import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const B = "00000000-0000-4000-8000-00000000000b";
const cena = vi.hoisted(() => ({ idioma: "pt-BR" as "pt-BR" | "es", previa: true, comPainel: false, confirmando: null as null | { podeTentarDeNovo: boolean } }));

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
  lerPainelDoHub: async () =>
    cena.comPainel ? { assinatura: { estado: "trial", provedor: "asaas", assinaturas_vivas: 0 }, plano: null, checkout: {}, fuso: "UTC" } : null,
  oQueOHubMostra: () => (cena.comPainel || cena.previa ? "pagamento" : "contato"),
}));
vi.mock("@/lib/billing-trial/iniciar", () => ({
  lerPreviaDoTrial: async () =>
    cena.previa ? { planoNome: "Pro", precoCents: 4990, intervalo: "mes", primeiraCobrancaEm: new Date("2026-11-07T15:00:00Z"), precisaDeDocumento: true, confirmando: cena.confirmando } : null,
  diaDaPrimeiraCobranca: () => "07/11",
}));
vi.mock("@/components/cobranca/PainelDaAssinatura", () => ({ PainelDaAssinatura: () => <p /> }));
vi.mock("@/components/cobranca/AcoesDaAssinatura", () => ({ AcoesDaAssinatura: () => <button>Assinar</button> }));
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
  cena.comPainel = false;
  cena.confirmando = null;
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

describe("hub: voltou do cartão e a assinatura ainda não apareceu", () => {
  it("AC-003.7: mostra 'Confirmando seu pagamento' e 'Verificar agora' (POST) no lugar de cadastrar o cartão de novo", async () => {
    cena.confirmando = { podeTentarDeNovo: false };

    await montar();

    expect(screen.getByText("Confirmando seu pagamento")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verificar agora" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Cadastrar cartão e começar o teste grátis" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Tentar de novo" })).toBeNull();
  });

  it("AC-003.7: passado o prazo aparece o caminho explícito 'Tentar de novo'", async () => {
    cena.confirmando = { podeTentarDeNovo: true };

    await montar();

    expect(screen.getByRole("link", { name: "Tentar de novo" }).getAttribute("href")).toBe("/cobranca/iniciar");
  });
});

describe("hub: a espera da confirmação é explicada", () => {
  const ORIENTACAO = "Isso costuma levar alguns minutos. Se passar de 1 hora, fale com o suporte.";
  const PENDENTE = /A conta foi suspensa por falta de pagamento/;

  it("AC-002.1: checkout aberto e linha em confirmando mostra a confirmação com a orientação de 1 hora, no lugar do aviso pendente", async () => {
    cena.confirmando = { podeTentarDeNovo: false };

    await montar();

    expect(screen.getByText(/Estamos confirmando o seu pagamento/)).toBeTruthy();
    expect(screen.getByText(ORIENTACAO)).toBeTruthy();
    expect(screen.queryByText(PENDENTE)).toBeNull();
  });

  it("AC-002.2: o caminho de reler o pagamento (Verificar agora) segue disponível", async () => {
    cena.confirmando = { podeTentarDeNovo: false };

    await montar();

    expect(screen.getByRole("button", { name: "Verificar agora" })).toBeTruthy();
  });

  it("AC-002.3: sem linha em confirmando vale o aviso de pagamento pendente, sem a mensagem nova", async () => {
    await montar();

    expect(screen.getByText(PENDENTE)).toBeTruthy();
    expect(screen.queryByText(ORIENTACAO)).toBeNull();
    expect(screen.queryByTestId("hub-trial-confirmando")).toBeNull();
  });

  it("AC-002.4: conta reativada (sem prévia do trial) não mostra a mensagem", async () => {
    cena.previa = false;

    await montar();

    expect(screen.queryByText(ORIENTACAO)).toBeNull();
    expect(screen.queryByTestId("hub-trial-confirmando")).toBeNull();
  });

  it("AC-002.5: em espanhol a orientação sai traduzida", async () => {
    cena.idioma = "es";
    cena.confirmando = { podeTentarDeNovo: false };

    await montar();

    expect(screen.getByText("Esto suele tardar unos minutos. Si pasa de 1 hora, habla con soporte.")).toBeTruthy();
  });
});

describe("hub: os dois caminhos de pagamento não convivem", () => {
  it("AC-003.2: com o trial à espera do cartão o Assinar do painel some e fica só o botão do trial", async () => {
    cena.comPainel = true;

    await montar();

    expect(screen.getByRole("link", { name: "Cadastrar cartão e começar o teste grátis" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Assinar" })).toBeNull();
  });

  it("AC-003.2: sem trial pendente o painel de pagamento segue com as suas ações", async () => {
    cena.comPainel = true;
    cena.previa = false;

    await montar();

    expect(screen.getByRole("button", { name: "Assinar" })).toBeTruthy();
  });
});
