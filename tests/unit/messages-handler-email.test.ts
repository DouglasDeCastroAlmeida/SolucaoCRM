/**
 * O CAMINHO DE ENVIO DO E-MAIL, PELO HANDLER (mudança 005, Fatia 5).
 *
 * O adaptador de e-mail tem teste próprio (`lib/channels/email/adapter.test.ts`); aqui se prova
 * o que só o handler decide e o que a tela vê na linha de `messages`:
 *
 * - o endereço do contato chega ao adaptador (a coluna foi PEDIDA no select);
 * - teto/intervalo: a mensagem fica `queued` com a hora de retomada, sem tocar o transporte;
 * - envio proativo (campanha, follow-up, automação) é recusado por canal que só responde;
 * - a falha de envio vira `failed` com a causa em português, e o WhatsApp segue igual.
 *
 * O adaptador é substituído por um dublê: o que está em prova é o handler.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { SendMessageInput } from "@/lib/schemas";
import { colunasDoEmbed, criarDubleDoHandler } from "@/tests/helpers/duble-do-handler";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const CONTACT = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

const dubles = vi.hoisted(() => ({
  send: vi.fn(),
  admitir: vi.fn(),
  isConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/channels/email/adapter", () => ({
  EMAIL_NAO_CONFIGURADO: "email_not_configured",
  emailAdapter: {
    provider: "email",
    resolveRecipient: (i: { email?: string | null }) => (i.email ? i.email.toLowerCase() : null),
    isConfigured: () => dubles.isConfigured(),
    send: (e: unknown) => dubles.send(e),
    admitir: (i: unknown) => dubles.admitir(i),
    checkHealth: async () => ({ reachable: false, status: null, detail: "" }),
    codes: { notConfigured: "email_not_configured", sendFailed: "email_error", unknownError: "email_unknown" },
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://signed.example/a.pdf" }, error: null }) }) },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

type Row = Record<string, unknown>;

function conversa(provider: "email" | "waha" = "email"): Row {
  return {
    id: CONV,
    organization_id: ORG,
    contact_id: CONTACT,
    channel_session_id: SESSION,
    is_group: false,
    group_chat_id: null,
    provider_conversation_id: null,
    contacts: { phone_number: null, wa_identity: null, wa_lid: null, email: "Joao@Exemplo.com", is_blocked: false },
    channel_sessions: {
      provider,
      waha_session_name: provider === "waha" ? "default" : null,
      email_address: provider === "email" ? "atendimento@meunegocio.com" : null,
      status: "WORKING",
      archived_at: null,
    },
  };
}

const ctx: HandlerCtx = { organization_id: ORG, actor: { type: "user", id: USER }, requestId: "req-1" };
const texto = (over: Partial<SendMessageInput> = {}): SendMessageInput =>
  ({ conversation_id: CONV, type: "text", body: "Fica R$ 2.000.", ...over }) as SendMessageInput;

const dublê = (provider: "email" | "waha" = "email") =>
  criarDubleDoHandler({ conversation: conversa(provider), projetarConversa: true });

beforeEach(() => {
  dubles.send.mockReset().mockResolvedValue({ externalId: "<novo@meunegocio.com>" });
  dubles.admitir.mockReset().mockResolvedValue({ ok: true });
  dubles.isConfigured.mockReset().mockReturnValue(true);
});

describe("handler: resposta por e-mail", () => {
  it("AC-004.1: o e-mail do contato e a conversa chegam ao adaptador, e a mensagem sai `sent`", async () => {
    const { supabase, capturas } = dublê();
    const msg = await sendMessageHandler(supabase, ctx, texto());

    expect(msg.status).toBe("sent");
    expect(msg.external_id).toBe("<novo@meunegocio.com>");
    expect(dubles.send).toHaveBeenCalledTimes(1);
    expect(dubles.send.mock.calls[0]![0]).toMatchObject({
      organizationId: ORG,
      sessionRef: "atendimento@meunegocio.com",
      to: "joao@exemplo.com",
      conversationId: CONV,
      body: "Fica R$ 2.000.",
    });
    expect(capturas.selects.conversations!.every((s) => colunasDoEmbed(s, "contacts").includes("email"))).toBe(true);
  });

  it("AC-006.5: o servidor recusou, a mensagem fica `failed` com a causa em português", async () => {
    dubles.send.mockRejectedValue(new Error("O servidor de e-mail recusou a mensagem. Confira o endereço."));
    const { supabase } = dublê();
    const msg = await sendMessageHandler(supabase, ctx, texto());
    expect(msg.status).toBe("failed");
    expect(msg.error_code).toBe("email_error");
    expect(msg.error_message).toMatch(/recusou/);
  });

  it("AC-008.3: com o canal desligado nada é enviado e a mensagem espera na fila", async () => {
    dubles.isConfigured.mockReturnValue(false);
    const { supabase } = dublê();
    const msg = await sendMessageHandler(supabase, ctx, texto());
    expect(msg.status).toBe("queued");
    expect((msg.metadata as Row).queued_reason).toBe("email_not_configured");
    expect(dubles.send).not.toHaveBeenCalled();
  });
});

describe("handler: teto diário e intervalo", () => {
  it("AC-005.1: no teto a mensagem fica na fila com a hora de retomada, sem tocar o transporte", async () => {
    const volta = new Date("2026-11-05T03:00:00.000Z");
    dubles.admitir.mockResolvedValue({ ok: false, adiarAte: volta, motivo: "teto_diario" });
    const { supabase } = dublê();
    const msg = await sendMessageHandler(supabase, ctx, texto());

    expect(msg.status).toBe("queued");
    expect(msg.metadata).toMatchObject({ queued_reason: "teto_diario", adiar_ate: volta.toISOString() });
    expect(dubles.send).not.toHaveBeenCalled();
  });

  it("AC-005.2: dentro do intervalo mínimo a mensagem espera, com o motivo", async () => {
    dubles.admitir.mockResolvedValue({ ok: false, adiarAte: new Date("2026-11-04T15:00:20.000Z"), motivo: "intervalo" });
    const { supabase } = dublê();
    const msg = await sendMessageHandler(supabase, ctx, texto());
    expect(msg.status).toBe("queued");
    expect((msg.metadata as Row).queued_reason).toBe("intervalo");
    expect(dubles.send).not.toHaveBeenCalled();
  });

  it("a consulta de limite leva a organização do contexto e o endereço da caixa", async () => {
    const { supabase } = dublê();
    await sendMessageHandler(supabase, ctx, texto());
    expect(dubles.admitir.mock.calls[0]![0]).toMatchObject({ organizationId: ORG, sessionRef: "atendimento@meunegocio.com" });
  });
});

describe("handler: canal que só responde (envioEmLote)", () => {
  const proativo: HandlerCtx = {
    ...ctx,
    actor: { type: "webhook_source", id: "campaign:1" },
    proactiveContext: { organizationId: ORG, contactId: CONTACT },
  } as HandlerCtx;

  it("AC-005.4: envio proativo (campanha, follow-up, automação) é recusado e nada sai", async () => {
    const { supabase } = dublê();
    const msg = await sendMessageHandler(supabase, proativo, texto());
    expect(msg.status).toBe("failed");
    expect(msg.error_code).toBe("canal_sem_envio_em_lote");
    expect(dubles.send).not.toHaveBeenCalled();
  });
});
