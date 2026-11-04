import { describe, expect, it } from "vitest";

import { classificarAutomatico, type EntradaDaClassificacao } from "./automatico";

const base = (extra: Partial<EntradaDaClassificacao> = {}): EntradaDaClassificacao => ({
  remetente: "cliente@exemplo.com",
  enderecoDaCaixa: "caixa@meunegocio.com",
  cabecalhos: {},
  contatoConhecido: false,
  ...extra,
});

describe("classificarAutomatico", () => {
  it("AC-003.1: e-mail com cabecalho de lista de inscricao e ignorado com motivo", () => {
    const r = classificarAutomatico(base({ cabecalhos: { "list-unsubscribe": "<mailto:sair@x.com>" } }));
    expect(r).toEqual({ ignorar: true, motivo: "lista_de_inscricao" });
  });

  it("AC-003.1: Precedence bulk, list ou junk e envio em massa", () => {
    for (const valor of ["bulk", "list", "junk", "Bulk"]) {
      expect(classificarAutomatico(base({ cabecalhos: { precedence: valor } }))).toEqual({
        ignorar: true,
        motivo: "envio_em_massa",
      });
    }
  });

  it("AC-003.1: Auto-Submitted diferente de no e resposta automatica", () => {
    expect(classificarAutomatico(base({ cabecalhos: { "auto-submitted": "auto-replied" } }))).toEqual({
      ignorar: true,
      motivo: "resposta_automatica",
    });
    expect(classificarAutomatico(base({ cabecalhos: { "auto-submitted": "no" } }))).toEqual({ ignorar: false });
  });

  it("AC-003.2: remetente no-reply e ignorado", () => {
    for (const r of ["no-reply@loja.com", "noreply@loja.com", "do-not-reply@loja.com", "donotreply@loja.com"]) {
      expect(classificarAutomatico(base({ remetente: r }))).toEqual({ ignorar: true, motivo: "no_reply" });
    }
  });

  it("AC-003.2: aviso de falha de entrega e ignorado", () => {
    expect(classificarAutomatico(base({ remetente: "MAILER-DAEMON@mx.exemplo.com" }))).toEqual({
      ignorar: true,
      motivo: "falha_de_entrega",
    });
    expect(
      classificarAutomatico(base({ cabecalhos: { "content-type": "multipart/report; report-type=delivery-status; boundary=x" } })),
    ).toEqual({ ignorar: true, motivo: "falha_de_entrega" });
  });

  it("AC-003.5: contato conhecido nunca e ignorado, mesmo parecendo automatico", () => {
    const r = classificarAutomatico(
      base({ contatoConhecido: true, cabecalhos: { "list-unsubscribe": "<x>", precedence: "bulk" } }),
    );
    expect(r).toEqual({ ignorar: false });
  });

  it("AC-003.1: o e-mail que a propria caixa enviou (teste de conexao) e ignorado, mesmo que o remetente seja conhecido", () => {
    const r = classificarAutomatico(
      base({ remetente: "Caixa@MeuNegocio.com", contatoConhecido: true, cabecalhos: { "auto-submitted": "auto-generated" } }),
    );
    expect(r).toEqual({ ignorar: true, motivo: "propria_caixa" });
  });

  it("AC-003.1: e-mail comum de pessoa nao e ignorado", () => {
    expect(classificarAutomatico(base())).toEqual({ ignorar: false });
  });
});
