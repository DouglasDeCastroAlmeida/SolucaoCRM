import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarBancoFalso, type BancoFalso } from "../../../tests/helpers/banco-falso-do-email";
import { criarEmailAdapter } from "./adapter";

const ORG = "org-a";
const CAIXA = "caixa-1";
const ENDERECO = "atendimento@meunegocio.com";
const AGORA = new Date("2026-11-04T15:00:00.000Z");

let banco: BancoFalso;
let enviados: Record<string, unknown>[];

const adaptador = (canalLigado = true) =>
  criarEmailAdapter({
    admin: () => banco.client,
    canalLigado: () => canalLigado,
    envio: {
      agora: () => AGORA,
      lerSenha: async () => "S3nh4",
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      criarSmtp: () => ({
        verify: async () => true,
        sendMail: async (m) => {
          enviados.push(m);
          return { accepted: ["joao@exemplo.com"], rejected: [], messageId: String(m.messageId) };
        },
        close: () => undefined,
      }),
    },
  });

beforeEach(() => {
  enviados = [];
  banco = criarBancoFalso({
    organizations: [{ id: ORG, timezone: "America/Sao_Paulo" }],
    channel_sessions: [
      {
        id: CAIXA,
        organization_id: ORG,
        provider: "email",
        email_address: ENDERECO,
        status: "WORKING",
        archived_at: null,
        email_config: {
          usuario: ENDERECO,
          imap: { host: "mail.meunegocio.com", porta: 993, seguranca: "ssl" },
          smtp: { host: "mail.meunegocio.com", porta: 465, seguranca: "ssl" },
          senha_ultimos4: "",
          assinatura: null,
          teto_diario: 2,
          intervalo_segundos: 30,
        },
      },
    ],
    email_sync_estado: [{ channel_session_id: CAIXA, organization_id: ORG, uidvalidity: "1", ultimo_uid: 1, falhas_seguidas: 0, pausa_motivo: null }],
  });
});

describe("adaptador de e-mail: destinatário", () => {
  it("o endereço vem do contato; telefone, grupo ou lixo não servem", () => {
    const a = adaptador();
    const base = { isGroup: false, groupChatId: null, phoneNumber: "+5511999990000", waIdentity: null };
    expect(a.resolveRecipient({ ...base, email: " Joao@Exemplo.com " })).toBe("joao@exemplo.com");
    expect(a.resolveRecipient({ ...base, email: null })).toBeNull();
    expect(a.resolveRecipient({ ...base, email: "sem arroba" })).toBeNull();
    expect(a.resolveRecipient({ ...base, isGroup: true, email: "a@b.com" })).toBeNull();
  });
});

describe("adaptador de e-mail: chave de rollback", () => {
  it("AC-008.3: com EMAIL_CANAL desligado o canal não está configurado e o handler não envia", () => {
    expect(adaptador(false).isConfigured()).toBe(false);
    expect(adaptador(true).isConfigured()).toBe(true);
  });
});

describe("adaptador de e-mail: envio", () => {
  it("AC-004.1: envia pela caixa da sessão e devolve o Message-ID como id externo", async () => {
    const a = adaptador();
    const antes = vi.fn().mockResolvedValue(undefined);
    const r = await a.send({ organizationId: ORG, sessionRef: ENDERECO, to: "joao@exemplo.com", kind: "text", body: "Olá", assunto: "Proposta", beforeSend: antes });
    expect(antes).toHaveBeenCalledTimes(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ from: ENDERECO, to: "joao@exemplo.com", subject: "Re: Proposta" });
    expect(r.externalId).toBe(enviados[0]!.messageId);
  });

  it("AC-006.5: falha vira erro com a causa em português, e erro de banco não vaza detalhe", async () => {
    const a = adaptador();
    await expect(a.send({ organizationId: "org-b", sessionRef: ENDERECO, to: "joao@exemplo.com", kind: "text", body: "Olá" })).rejects.toThrow(/não está mais conectada/);
    banco.falharEm("channel_sessions", "select", { message: "relation channel_sessions password=segredo" });
    const erro = await a.send({ organizationId: ORG, sessionRef: ENDERECO, to: "joao@exemplo.com", kind: "text", body: "Olá" }).catch((e: Error) => e);
    expect((erro as Error).message).not.toContain("segredo");
    expect((erro as Error).message).toMatch(/Não foi possível enviar/);
  });
});

describe("adaptador de e-mail: admitir (teto e intervalo)", () => {
  const admitir = (a = adaptador()) => a.admitir!({ organizationId: ORG, sessionRef: ENDERECO, agora: AGORA });

  it("AC-005.1: abaixo do teto admite", async () => {
    expect(await admitir()).toEqual({ ok: true });
  });

  it("AC-005.1: no teto adia para o dia seguinte e avisa a Central", async () => {
    banco.tabelas.email_envios_dia = [{ channel_session_id: CAIXA, organization_id: ORG, dia: "2026-11-04", quantidade: 2 }];
    const r = await admitir();
    expect(r).toMatchObject({ ok: false, motivo: "teto_diario" });
    expect((r as { adiarAte: Date }).adiarAte.toISOString()).toBe("2026-11-05T03:00:00.000Z");
    expect(banco.tabelas.agent_inbox_items).toHaveLength(1);
    expect(banco.tabelas.agent_inbox_items![0]).toMatchObject({ kind: "email_teto_atingido", ref_id: CAIXA });
  });

  it("AC-005.2: envio há 10 s e intervalo de 30 s adia 20 s", async () => {
    banco.tabelas.messages = [{ id: "m", organization_id: ORG, channel_session_id: CAIXA, direction: "outbound", status: "sent", sent_at: "2026-11-04T14:59:50.000Z" }];
    const r = await admitir();
    expect(r).toMatchObject({ ok: false, motivo: "intervalo" });
    expect((r as { adiarAte: Date }).adiarAte.toISOString()).toBe("2026-11-04T15:00:20.000Z");
  });

  it("falha ao consultar o limite adia em vez de arriscar a conta do cliente", async () => {
    banco.falharEm("email_envios_dia", "select", { message: "banco fora" });
    const r = await admitir();
    expect(r).toMatchObject({ ok: false });
    expect((r as { adiarAte: Date }).adiarAte.getTime()).toBeGreaterThan(AGORA.getTime());
  });
});
