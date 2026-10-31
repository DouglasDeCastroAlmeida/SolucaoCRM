/**
 * Achado do revisor da Fatia 3: arquivar o plano do cadastro de uma marca com a
 * cobrança ligada deixa a marca cobrando sem plano para o cadastro (cada
 * cadastro cairia em cobranca_marca_sem_plano). A regra recusa com 409.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bancoFalso, operacao, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({ banco: undefined as unknown as BancoFalso }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/branding/marca-do-host", () => ({ invalidarMarcaDoHost: vi.fn() }));

import { editarPlanoCobravel } from "@/lib/brands/cobranca-repo";

const MARCA = "11111111-1111-4111-8111-111111111111";
const PLANO = "33333333-3333-4333-8333-333333333333";

function mundo(o: { cobra: boolean; padrao: boolean }) {
  h.banco = bancoFalso((c: Cadeia): Resposta => {
    if (c.tabela === "brands") return { data: { id: MARCA, cobranca_ligada: o.cobra } };
    if (c.tabela === "cobranca_planos") {
      return { data: { id: PLANO, preco_cents: 9900, intervalo: "mes", arquivado_em: null, padrao_no_cadastro: o.padrao } };
    }
    return {};
  });
}
const escritas = () => h.banco.cadeias.filter((c) => operacao(c) === "update");

beforeEach(() => vi.clearAllMocks());

describe("editarPlanoCobravel — arquivar o plano do cadastro", () => {
  it("AC-001.3: marca com a cobrança ligada: arquivar o plano do cadastro é 409 state_conflict e nada é gravado", async () => {
    mundo({ cobra: true, padrao: true });
    await expect(editarPlanoCobravel(MARCA, PLANO, { arquivado: true }, "u-admin")).rejects.toMatchObject({
      code: "state_conflict",
      status: 409,
    });
    expect(escritas()).toHaveLength(0);
  });

  it("AC-001.3: marca com a cobrança desligada pode arquivar o plano do cadastro", async () => {
    mundo({ cobra: false, padrao: true });
    await editarPlanoCobravel(MARCA, PLANO, { arquivado: true }, "u-admin");
    expect(escritas()).toHaveLength(1);
  });

  it("AC-001.3: plano que não é o do cadastro arquiva mesmo com a cobrança ligada (e nem lê a marca)", async () => {
    mundo({ cobra: true, padrao: false });
    await editarPlanoCobravel(MARCA, PLANO, { arquivado: true }, "u-admin");
    expect(escritas()).toHaveLength(1);
    expect(h.banco.cadeias.some((c) => c.tabela === "brands")).toBe(false);
  });

  it("AC-001.3: marca com a cobrança ligada: desmarcar o plano do cadastro é 409 state_conflict e nada é gravado", async () => {
    mundo({ cobra: true, padrao: true });
    await expect(editarPlanoCobravel(MARCA, PLANO, { padrao_no_cadastro: false }, "u-admin")).rejects.toMatchObject({
      code: "state_conflict",
      status: 409,
    });
    expect(escritas()).toHaveLength(0);
  });

  it("AC-001.3: com a cobrança desligada pode desmarcar; e marcar (true) nunca é barrado", async () => {
    mundo({ cobra: false, padrao: true });
    await editarPlanoCobravel(MARCA, PLANO, { padrao_no_cadastro: false }, "u-admin");
    mundo({ cobra: true, padrao: true });
    await editarPlanoCobravel(MARCA, PLANO, { padrao_no_cadastro: true }, "u-admin");
    expect(escritas()).toHaveLength(1);
  });

  it("AC-001.3: desmarcar plano que não é o do cadastro segue livre com a cobrança ligada", async () => {
    mundo({ cobra: true, padrao: false });
    await editarPlanoCobravel(MARCA, PLANO, { padrao_no_cadastro: false }, "u-admin");
    expect(escritas()).toHaveLength(1);
  });

  it("AC-001.3: desarquivar e editar o nome seguem livres com a cobrança ligada", async () => {
    mundo({ cobra: true, padrao: true });
    await editarPlanoCobravel(MARCA, PLANO, { nome: "Novo" }, "u-admin");
    await editarPlanoCobravel(MARCA, PLANO, { arquivado: false }, "u-admin");
    expect(escritas()).toHaveLength(2);
  });
});
