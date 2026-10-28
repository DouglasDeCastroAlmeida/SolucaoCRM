import { describe, expect, it, vi } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";

import { EVENTO_AVISO_DE_ORCAMENTO } from "./aviso-por-email";
import { avisoDeOrcamentoPorEmailHandler, processarAvisoDeOrcamento } from "./aviso-por-email.handler";

const ORG = "33333333-3333-4333-8333-333333333333";

function evento(payload: Record<string, unknown>): EventRow {
  return {
    id: "ev-1",
    organization_id: ORG,
    event_type: EVENTO_AVISO_DE_ORCAMENTO,
    entity_kind: "ai_budget",
    entity_id: ORG,
    payload,
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

const marca = { nome: "Clinica Aurora", logoUrl: null, accent: "#336699", accentFg: "#ffffff", origens: { nome: "organizacao", cor: "organizacao" } } as const;

function deps(sobre: Partial<Parameters<typeof processarAvisoDeOrcamento>[1]> = {}): Parameters<typeof processarAvisoDeOrcamento>[1] {
  return {
    idiomaDaOrganizacao: vi.fn(async () => "pt-BR" as const),
    emailsDosAdmins: vi.fn(async () => ["admin@x.com"]),
    marca: vi.fn(async () => marca),
    enviar: vi.fn(async () => ({ ok: true })),
    baseDaUrl: () => "https://crm.exemplo.com.br",
    ...sobre,
  };
}

describe("AC-004.2: o consumidor do evento manda o e-mail aos administradores", () => {
  it("AC-004.2: declara o evento que o gate emite e é pulado em organização parada", () => {
    expect(avisoDeOrcamentoPorEmailHandler.events).toEqual([EVENTO_AVISO_DE_ORCAMENTO]);
    expect(avisoDeOrcamentoPorEmailHandler.naOrgParada).toBe("pula");
  });

  it("AC-004.2: evento válido envia o e-mail com o link da tela de uso e devolve ok", async () => {
    const enviar = vi.fn(async (_m: { to: string; text: string }) => ({ ok: true }));
    const d = deps({ enviar: enviar as never });

    const r = await processarAvisoDeOrcamento(evento({ gasto_cents: 4100, teto_cents: 5000 }), d);

    expect(r.status).toBe("ok");
    expect(enviar).toHaveBeenCalledTimes(1);
    const arg = (enviar.mock.calls[0] as unknown as [{ text: string; to: string }])[0];
    expect(arg.to).toBe("admin@x.com");
    expect(arg.text).toContain("https://crm.exemplo.com.br/app/ai/usage");
  });

  it("AC-004.2: sem e-mail configurado devolve skipped com o motivo, sem erro e sem repetir", async () => {
    const d = deps({ enviar: vi.fn(async () => ({ ok: false, error: "not_configured" })) });

    const r = await processarAvisoDeOrcamento(evento({ gasto_cents: 4100, teto_cents: 5000 }), d);

    expect(r.status).toBe("skipped");
    expect(r.detail).toBe("email_nao_configurado");
  });

  it("AC-004.2: payload sem números válidos é ignorado, nada é enviado", async () => {
    const enviar = vi.fn(async () => ({ ok: true }));
    const d = deps({ enviar });

    const r = await processarAvisoDeOrcamento(evento({ gasto_cents: "x" }), d);

    expect(r.status).toBe("skipped");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("AC-004.2: leitura dos administradores que falha nunca lança: skipped", async () => {
    const enviar = vi.fn(async () => ({ ok: true }));
    const d = deps({ enviar, emailsDosAdmins: vi.fn(async (): Promise<string[]> => { throw new Error("banco fora"); }) });

    const r = await processarAvisoDeOrcamento(evento({ gasto_cents: 4100, teto_cents: 5000 }), d);

    expect(r.status).toBe("skipped");
    expect(enviar).not.toHaveBeenCalled();
  });
});
