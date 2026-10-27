/**
 * AC-005.1: a chave POR TIPO "Pedir confirmação ao cliente" na tela do tipo de
 * agendamento. Reflete o valor do tipo e o envia no PATCH ao salvar.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const patch = vi.fn(async () => ({ data: { id: "x" } }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    patch: (...a: unknown[]) => (patch as (...x: unknown[]) => unknown)(...a),
    post: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(async () => ({ data: [] })),
  },
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/agenda/AgendasConectadas", () => ({ AgendasConectadas: () => null }));
vi.mock("@/components/agenda/PrazosDePresenca", () => ({ PrazosDePresenca: () => null }));
vi.mock("@/components/agenda/ClientePelaAgenda", () => ({ ClientePelaAgenda: () => null }));
vi.mock("@/components/agenda/DiasBloqueados", () => ({ DiasBloqueados: () => null }));

import { TiposDeAgendamentoClient, type TipoRow } from "@/app/app/settings/tenant/agenda/_client";

const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TIPO: TipoRow = {
  id: ID,
  name: "Atendimento",
  slug: "atendimento",
  description: null,
  category: "consulta",
  duration_minutes: 60,
  location_kind: "in_person",
  location_details: null,
  default_owner_user_id: "user-1",
  requires_confirmation: false,
  is_active: true,
  default_price_cents: null,
  reminder_enabled: true,
  reminder_minutes_before: 1440,
  reminder_extra_offsets_minutes: [],
  reminder_body: null,
  reminder_bodies: null,
};

function tela(tipo: TipoRow) {
  render(
    <TiposDeAgendamentoClient
      tiposIniciais={[tipo]}
      pessoas={[{ id: "user-1", papel: "admin", nome: "Secretária" }]}
      podeEditar
      usuarioAtualId="user-1"
      podeConfigurarGoogle={false}
      clientePelaAgendaLigado={false}
      colegasPodemMexerNaAgendaLigado={true}
      podeMudarAgendaDosColegas={false}
      podeLigarClientePelaAgenda={false}
      meetAbertoLigado={false}
      podeMudarMeetAberto={false}
    />,
  );
}

afterEach(() => {
  cleanup();
  patch.mockClear();
});

describe("tela do tipo: Pedir confirmação ao cliente", () => {
  it("AC-005.1: vem desligada de fábrica e mostra a explicação", async () => {
    tela(TIPO);

    await userEvent.click(screen.getByTestId(`editar-${ID}`));

    expect(screen.getByTestId(`editar-confirmacao-cliente-${ID}`)).not.toBeChecked();
    expect(screen.getByText("Pedir confirmação ao cliente")).toBeInTheDocument();
  });

  it("AC-005.1: ligar e salvar manda client_confirmation_enabled true no PATCH", async () => {
    tela(TIPO);
    await userEvent.click(screen.getByTestId(`editar-${ID}`));

    await userEvent.click(screen.getByTestId(`editar-confirmacao-cliente-${ID}`));
    await userEvent.click(screen.getByTestId(`salvar-${ID}`));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0]?.[1]).toMatchObject({ id: ID, client_confirmation_enabled: true });
  });

  it("AC-005.1: um tipo que já tinha a chave ligada abre marcado", async () => {
    tela({ ...TIPO, client_confirmation_enabled: true });

    await userEvent.click(screen.getByTestId(`editar-${ID}`));

    expect(screen.getByTestId(`editar-confirmacao-cliente-${ID}`)).toBeChecked();
  });
});
