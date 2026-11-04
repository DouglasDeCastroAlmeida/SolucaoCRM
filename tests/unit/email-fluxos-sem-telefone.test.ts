/**
 * Fatia 6 (T-040/T-041, AC-002.2): varredura dos fluxos que presumem TELEFONE, com um contato que
 * só tem e-mail. Cada caso diz o que a varredura achou: o que já estava certo fica provado aqui
 * para não regredir, e o que estava errado (a pré-liberação do canal) foi consertado. O WhatsApp
 * não muda: o último bloco prova que ele segue nascendo em pré-liberação.
 */
import { describe, expect, it, vi } from "vitest";

import { numeroPodeTestar, lerModoDeAcessoDaIa, metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import { montarEstadoDeElegibilidade } from "@/lib/ai/elegibilidade/gate";
import { salvarCaixa, TETO_DIARIO_PADRAO, INTERVALO_PADRAO_SEGUNDOS } from "@/lib/channels/email/caixa";
import { ORIGEM_DO_EMAIL, origemDoNegocioPeloCanal } from "@/lib/channels/origem-do-negocio";
import { encontrarContatosDuplicados, type ContatoParaDeduplicar } from "@/lib/contacts/duplicados";
import { ehContatoDoNumeroInterno, limparCacheDoNumeroInterno } from "@/lib/escalacao/numero-interno-de-aviso";

const ORG = "org-1";

/** Um banco que só anota o que foi inserido em `channel_sessions`. */
function bancoQueGrava() {
  const inseridos: Record<string, unknown>[] = [];
  const admin = {
    from: () => ({
      insert: (linha: Record<string, unknown>) => {
        inseridos.push(linha);
        return { select: () => ({ maybeSingle: async () => ({ data: { id: "cx-1" }, error: null }) }) };
      },
    }),
  };
  return { admin: admin as never, inseridos };
}

describe("AC-002.2 / pré-liberação do canal: contato sem telefone não fica de fora para sempre", () => {
  it("a regra de teste da pré-liberação é por TELEFONE: contato só com e-mail nunca passa", () => {
    // É a razão do conserto abaixo: nenhum número de teste casa com quem não tem telefone.
    expect(numeroPodeTestar(null, ["+5511999998888"])).toBe(false);
    const estado = montarEstadoDeElegibilidade({
      aiGate: "allowlist",
      aiGateMode: "pre_go_live",
      aiTestPhoneNumbers: ["+5511999998888"],
      contactPhoneNumber: null,
      orgStatus: "active",
      forceHuman: false,
      aiOptOut: false,
      assigneeKind: null,
      botSilencedUntil: null,
      aiAuthorizedAt: null,
      agora: new Date(),
      ttlMs: 1000,
    });
    expect(estado.preGoLiveAtivo).toBe(true);
    expect(estado.numeroDeTesteAutorizado).toBe(false);
  });

  it("T-041: a caixa de e-mail NASCE aberta (sem pré-liberação por telefone)", async () => {
    const { admin, inseridos } = bancoQueGrava();
    await salvarCaixa(admin, {
      organizationId: ORG,
      existente: null,
      endereco: "atendimento@exemplo.com",
      config: {
        usuario: "atendimento@exemplo.com",
        imap: { host: "imap.exemplo.com", porta: 993, seguranca: "ssl" },
        smtp: { host: "smtp.exemplo.com", porta: 465, seguranca: "ssl" },
        senha_ultimos4: "abcd",
        assinatura: null,
        teto_diario: TETO_DIARIO_PADRAO,
        intervalo_segundos: INTERVALO_PADRAO_SEGUNDOS,
      },
      segredoSemUsoCifrado: "x",
      userId: "u1",
      requestId: "r1",
    });

    expect(inseridos).toHaveLength(1);
    const metadata = inseridos[0]!.metadata;
    expect(lerModoDeAcessoDaIa(metadata)).toBe("open");
    expect(metadata).not.toHaveProperty("ai_test_phone_numbers");
    // Aberto NÃO quer dizer que a IA fala sozinha: neste canal ela só envia depois de aprovada.
  });

  it("regressão do WhatsApp: o canal por QR/oficial continua nascendo em pré-liberação", () => {
    const inicial = metadataInicialDoCanal();
    expect(lerModoDeAcessoDaIa(inicial)).toBe("pre_go_live");
    expect(inicial).toMatchObject({ ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: [] });
  });
});

describe("AC-002.2 / pós-entrada: o contato de e-mail não é confundido com o número interno de avisos", () => {
  function bancoDoAviso(contato: { phone_number: string | null; wa_lid: string | null }) {
    return {
      from: (tabela: string) => {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () =>
            tabela === "config_aviso_de_caso"
              ? {
                  data: {
                    telefone_destino: "+5511988887777",
                    destino_jid: "5511988887777@c.us",
                    resposta_whatsapp_habilitada: false,
                    channel_session_id: null,
                  },
                  error: null,
                }
              : { data: contato, error: null },
        };
        return q;
      },
    } as never;
  }

  it("com aviso configurado, quem só tem e-mail (sem telefone, sem @lid) NÃO é o número interno", async () => {
    limparCacheDoNumeroInterno();
    expect(await ehContatoDoNumeroInterno(bancoDoAviso({ phone_number: null, wa_lid: null }), ORG, "ct-email")).toBe(false);
  });

  it("controle: o contato que TEM o número do aviso continua sendo cortado", async () => {
    limparCacheDoNumeroInterno();
    expect(await ehContatoDoNumeroInterno(bancoDoAviso({ phone_number: "+5511988887777", wa_lid: null }), "org-2", "ct-wa")).toBe(true);
  });
});

describe("AC-002.2 / duplicidade e negócio", () => {
  const c = (id: string, over: Partial<ContatoParaDeduplicar>): ContatoParaDeduplicar =>
    ({
      id,
      name: null,
      display_name: null,
      email: null,
      email_normalized: null,
      phone_number: null,
      is_merged_into: null,
      is_anonymized: false,
      source_metadata: null,
      created_at: "2026-10-01T00:00:00Z",
      last_activity_at: null,
      ...over,
    }) as ContatoParaDeduplicar;

  it("dois contatos com o mesmo e-mail e nenhum telefone são duplicados (pelo e-mail)", () => {
    const grupos = encontrarContatosDuplicados([
      c("a", { email: "ana@exemplo.com" }),
      c("b", { email: "Ana@Exemplo.com" }),
      c("z", { email: "outra@exemplo.com" }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.motivos).toContain("email");
    expect(grupos[0]!.contatos.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("contatos sem telefone e sem e-mail nunca se juntam por 'ausência' de dado", () => {
    expect(encontrarContatosDuplicados([c("a", {}), c("b", {})])).toHaveLength(0);
  });

  it("o negócio nascido de um e-mail tem origem E-mail; o resto segue WhatsApp", () => {
    expect(origemDoNegocioPeloCanal("email")).toBe(ORIGEM_DO_EMAIL);
    expect(origemDoNegocioPeloCanal(undefined).source).toBe("whatsapp");
  });
});

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
