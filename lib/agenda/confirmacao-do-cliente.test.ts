import { describe, expect, it } from "vitest";

import {
  JANELA_DA_RESPOSTA_MS,
  classificarRespostaDoCliente,
  decidirRespostaDoCliente,
  type CompromissoCandidato,
} from "@/lib/agenda/confirmacao-do-cliente";

const AGORA = new Date("2026-10-27T12:00:00.000Z");
const H = 3_600_000;

function cand(over: Partial<CompromissoCandidato> & { id: string }): CompromissoCandidato {
  return {
    comeca: new Date(AGORA.getTime() + 24 * H),
    estado: "pending",
    clientConfirmedAt: null,
    clientRescheduleRequestedAt: null,
    ultimoLembreteEm: new Date(AGORA.getTime() - 1 * H),
    ...over,
  };
}

describe("AC-002.2: o que vale como confirmação", () => {
  it.each([
    "1",
    "sim",
    "Sim",
    "SIM",
    "confirmo",
    "Confirmo!",
    "ok",
    "OK.",
    "confirmado",
    "Confirmado!!",
    "  sim  ",
    "sim 👍",
    "1️⃣",
    "Sím",
    "ok!!! 😀",
  ])("AC-002.2: %j é confirmação", (texto) => {
    expect(classificarRespostaDoCliente(texto)).toBe("confirmar");
  });

  it.each(["", "   ", "1 hora", "sim, mas posso mudar?", "quero 1 pizza", "talvez", "okay", "10", "👍", "não", null, undefined])(
    "AC-002.2: %j NÃO é confirmação (a mensagem inteira tem de ser a palavra)",
    (texto) => {
      expect(classificarRespostaDoCliente(texto as string | null)).toBeNull();
    },
  );

  it.each(["2", "cancelar", "Cancelar!", "não vou", "nao vou", "NÃO VOU 😢", "remarcar", "Remarcar."])(
    "AC-003.1: %j é pedido de remarcar",
    (texto) => {
      expect(classificarRespostaDoCliente(texto)).toBe("remarcar");
    },
  );
});

describe("AC-002.3: só com lembrete recente e compromisso futuro", () => {
  it("AC-002.3: lembrete de 1 h atrás, compromisso futuro pendente: confirma", () => {
    expect(decidirRespostaDoCliente({ texto: "1", agora: AGORA, candidatos: [cand({ id: "a" })] })).toEqual({
      tipo: "confirmar",
      compromissoId: "a",
    });
  });

  it("AC-002.3: exatamente 48 h depois do lembrete ainda vale", () => {
    const c = cand({ id: "a", ultimoLembreteEm: new Date(AGORA.getTime() - JANELA_DA_RESPOSTA_MS) });
    expect(decidirRespostaDoCliente({ texto: "sim", agora: AGORA, candidatos: [c] }).tipo).toBe("confirmar");
  });

  it("AC-002.4: lembrete de 48 h e 1 ms atrás: segue o fluxo normal", () => {
    const c = cand({ id: "a", ultimoLembreteEm: new Date(AGORA.getTime() - JANELA_DA_RESPOSTA_MS - 1) });
    expect(decidirRespostaDoCliente({ texto: "1", agora: AGORA, candidatos: [c] })).toEqual({ tipo: "nada" });
  });

  it("AC-002.4: sem lembrete enviado: segue o fluxo normal", () => {
    expect(
      decidirRespostaDoCliente({ texto: "1", agora: AGORA, candidatos: [cand({ id: "a", ultimoLembreteEm: null })] }),
    ).toEqual({ tipo: "nada" });
  });

  it("AC-002.4: depois do horário do compromisso: segue o fluxo normal", () => {
    const c = cand({ id: "a", comeca: new Date(AGORA.getTime() - 60_000) });
    expect(decidirRespostaDoCliente({ texto: "1", agora: AGORA, candidatos: [c] })).toEqual({ tipo: "nada" });
  });

  it("AC-002.4: compromisso cancelado ou concluído não é candidato", () => {
    for (const estado of ["cancelled", "completed", "no_show"]) {
      expect(decidirRespostaDoCliente({ texto: "1", agora: AGORA, candidatos: [cand({ id: "a", estado })] })).toEqual({
        tipo: "nada",
      });
    }
  });

  it("AC-002.3: compromisso confirmado pela equipe (status confirmed) ainda aceita a do cliente", () => {
    expect(
      decidirRespostaDoCliente({ texto: "1", agora: AGORA, candidatos: [cand({ id: "a", estado: "confirmed" })] }).tipo,
    ).toBe("confirmar");
  });

  it("AC-002.4: mensagem que não é resposta: nada", () => {
    expect(decidirRespostaDoCliente({ texto: "oi, tudo bem?", agora: AGORA, candidatos: [cand({ id: "a" })] })).toEqual({
      tipo: "nada",
    });
  });
});

