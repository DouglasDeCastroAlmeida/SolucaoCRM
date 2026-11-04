import { describe, expect, it, vi } from "vitest";

import { criarBancoFalso } from "../../../tests/helpers/banco-falso-do-email";
import { avisarSenhaRecusada } from "./avisos";

const ENTRADA = { organizationId: "org-a", caixaId: "caixa-1", endereco: "caixa@meunegocio.com" };

describe("avisarSenhaRecusada", () => {
  it("AC-006.1: abre o item na Central e manda e-mail a cada administrador, sem a senha", async () => {
    const banco = criarBancoFalso({ organizations: [{ id: "org-a", locale: "pt-BR" }] });
    const enviar = vi.fn().mockResolvedValue({ ok: true });
    const r = await avisarSenhaRecusada(banco.client, ENTRADA, {
      enviar,
      emailsDosAdmins: async () => ["dono@meunegocio.com", "gerente@meunegocio.com"],
    });
    expect(r).toEqual({ central: true, emails: 2 });
    expect(banco.tabelas.agent_inbox_items).toHaveLength(1);
    expect(banco.tabelas.agent_inbox_items![0]).toMatchObject({
      organization_id: "org-a",
      kind: "email_senha_recusada",
      ref_kind: "channel_session",
      ref_id: "caixa-1",
    });
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls[0]![0].text).toContain("caixa@meunegocio.com");
  });

  it("AC-006.1: nao abre um segundo item enquanto o primeiro esta aberto", async () => {
    const banco = criarBancoFalso({
      organizations: [{ id: "org-a", locale: "pt-BR" }],
      agent_inbox_items: [{ organization_id: "org-a", kind: "email_senha_recusada", ref_id: "caixa-1", status: "open" }],
    });
    await avisarSenhaRecusada(banco.client, ENTRADA, { enviar: async () => ({ ok: true }), emailsDosAdmins: async () => [] });
    expect(banco.tabelas.agent_inbox_items).toHaveLength(1);
  });

  it("AC-006.1: e-mail que nao sai nao desfaz o aviso na Central nem lanca", async () => {
    const banco = criarBancoFalso({ organizations: [{ id: "org-a", locale: "pt-BR" }] });
    const r = await avisarSenhaRecusada(banco.client, ENTRADA, {
      enviar: async () => {
        throw new Error("smtp fora");
      },
      emailsDosAdmins: async () => ["dono@meunegocio.com"],
    });
    expect(r).toEqual({ central: true, emails: 0 });
  });
});
