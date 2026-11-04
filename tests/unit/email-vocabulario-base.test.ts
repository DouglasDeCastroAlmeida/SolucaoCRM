import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { KIND_LABEL } from "@/lib/ai/agent-inbox-copy";
import { POLITICAS_DE_AVISO } from "@/lib/ai/inbox-destino";
import { getAdapter } from "@/lib/channels";
import { ehCanalDeConversa } from "@/lib/channels/canais-de-conversa";
import { fonteDeTemplates } from "@/lib/channels/templates-fonte";
import { channelBrand } from "@/lib/channels/presentation";
import { CHANNEL_SESSION_REF_COLUMNS, resolveSessionRef } from "@/lib/channels/session-ref";
import { rotuloDoTipoDeCanal } from "@/lib/channels/conversa-nova";

/**
 * Mudança 005, Fatia 2 (T-007): o provider `email` entra nos pontos de decisão do seam
 * (adapter, session-ref, apresentação, canal da conversa, vocabulário da Central) e os
 * CHECKs do baseline concordam com o TypeScript. O lado do banco real é provado por
 * `tests/invariants/email-isolamento.test.ts`.
 */
describe("canal de e-mail — vocabulário e seam", () => {
  it("AC-008.4: o adaptador de e-mail endereça pelo e-mail do contato e recusa grupo e endereço inválido", () => {
    const a = getAdapter("email");
    const base = { isGroup: false, groupChatId: null, phoneNumber: null, waIdentity: null };
    expect(a.resolveRecipient({ ...base, email: "  Ana@Exemplo.COM " })).toBe("ana@exemplo.com");
    expect(a.resolveRecipient({ ...base, email: "sem-arroba" })).toBeNull();
    expect(a.resolveRecipient({ ...base, email: null })).toBeNull();
    expect(a.resolveRecipient({ ...base, isGroup: true, email: "ana@exemplo.com" })).toBeNull();
  });

  it("AC-008.4: enquanto o envio SMTP não existe, send desiste com o código de não configurado (vira queued)", async () => {
    const a = getAdapter("email");
    await expect(a.send({} as never)).rejects.toThrow(new RegExp(`^${a.codes.notConfigured}`));
  });

  it("AC-008.4: a caixa é endereçada pelo próprio endereço, e a coluna entra no select", () => {
    expect(resolveSessionRef({ provider: "email", email_address: "caixa@exemplo.com" })).toBe("caixa@exemplo.com");
    expect(CHANNEL_SESSION_REF_COLUMNS).toContain("email_address");
  });

  it("AC-008.4: apresentação, fonte de modelos, rótulo e canal de conversa conhecem o e-mail", () => {
    expect(channelBrand({ provider: "email" })).toBe("email");
    expect(fonteDeTemplates("email")).toBeNull();
    expect(rotuloDoTipoDeCanal("email")).toBe("E-mail");
    expect(ehCanalDeConversa("email")).toBe(true);
    expect(ehCanalDeConversa("telegram")).toBe(false);
  });

  it("AC-007.4: a Central tem rótulo e destino para os dois avisos novos da caixa", () => {
    expect(KIND_LABEL.email_senha_recusada).toMatch(/senha/);
    expect(KIND_LABEL.email_teto_atingido).toMatch(/limite/);
    expect(POLITICAS_DE_AVISO.email_senha_recusada.refs).toContain("channel_session");
    expect(POLITICAS_DE_AVISO.email_teto_atingido.refs).toContain("channel_session");
  });

  it("AC-009.2: o baseline e a migration aceitam o e-mail nos CHECKs, com endereço obrigatório", () => {
    const baseline = readFileSync("supabase/baseline.sql", "utf8");
    const mig = readFileSync("supabase/migrations/20261103100000_0727_canal_email_base.sql", "utf8");
    for (const sqlTexto of [baseline, mig]) {
      expect(sqlTexto).toMatch(/channel_sessions_provider_check[\s\S]{0,700}'email'::text/);
      expect(sqlTexto).toMatch(/provider = 'email'\s+and email_address is not null/);
      expect(sqlTexto).toMatch(/conversations_channel_check\s+check \(channel in \([^)]*'email'/);
      expect(sqlTexto).toContain("channel_sessions_email_address_ativo_unique");
      expect(sqlTexto).toContain("'email_senha_recusada'");
    }
    expect(mig).toMatch(/^-- manifest: /m);
  });
});
