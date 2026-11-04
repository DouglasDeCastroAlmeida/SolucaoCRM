import { describe, expect, it, vi } from "vitest";

import { criarBancoFalso } from "../../../tests/helpers/banco-falso-do-email";
import { removerCaixa } from "./remocao";

const ORG = "org-a";
const OUTRA = "org-b";

const caixa = (extra: Record<string, unknown> = {}) => ({
  id: "caixa-1",
  organization_id: ORG,
  provider: "email",
  email_address: "caixa@meunegocio.com",
  email_config: { usuario: "caixa@meunegocio.com", imap: { host: "i", porta: 993 }, smtp: { host: "s", porta: 465 }, senha_ultimos4: "1234" },
  status: "WORKING",
  archived_at: null,
  ...extra,
});

const cenario = () =>
  criarBancoFalso({
    channel_sessions: [caixa(), caixa({ id: "caixa-2", organization_id: OUTRA })],
    email_credenciais: [
      { channel_session_id: "caixa-1", organization_id: ORG, senha_encrypted: "x" },
      { channel_session_id: "caixa-2", organization_id: OUTRA, senha_encrypted: "y" },
    ],
    conversations: [{ id: "v-1", organization_id: ORG, channel_session_id: "caixa-1", channel: "email", status: "open" }],
    messages: [{ id: "m-1", organization_id: ORG, conversation_id: "v-1" }],
  });

describe("removerCaixa", () => {
  it("AC-008.2: arquiva a caixa e apaga a senha guardada, sem tocar conversas nem mensagens", async () => {
    const banco = cenario();
    const r = await removerCaixa(banco.client, ORG, "caixa-1", { resolverAviso: vi.fn(async () => undefined) });
    expect(r).toEqual({ resultado: "removida", endereco: "caixa@meunegocio.com" });
    const linha = banco.tabelas.channel_sessions!.find((c) => c.id === "caixa-1")!;
    expect(linha.archived_at).toEqual(expect.any(String));
    expect(linha.status).toBe("STOPPED");
    expect(banco.tabelas.email_credenciais!.map((c) => c.channel_session_id)).toEqual(["caixa-2"]);
    expect(banco.tabelas.conversations).toHaveLength(1);
    expect(banco.tabelas.conversations![0]!.status).toBe("open");
    expect(banco.tabelas.messages).toHaveLength(1);
  });

  it("AC-007.4: caixa de outra organizacao, ou ja removida, e nao_encontrada e nada muda", async () => {
    const banco = cenario();
    expect(await removerCaixa(banco.client, OUTRA, "caixa-1", { resolverAviso: vi.fn() })).toEqual({ resultado: "nao_encontrada" });
    expect(banco.tabelas.email_credenciais).toHaveLength(2);
    expect(banco.tabelas.channel_sessions!.every((c) => c.archived_at === null)).toBe(true);

    await removerCaixa(banco.client, ORG, "caixa-1", { resolverAviso: vi.fn(async () => undefined) });
    expect(await removerCaixa(banco.client, ORG, "caixa-1", { resolverAviso: vi.fn() })).toEqual({ resultado: "nao_encontrada" });
  });

  it("AC-008.2: fecha o aviso de senha recusada da caixa removida", async () => {
    const banco = cenario();
    const resolverAviso = vi.fn(async () => undefined);
    await removerCaixa(banco.client, ORG, "caixa-1", { resolverAviso });
    expect(resolverAviso).toHaveBeenCalledWith(banco.client, ORG, "caixa-1");
  });

  it("AC-008.2: se arquivar falha, lanca (a rota responde erro) e a caixa continua ativa", async () => {
    const banco = cenario();
    banco.falharEm("channel_sessions", "update", { message: "boom" });
    await expect(removerCaixa(banco.client, ORG, "caixa-1", { resolverAviso: vi.fn() })).rejects.toThrow(/email_caixa_remocao_failed/);
    expect(banco.tabelas.channel_sessions!.find((c) => c.id === "caixa-1")!.archived_at).toBeNull();
  });
});
