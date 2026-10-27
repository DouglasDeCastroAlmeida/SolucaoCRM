/**
 * AC-004.1 e AC-004.2: a consulta que alimenta a agenda e o histórico do contato
 * traz as duas colunas de resposta do cliente ao lembrete.
 */
import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listaAgendamentos } from "@/lib/agenda/consulta";

const ORG = "22222222-2222-4222-8222-222222222222";

function db(linhas: Array<Record<string, unknown>>) {
  const selects: string[] = [];
  const from = (tabela: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["eq", "in", "order", "limit", "gte", "lt", "lte", "or"]) b[m] = () => b;
    b.select = (s: string) => {
      if (tabela === "calendar_appointments") selects.push(s);
      return b;
    };
    b.maybeSingle = async () => ({ data: null, error: null });
    b.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(ok({ data: tabela === "calendar_appointments" ? linhas : [], error: null }));
    return b;
  };
  return { selects, supabase: { from } as unknown as SupabaseClient };
}

const linha = (extra: Record<string, unknown>) => ({
  id: "a1",
  title: "Consulta",
  starts_at: "2026-10-28T13:00:00Z",
  ends_at: "2026-10-28T14:00:00Z",
  time_zone: "America/Sao_Paulo",
  status: "confirmed",
  revision: 1,
  owner_user_id: null,
  contact_id: null,
  ...extra,
});

describe("listaAgendamentos: resposta do cliente ao lembrete", () => {
  it("AC-004.1 e AC-004.2: seleciona as duas colunas e devolve as horas", async () => {
    const { selects, supabase } = db([
      linha({
        client_confirmed_at: "2026-10-27T15:30:00Z",
        client_reschedule_requested_at: "2026-10-27T16:00:00Z",
      }),
    ]);

    const r = await listaAgendamentos(supabase, ORG, { limite: 10, de: "2026-10-28T00:00:00Z", ate: "2026-10-29T00:00:00Z" } as never);

    expect(selects[0]).toContain("client_confirmed_at");
    expect(selects[0]).toContain("client_reschedule_requested_at");
    expect(r.ok && r.agendamentos[0]).toMatchObject({
      clienteConfirmouEm: "2026-10-27T15:30:00Z",
      clientePediuRemarcarEm: "2026-10-27T16:00:00Z",
    });
  });

  it("AC-004.1: sem resposta do cliente, os dois campos vêm nulos", async () => {
    const { supabase } = db([linha({})]);

    const r = await listaAgendamentos(supabase, ORG, { limite: 10, de: "2026-10-28T00:00:00Z", ate: "2026-10-29T00:00:00Z" } as never);

    expect(r.ok && r.agendamentos[0]).toMatchObject({
      clienteConfirmouEm: null,
      clientePediuRemarcarEm: null,
    });
  });
});
