/**
 * Mudança 003, Fatia 5: a troca de plano do painel da empresa só oferece planos
 * do MESMO escopo do plano atual (instalação com instalação, marca com a mesma
 * marca). Nunca mistura.
 */
import { describe, expect, it, vi } from "vitest";

import { bancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

vi.mock("@/lib/cobranca/configuracao", () => ({ provedorDaInstalacao: async () => null }));
vi.mock("@/lib/cobranca/uso", () => ({ lerUsoDaOrganizacao: async () => ({ assentos: 1, canais: 1 }) }));

import { lerPainelDaAssinatura } from "./painel";

const MARCA = "11111111-1111-4111-8111-111111111111";
const p = (id: string, brand_id: string | null) => ({
  id, nome: id, preco_cents: 4990, intervalo: "mes", max_assentos: 5, max_canais: 2, teto_ia_usd_cents: null,
  arquivado_em: null, oferecido_ao_cliente: true, brand_id,
});

function painelDe(atual: string) {
  const planos = [p("inst-a", null), p("inst-b", null), p("marca-a", MARCA), p("marca-b", MARCA)];
  const b = bancoFalso(
    (c: Cadeia): Resposta => {
      if (c.tabela === "cobranca_assinaturas") return { data: { plano_id: atual, plano_agendado_id: null, estado: "trial" } };
      if (c.tabela === "cobranca_planos") return { data: planos };
      if (c.tabela === "organizations") return { data: { timezone: null, cnpj: null } };
      return {};
    },
    () => ({ data: 0 }),
  );
  return lerPainelDaAssinatura(b.cliente as never, "org-1");
}

describe("lerPainelDaAssinatura — planos para troca", () => {
  it("AC-001.1: empresa num plano da instalação só vê planos da instalação", async () => {
    expect((await painelDe("inst-a")).planosParaTroca.map((x) => x.id)).toEqual(["inst-b"]);
  });

  it("AC-001.2: empresa num plano de marca só vê planos da MESMA marca", async () => {
    expect((await painelDe("marca-a")).planosParaTroca.map((x) => x.id)).toEqual(["marca-b"]);
  });
});
