import { describe, expect, it } from "vitest";

import { reservarEnvioDeAcesso, TRAVA_DE_REENVIO_SEGUNDOS, type BancoDoContexto } from "./contexto-de-email";

type Linha = { email: string; action: string; brand_id: string; last_sent_at: string | null };

/** Banco em memória que respeita a regra de "update condicional" (compare-and-swap). */
function bancoEmMemoria(): { banco: BancoDoContexto; linhas: Linha[] } {
  const linhas: Linha[] = [];
  const banco: BancoDoContexto = {
    async gravarContexto(e) {
      const atual = linhas.find((l) => l.email === e.email && l.action === e.action);
      if (atual) atual.brand_id = e.brandId;
      else linhas.push({ email: e.email, action: e.action, brand_id: e.brandId, last_sent_at: null });
    },
    async ultimoEnvio(email, action) {
      return linhas.find((l) => l.email === email && l.action === action)?.last_sent_at ?? null;
    },
    async marcarEnvio(email, action, esperado, agoraIso) {
      const l = linhas.find((x) => x.email === email && x.action === action);
      if (!l || l.last_sent_at !== esperado) return false;
      l.last_sent_at = agoraIso;
      return true;
    },
  };
  return { banco, linhas };
}

const BASE = { email: "ana@exemplo.com", acao: "recovery", brandId: "b1" };

describe("reserva do envio de e-mail de acesso", () => {
  it("AC-006.3: o primeiro pedido grava o contexto da marca e é liberado", async () => {
    const { banco, linhas } = bancoEmMemoria();
    const r = await reservarEnvioDeAcesso(BASE, { banco, agoraMs: () => 1_000_000 });
    expect(r).toBe("liberado");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.brand_id).toBe("b1");
  });

  it("AC-006.3: um segundo pedido dentro de 60 s é travado (clique duplo não gera dois e-mails)", async () => {
    const { banco } = bancoEmMemoria();
    const deps = { banco, agoraMs: () => 1_000_000 };
    await reservarEnvioDeAcesso(BASE, deps);
    const segundo = await reservarEnvioDeAcesso(BASE, { banco, agoraMs: () => 1_000_000 + (TRAVA_DE_REENVIO_SEGUNDOS - 1) * 1000 });
    expect(segundo).toBe("travado");
  });

  it("AC-006.3: passados 60 s o reenvio volta a ser liberado", async () => {
    const { banco } = bancoEmMemoria();
    await reservarEnvioDeAcesso(BASE, { banco, agoraMs: () => 1_000_000 });
    const depois = await reservarEnvioDeAcesso(BASE, { banco, agoraMs: () => 1_000_000 + TRAVA_DE_REENVIO_SEGUNDOS * 1000 + 1 });
    expect(depois).toBe("liberado");
  });

  it("AC-006.3: duas reservas simultâneas liberam só uma", async () => {
    const { banco } = bancoEmMemoria();
    const deps = { banco, agoraMs: () => 1_000_000 };
    const [a, b] = await Promise.all([reservarEnvioDeAcesso(BASE, deps), reservarEnvioDeAcesso(BASE, deps)]);
    expect([a, b].sort()).toEqual(["liberado", "travado"]);
  });

  it("a trava é por e-mail e ação: outra ação do mesmo e-mail não é travada", async () => {
    const { banco } = bancoEmMemoria();
    const deps = { banco, agoraMs: () => 1_000_000 };
    await reservarEnvioDeAcesso(BASE, deps);
    expect(await reservarEnvioDeAcesso({ ...BASE, acao: "signup" }, deps)).toBe("liberado");
  });

  it("erro do banco nunca bloqueia o usuário: libera sem trava", async () => {
    const quebrado: BancoDoContexto = {
      gravarContexto: async () => {
        throw new Error("fora do ar");
      },
      ultimoEnvio: async () => null,
      marcarEnvio: async () => true,
    };
    expect(await reservarEnvioDeAcesso(BASE, { banco: quebrado, agoraMs: () => 1 })).toBe("liberado");
  });

  it("marca embutida (sem linha no banco) não grava contexto e libera", async () => {
    const { banco, linhas } = bancoEmMemoria();
    const r = await reservarEnvioDeAcesso({ ...BASE, brandId: "padrao-embutida" }, { banco, agoraMs: () => 1 });
    expect(r).toBe("liberado");
    expect(linhas).toHaveLength(0);
  });
});