describe("AC-002.5: repetida não muda nada", () => {
  it("AC-002.5: já confirmado pelo cliente: ja_confirmado", () => {
    const c = cand({ id: "a", clientConfirmedAt: new Date(AGORA.getTime() - H) });
    expect(decidirRespostaDoCliente({ texto: "1", agora: AGORA, candidatos: [c] })).toEqual({
      tipo: "ja_confirmado",
      compromissoId: "a",
    });
  });

  it("AC-002.5: um confirmado e outro pendente: vale o pendente", () => {
    const confirmado = cand({
      id: "a",
      clientConfirmedAt: new Date(AGORA.getTime() - H),
      comeca: new Date(AGORA.getTime() + 2 * H),
    });
    const pendente = cand({ id: "b", comeca: new Date(AGORA.getTime() + 30 * H) });
    expect(decidirRespostaDoCliente({ texto: "1", agora: AGORA, candidatos: [confirmado, pendente] })).toEqual({
      tipo: "confirmar",
      compromissoId: "b",
    });
  });
});

describe("AC-002.6: dois compromissos valem para o mais próximo", () => {
  it("AC-002.6: escolhe o de início mais cedo, qualquer que seja a ordem da lista", () => {
    const longe = cand({ id: "longe", comeca: new Date(AGORA.getTime() + 40 * H) });
    const perto = cand({ id: "perto", comeca: new Date(AGORA.getTime() + 20 * H) });
    const esperado = { tipo: "confirmar", compromissoId: "perto" };
    expect(decidirRespostaDoCliente({ texto: "sim", agora: AGORA, candidatos: [longe, perto] })).toEqual(esperado);
    expect(decidirRespostaDoCliente({ texto: "sim", agora: AGORA, candidatos: [perto, longe] })).toEqual(esperado);
  });

  it("AC-002.6: o mais próximo SEM lembrete recente não entra; vale o outro", () => {
    const perto = cand({ id: "perto", comeca: new Date(AGORA.getTime() + 20 * H), ultimoLembreteEm: null });
    const longe = cand({ id: "longe", comeca: new Date(AGORA.getTime() + 40 * H) });
    expect(decidirRespostaDoCliente({ texto: "1", agora: AGORA, candidatos: [perto, longe] })).toEqual({
      tipo: "confirmar",
      compromissoId: "longe",
    });
  });
});

describe("AC-003.1: remarcar é classificado aqui", () => {
  it("AC-003.1: '2' com lembrete recente vira remarcar do mais próximo", () => {
    expect(decidirRespostaDoCliente({ texto: "2", agora: AGORA, candidatos: [cand({ id: "a" })] })).toEqual({
      tipo: "remarcar",
      compromissoId: "a",
    });
  });

  it("AC-003.1: pedido repetido (já marcado) não gera outro", () => {
    const c = cand({ id: "a", clientRescheduleRequestedAt: new Date(AGORA.getTime() - H) });
    expect(decidirRespostaDoCliente({ texto: "remarcar", agora: AGORA, candidatos: [c] })).toEqual({
      tipo: "ja_confirmado",
      compromissoId: "a",
    });
  });

  it("AC-003.1: '2' sem lembrete recente: nada", () => {
    expect(
      decidirRespostaDoCliente({ texto: "2", agora: AGORA, candidatos: [cand({ id: "a", ultimoLembreteEm: null })] }),
    ).toEqual({ tipo: "nada" });
  });
});
