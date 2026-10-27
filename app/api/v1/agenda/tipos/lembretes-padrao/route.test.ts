/**
 * "ATIVAR LEMBRETES PADRÃO" num tipo que já existe (mudança 007, AC-001.3).
 *
 * Liga os dois degraus (24 h e 2 h) com o texto padrão e SÓ isso: nada além das
 * colunas de lembrete é escrito, e o isolamento entre organizações é medido pela
 * linha da outra organização, que tem de ficar intacta. O dublê aplica os
 * filtros de verdade.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import type { AuthUser } from "@/lib/auth/types";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "33333333-3333-4333-8333-333333333333";
const USER = "11111111-1111-4111-8111-111111111111";
const TIPO = "44444444-4444-4444-8444-444444444444";
const TIPO_DA_OUTRA = "55555555-5555-4555-8555-555555555555";

type Linha = Record<string, unknown> & { id: string; organization_id: string };

function tipo(over: Partial<Linha> & { id: string; organization_id: string }): Linha {
  return {
    name: "Consulta",
    reminder_enabled: false,
    reminder_minutes_before: 1440,
    reminder_extra_offsets_minutes: [],
    reminder_body: null,
    reminder_bodies: {},
    client_confirmation_enabled: false,
    duration_minutes: 30,
    ...over,
  };
}

function makeAdmin(linhas: Linha[], locale = "pt-BR") {
  const updates: Array<{ campos: Record<string, unknown>; filtros: Record<string, unknown> }> = [];
  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => {
      const filtros: Record<string, unknown> = {};
      let campos: Record<string, unknown> | null = null;
      const api = {
        select: () => api,
        update(v: Record<string, unknown>) {
          campos = v;
          return api;
        },
        eq(k: string, v: unknown) {
          filtros[k] = v;
          return api;
        },
        async maybeSingle() {
          if (tabela === "organizations") return { data: { locale }, error: null };
          const alvo = linhas.filter((l) => Object.entries(filtros).every(([k, v]) => l[k] === v));
          if (campos) {
            updates.push({ campos, filtros });
            for (const l of alvo) Object.assign(l, campos);
          }
          return { data: alvo[0] ? { ...alvo[0] } : null, error: null };
        },
      };
      return api;
    },
  } as unknown as ReturnType<typeof createAdminClient>);
  return { updates };
}

function authOk(): void {
  const user: AuthUser = {
    id: USER,
    email: "m@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: "manager" }],
  };
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user, org: { orgId: ORG, name: "Org", role: "manager" } });
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/v1/agenda/tipos/lembretes-padrao", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
});

describe("POST /api/v1/agenda/tipos/lembretes-padrao", () => {
  it("AC-001.3: liga os dois degraus com o texto padrão e só isso", async () => {
    authOk();
    const linhas = [tipo({ id: TIPO, organization_id: ORG })];
    const db = makeAdmin(linhas);
    const { POST } = await import("./route");

    const res = await POST(req({ id: TIPO }));

    expect(res.status).toBe(200);
    expect(linhas[0]?.reminder_enabled).toBe(true);
    expect(linhas[0]?.reminder_minutes_before).toBe(1440);
    expect(linhas[0]?.reminder_extra_offsets_minutes).toEqual([120]);
    expect(String(linhas[0]?.reminder_body)).toContain("{{organizacao}}");
    expect(Object.keys(linhas[0]?.reminder_bodies as object)).toEqual(["120"]);
    // "E só isso": nada fora das colunas de lembrete é escrito.
    expect(Object.keys(db.updates[0]?.campos ?? {}).sort()).toEqual(
      [
        "reminder_bodies",
        "reminder_enabled",
        "reminder_extra_offsets_minutes",
        "reminder_minutes_before",
        "reminder_body",
      ].sort(),
    );
    expect(linhas[0]?.duration_minutes).toBe(30);
  });

  it("AC-001.3: a frase de confirmação entra só se o tipo liga a confirmação do cliente", async () => {
    authOk();
    const linhas = [tipo({ id: TIPO, organization_id: ORG, client_confirmation_enabled: true })];
    makeAdmin(linhas);
    const { POST } = await import("./route");

    await POST(req({ id: TIPO }));

    expect(String(linhas[0]?.reminder_body)).toContain("Responda 1 para confirmar ou 2 para remarcar.");
  });

  it("AC-001.3: o texto sai no idioma da organização", async () => {
    authOk();
    const linhas = [tipo({ id: TIPO, organization_id: ORG })];
    makeAdmin(linhas, "es");
    const { POST } = await import("./route");

    await POST(req({ id: TIPO }));

    expect(String(linhas[0]?.reminder_body)).toMatch(/Te recuerdo/);
  });

  it("AC-001.3: audita com verbo próprio, na organização da sessão", async () => {
    authOk();
    makeAdmin([tipo({ id: TIPO, organization_id: ORG })]);
    const { POST } = await import("./route");

    await POST(req({ id: TIPO }));

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agenda.tipo_lembretes_padrao_ativados",
        organizationId: ORG,
        resourceId: TIPO,
        actorUserId: USER,
      }),
    );
  });

  it("AC-001.3: tipo que já tem lembrete ligado não é sobrescrito (409, sem escrita)", async () => {
    authOk();
    const linhas = [tipo({ id: TIPO, organization_id: ORG, reminder_enabled: true, reminder_body: "meu texto" })];
    const db = makeAdmin(linhas);
    const { POST } = await import("./route");

    const res = await POST(req({ id: TIPO }));

    expect(res.status).toBe(409);
    expect(db.updates).toEqual([]);
    expect(linhas[0]?.reminder_body).toBe("meu texto");
    expect(audit).not.toHaveBeenCalled();
  });

  it("AC-001.3: tipo de outra organização dá 404 e a linha dela fica intacta", async () => {
    authOk();
    const linhas = [tipo({ id: TIPO_DA_OUTRA, organization_id: OUTRA_ORG })];
    const db = makeAdmin(linhas);
    const { POST } = await import("./route");

    const res = await POST(req({ id: TIPO_DA_OUTRA }));

    expect(res.status).toBe(404);
    expect(db.updates).toEqual([]);
    expect(linhas[0]?.reminder_enabled).toBe(false);
  });

  it("AC-001.3: corpo sem uuid é recusado (422) sem tocar o banco", async () => {
    authOk();
    const db = makeAdmin([]);
    const { POST } = await import("./route");

    const res = await POST(req({ id: "nao-e-uuid" }));

    expect(res.status).toBe(422);
    expect(db.updates).toEqual([]);
  });

  it("AC-001.3: modo suporte somente-leitura barra antes do efeito", async () => {
    authOk();
    vi.mocked(requireSupportWrite).mockResolvedValue(new NextResponse(null, { status: 403 }));
    const db = makeAdmin([tipo({ id: TIPO, organization_id: ORG })]);
    const { POST } = await import("./route");

    const res = await POST(req({ id: TIPO }));

    expect(res.status).toBe(403);
    expect(db.updates).toEqual([]);
  });
});
