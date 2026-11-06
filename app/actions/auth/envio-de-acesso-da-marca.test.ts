/**
 * AC-006.3 do lado do APP: antes de pedir o e-mail ao GoTrue o app reserva o envio
 * (contexto da marca + trava de 60 s); e quando o gancho falha, o usuário recebe
 * um erro próprio ("tente de novo em instantes"), não o genérico nem o de
 * "e-mail não configurado".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MARCA_PADRAO_EMBUTIDA } from "@/lib/brands/tipos";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ from: vi.fn() })) }));
vi.mock("@/lib/audit", async (orig) => ({ ...(await orig<Record<string, unknown>>()), audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/politica-de-cadastro", () => ({ modoDeCadastro: vi.fn(async () => "aberto") }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: vi.fn(async () => false) }));
vi.mock("@/lib/email/estado", () => ({ semSmtpNaInstalacao: vi.fn(async () => false) }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  authRateLimited: vi.fn(async () => false),
}));
vi.mock("@/lib/env", async (orig) => {
  const real = await orig<{ env: Record<string, unknown> }>();
  return { ...real, env: { ...real.env, AUTH_HOOK_SECRET: "v1,whsec_dGVzdGU=" } };
});

const reservar = vi.hoisted(() => vi.fn());
const liberar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/contexto-de-email", () => ({ reservarEnvioDeAcesso: reservar, liberarEnvioDeAcesso: liberar }));
vi.mock("@/lib/branding/marca-do-pedido", () => ({
  marcaDoPedido: vi.fn(async () => ({
    brand: { ...MARCA_PADRAO_EMBUTIDA, id: "11111111-1111-4111-8111-111111111111", is_default: false, slug: "alfa", name: "Alfa", cadastro_aberto: true },
    domainKind: "subdominio",
  })),
}));

const resetDoProvedor = vi.fn();
const signUpDoProvedor = vi.fn();
let n = 0;
const email = () => `acesso-${++n}-${Date.now()}@exemplo.test`;

describe("envio de e-mail de acesso: reserva e falha do gancho", () => {
  beforeEach(() => {
    vi.resetModules();
    resetDoProvedor.mockReset();
    signUpDoProvedor.mockReset();
    reservar.mockReset();
    reservar.mockResolvedValue("liberado");
    liberar.mockReset();
    liberar.mockResolvedValue(undefined);
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) => (k === "x-forwarded-for" ? `203.0.113.${n % 250}` : k === "origin" ? "https://app.alfa.example" : null),
    } as never);
    vi.mocked(createClient).mockResolvedValue({
      auth: { resetPasswordForEmail: resetDoProvedor, signUp: signUpDoProvedor },
    } as never);
  });

  it("AC-006.3: recuperação — grava o contexto da marca ANTES de pedir o e-mail", async () => {
    resetDoProvedor.mockResolvedValue({ error: null });
    const { requestPasswordReset } = await import("./requestPasswordReset");
    const e = email();
    const res = await requestPasswordReset({ email: e });
    expect(res).toEqual({ ok: true });
    expect(reservar).toHaveBeenCalledWith({ email: e, acao: "recovery", brandId: "11111111-1111-4111-8111-111111111111" });
    expect(reservar.mock.invocationCallOrder[0]!).toBeLessThan(resetDoProvedor.mock.invocationCallOrder[0]!);
  });

  it("AC-006.3: recuperação — reenvio dentro de 60 s é travado e o GoTrue nem é chamado", async () => {
    reservar.mockResolvedValue("travado");
    const { requestPasswordReset } = await import("./requestPasswordReset");
    const res = await requestPasswordReset({ email: email() });
    expect(res).toEqual({ ok: false, error: "reenvio_bloqueado" });
    expect(resetDoProvedor).not.toHaveBeenCalled();
  });

  it("AC-006.3: recuperação — falha do gancho vira `email_nao_enviado`", async () => {
    resetDoProvedor.mockResolvedValue({ error: { message: "Error running hook URI: email_hook_send_failed", status: 500 } });
    const { requestPasswordReset } = await import("./requestPasswordReset");
    const res = await requestPasswordReset({ email: email() });
    expect(res).toEqual({ ok: false, error: "email_nao_enviado" });
  });

  it("AC-006.3: cadastro — reenvio dentro de 60 s é travado e o GoTrue nem é chamado", async () => {
    reservar.mockResolvedValue("travado");
    const { signUp } = await import("./signUp");
    const res = await signUp({
      org_name: "Plata", email: email(), password: "SenhaForte!2026", password_confirm: "SenhaForte!2026",
    });
    expect(res).toEqual({ ok: false, error: "reenvio_bloqueado" });
    expect(signUpDoProvedor).not.toHaveBeenCalled();
  });

  it("AC-006.3: cadastro — falha do gancho vira `email_nao_enviado`, não `email_indisponivel`", async () => {
    signUpDoProvedor.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Error sending confirmation email: email_hook_send_failed", status: 500 },
    });
    const { signUp } = await import("./signUp");
    const res = await signUp({
      org_name: "Plata", email: email(), password: "SenhaForte!2026", password_confirm: "SenhaForte!2026",
    });
    expect(res).toEqual({ ok: false, error: "email_nao_enviado" });
  });

  const MARCA = "11111111-1111-4111-8111-111111111111";
  const cadastro = () => ({ org_name: "Plata", email: email(), password: "SenhaForte!2026", password_confirm: "SenhaForte!2026" });
  const FALHA_DO_GANCHO = { message: "Error sending confirmation email: email_hook_send_failed", status: 500 };

  it("AC-003.1: falha de envio libera a reserva e a nova tentativa pede o e-mail outra vez", async () => {
    signUpDoProvedor.mockResolvedValueOnce({ data: { user: null, session: null }, error: FALHA_DO_GANCHO });
    signUpDoProvedor.mockResolvedValueOnce({ data: { user: { id: "u" }, session: null }, error: null });
    const { signUp } = await import("./signUp");
    const dados = cadastro();
    expect(await signUp(dados)).toEqual({ ok: false, error: "email_nao_enviado" });
    expect(liberar).toHaveBeenCalledWith({ email: dados.email, acao: "signup", brandId: MARCA });
    expect(await signUp(dados)).toEqual({ ok: true, sessao_ativa: false });
    expect(signUpDoProvedor).toHaveBeenCalledTimes(2);
  });

  it("AC-003.2: envio com sucesso não libera a reserva (o bloqueio de 60 s fica)", async () => {
    signUpDoProvedor.mockResolvedValue({ data: { user: { id: "u" }, session: null }, error: null });
    const { signUp } = await import("./signUp");
    expect(await signUp(cadastro())).toEqual({ ok: true, sessao_ativa: false });
    expect(liberar).not.toHaveBeenCalled();
  });

  it("AC-003.3: a reserva só é liberada depois que o provedor respondeu a falha, e só nela", async () => {
    signUpDoProvedor.mockResolvedValue({ data: { user: null, session: null }, error: FALHA_DO_GANCHO });
    const { signUp } = await import("./signUp");
    await signUp(cadastro());
    expect(liberar.mock.invocationCallOrder[0]!).toBeGreaterThan(signUpDoProvedor.mock.invocationCallOrder[0]!);
    // Outras falhas não liberam: não houve tentativa de envio que justifique outra.
    liberar.mockClear();
    signUpDoProvedor.mockResolvedValue({ data: { user: null, session: null }, error: { message: "Error sending confirmation email", status: 500 } });
    await signUp(cadastro());
    signUpDoProvedor.mockResolvedValue({ data: { user: null, session: null }, error: { message: "x", status: 429 } });
    await signUp(cadastro());
    expect(liberar).not.toHaveBeenCalled();
  });

  it("AC-003.4: em falha a resposta é `email_nao_enviado`, nunca `reenvio_bloqueado`", async () => {
    signUpDoProvedor.mockResolvedValue({ data: { user: null, session: null }, error: FALHA_DO_GANCHO });
    const { signUp } = await import("./signUp");
    expect(await signUp(cadastro())).toEqual({ ok: false, error: "email_nao_enviado" });
  });

  it("AC-003.5: e-mail que já tem conta (sucesso ofuscado) é igual ao sucesso e não libera nada", async () => {
    signUpDoProvedor.mockResolvedValue({ data: { user: { id: "u", identities: [] }, session: null }, error: null });
    const { signUp } = await import("./signUp");
    expect(await signUp(cadastro())).toEqual({ ok: true, sessao_ativa: false });
    expect(liberar).not.toHaveBeenCalled();
  });
});
