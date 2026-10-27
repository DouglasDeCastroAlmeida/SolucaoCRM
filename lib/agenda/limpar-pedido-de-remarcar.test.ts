import { describe, expect, it } from "vitest";

import { limparPedidoDeRemarcar } from "@/lib/agenda/limpar-pedido-de-remarcar";

interface Chamada {
  tabela: string;
  valores: Record<string, unknown>;
  filtros: Array<[string, ...unknown[]]>;
}

function admin(falha = false) {
  const chamadas: Chamada[] = [];
  const client = {
    from(tabela: string) {
      const c: Chamada = { tabela, valores: {}, filtros: [] };
      chamadas.push(c);
      const b: Record<string, unknown> = {};
      for (const m of ["eq", "is", "in", "not", "or"]) {
        b[m] = (...args: unknown[]) => {
          c.filtros.push([m, ...args]);
          return b;
        };
      }
      b.update = (v: Record<string, unknown>) => {
        c.valores = v;
        return b;
      };
      b.then = (ok: (v: unknown) => unknown) => ok({ data: null, error: falha ? { message: "x" } : null });
      return b;
    },
  };
  return { client: client as never, chamadas };
}

describe("AC-003.4: remarcar ou cancelar pela agenda limpa a pendência", () => {
  it("AC-003.4: cancelar zera o pedido e fecha o item da Central, com a organização no filtro", async () => {
    const { client, chamadas } = admin();
    await limparPedidoDeRemarcar(() => client, { organizationId: "org-a", compromissoId: "ap-1", horarioMudou: false });

    const ap = chamadas.find((c) => c.tabela === "calendar_appointments")!;
    expect(ap.valores).toEqual({ client_reschedule_requested_at: null });
    expect(ap.filtros).toContainEqual(["eq", "organization_id", "org-a"]);
    expect(ap.filtros).toContainEqual(["eq", "id", "ap-1"]);

    const it = chamadas.find((c) => c.tabela === "agent_inbox_items")!;
    expect(it.valores).toMatchObject({ status: "resolved" });
    expect(it.filtros).toContainEqual(["eq", "organization_id", "org-a"]);
    expect(it.filtros).toContainEqual(["eq", "kind", "agenda_cliente_pediu_remarcar"]);
    expect(it.filtros).toContainEqual(["eq", "ref_id", "ap-1"]);
    expect(it.filtros).toContainEqual(["eq", "status", "open"]);
  });

  it("AC-003.4: remarcar também zera a confirmação do cliente (o horário confirmado deixou de existir)", async () => {
    const { client, chamadas } = admin();
    await limparPedidoDeRemarcar(() => client, { organizationId: "org-a", compromissoId: "ap-1", horarioMudou: true });
    const ap = chamadas.find((c) => c.tabela === "calendar_appointments")!;
    expect(ap.valores).toEqual({ client_reschedule_requested_at: null, client_confirmed_at: null });
  });

  it("AC-003.4: erro de banco nunca sobe (não pode desfazer o cancelamento já gravado)", async () => {
    const { client } = admin(true);
    await expect(
      limparPedidoDeRemarcar(() => client, { organizationId: "org-a", compromissoId: "ap-1", horarioMudou: true }),
    ).resolves.toBeUndefined();
    const quebrado = {
      from() {
        throw new Error("boom");
      },
    } as never;
    await expect(
      limparPedidoDeRemarcar(() => quebrado, { organizationId: "org-a", compromissoId: "ap-1", horarioMudou: false }),
    ).resolves.toBeUndefined();
  });
});
