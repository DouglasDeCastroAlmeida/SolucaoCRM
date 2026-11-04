/**
 * Os consumidores das capacidades que o canal de e-mail declara (mudança 005, Fatia 5):
 * `envioEmLote` (AC-005.4) e `iniciaConversa` (AC-004.6). O canal que só responde não pode ser
 * escolhido para campanha, nem para abrir conversa com quem nunca escreveu; e o WhatsApp segue
 * exatamente como era.
 *
 * `iaSoComAprovacao` (AC-004.5) tem testes em `gate-ia-so-com-aprovacao.test.ts` e em
 * `lib/agent-engine/agent/resolve-turn-agent.test.ts`; o envio proativo em lote barrado no
 * handler, em `messages-handler-email.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import { sessaoProntaParaEnvio } from "@/lib/automation/start-conversation";
import { gravarPool, conexaoAceitaCampanha } from "@/lib/campanhas/pool-de-numeros";
import {
  aceitaEnvioEmLote,
  PROVIDERS_QUE_INICIAM_CONVERSA,
  podeIniciarConversa,
} from "@/lib/channels/capabilities";
import { candidatosParaConversaNova } from "@/lib/channels/conversa-nova";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";

const ORG = "org-a";

/** Um cliente de banco que só responde `channel_sessions`, anotando os filtros pedidos. */
function bancoDeSessoes(sessoes: Array<{ id: string; provider: string | null }>) {
  const filtros: Array<[string, unknown]> = [];
  const builder: Record<string, unknown> = {};
  const resultado = () => {
    let linhas = sessoes;
    for (const [c, v] of filtros) {
      if (c === "id" && typeof v === "string") linhas = linhas.filter((s) => s.id === v);
      if (c === "id:in") linhas = linhas.filter((s) => (v as string[]).includes(s.id));
      if (c === "provider:in") linhas = linhas.filter((s) => (v as string[]).includes(s.provider ?? "waha"));
    }
    return linhas;
  };
  Object.assign(builder, {
    select: () => builder,
    eq: (c: string, v: unknown) => (filtros.push([c, v]), builder),
    in: (c: string, v: unknown[]) => (filtros.push([`${c}:in`, v]), builder),
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: resultado()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: resultado(), error: null }).then(ok),
  });
  return {
    client: {
      from: () => {
        filtros.length = 0; // cada consulta nasce limpa
        return builder;
      },
    } as never,
    filtros,
  };
}

describe("capacidades como pergunta única", () => {
  it("AC-005.4: só o e-mail recusa lote; o resto do produto segue igual", () => {
    expect(aceitaEnvioEmLote("email")).toBe(false);
    for (const p of ["waha", "meta_cloud", "zernio", "zernio_social", "datafy"]) expect(aceitaEnvioEmLote(p), p).toBe(true);
    expect(aceitaEnvioEmLote(null)).toBe(true); // sem provider = default da coluna (WhatsApp)
    expect(aceitaEnvioEmLote("provider_novo_que_esta_imagem_nao_conhece")).toBe(false);
    expect(aceitaEnvioEmLote("wacalls")).toBe(false);
  });

  it("AC-004.6: só o e-mail recusa abrir conversa com quem nunca escreveu", () => {
    expect(podeIniciarConversa("email")).toBe(false);
    for (const p of ["waha", "meta_cloud", "zernio", "zernio_social", "datafy"]) expect(podeIniciarConversa(p), p).toBe(true);
    expect(PROVIDERS_QUE_INICIAM_CONVERSA).not.toContain("email");
    expect(PROVIDERS_QUE_INICIAM_CONVERSA).toContain("waha");
  });
});

describe("campanha e follow-up em lote (AC-005.4)", () => {
  it("conexaoAceitaCampanha: WhatsApp passa, e-mail é recusado, outra organização não existe", async () => {
    const { client } = bancoDeSessoes([
      { id: "s-wa", provider: "waha" },
      { id: "s-em", provider: "email" },
    ]);
    expect(await conexaoAceitaCampanha(client, ORG, "s-wa")).toBe("ok");
    expect(await conexaoAceitaCampanha(client, ORG, "s-em")).toBe("so_responde");
    expect(await conexaoAceitaCampanha(client, ORG, "s-fantasma")).toBe("nao_encontrada");
  });

  it("o pool de números da campanha não aceita caixa de e-mail e a devolve como recusada", async () => {
    const sessoes = [
      { id: "s-wa", provider: "waha" },
      { id: "s-em", provider: "email" },
    ];
    const base = bancoDeSessoes(sessoes);
    const insercoes: unknown[] = [];
    const client = {
      from: (tabela: string) => {
        if (tabela === "channel_sessions") return (base.client as { from: () => unknown }).from();
        const b: Record<string, unknown> = {};
        Object.assign(b, {
          select: () => b,
          eq: () => b,
          in: () => b,
          delete: () => b,
          insert: (linhas: unknown) => (insercoes.push(linhas), Promise.resolve({ error: null })),
          then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
        });
        return b;
      },
    } as never;
    const r = await gravarPool(client, { organizationId: ORG, campanhaId: "camp-1", principal: "s-principal", extras: ["s-wa", "s-em"] });
    expect(r).toMatchObject({ ok: false, recusados: ["s-em"], gravados: ["s-wa"] });
    expect(JSON.stringify(insercoes)).not.toContain("s-em");
  });
});

describe("abrir conversa com quem nunca escreveu (AC-004.6)", () => {
  it("a escolha automática de canal para abrir conversa nunca devolve a caixa de e-mail", async () => {
    const { client, filtros } = bancoDeSessoes([{ id: "s-em", provider: "email" }]);
    expect(await sessaoProntaParaEnvio(client, ORG)).toBeNull();
    const pedidos = filtros.find(([c]) => c === "provider:in")?.[1] as string[];
    expect(pedidos).toEqual([...PROVIDERS_QUE_INICIAM_CONVERSA]);
    expect(pedidos).not.toContain("email");
    expect(pedidos).toContain("waha");
  });

  it("o seletor da conversa nova não oferece a caixa de e-mail, nem com telefone gravado", () => {
    const canais = [
      { id: "wa", provider: "waha", phone_number: "+5511999990000", status: "WORKING" },
      { id: "em", provider: "email", phone_number: "+5511999990000", status: "WORKING" },
    ];
    expect(candidatosParaConversaNova(canais).map((c) => c.id)).toEqual(["wa"]);
  });

  it("abrir conversa num canal que só responde é recusado antes de qualquer contato ou conversa", async () => {
    const { client } = bancoDeSessoes([{ id: "s-em", provider: "email" }]);
    const rpc = vi.fn();
    await expect(
      openSharedContactConversation({ ...(client as object), rpc } as never, ORG, {
        channel_session_id: "s-em",
        contact_id: "c-1",
      }),
    ).rejects.toThrow("channel_cannot_start_conversation");
    expect(rpc).not.toHaveBeenCalled();
  });
});
