/**
 * Fatia 6 (T-036/T-037, dívida 8 da Fatia 4): o anexo de um e-mail recebido é servido SEMPRE como
 * download. O tipo vem do remetente (pode ser text/html ou image/svg+xml); abrir isso inline no
 * domínio do storage seria deixar o e-mail de um desconhecido rodar numa página nossa.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mensagem: null as Record<string, unknown> | null,
  assinar: vi.fn(async (_c: string, _t: number, _o?: unknown) => ({
    data: { signedUrl: "https://storage.test/assinada" },
    error: null as { message: string } | null,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: h.mensagem, error: null }),
    };
    return { auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) }, from: () => q };
  },
}));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: async () => ({ idioma: "pt-BR" }) }));
vi.mock("@/lib/auth/require-role", () => ({ orgAtivaDaApi: async () => ({ ok: true, org: { orgId: "org-1" } }) }));
vi.mock("@/lib/channels", () => ({
  CHANNEL_SESSION_REF_COLUMNS: "id",
  DEFAULT_CHANNEL_PROVIDER: "waha",
  getAdapter: () => ({}),
  resolveSessionRef: () => ({}),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: h.assinar }) } }),
}));

import { GET } from "@/app/api/v1/messages/[id]/media/route";

const chamar = (q = "") =>
  GET(new NextRequest(`https://crm.test/api/v1/messages/m-1/media${q}`), { params: Promise.resolve({ id: "m-1" }) });

const EMAIL = {
  email: {
    assunto: "Contrato",
    anexos: [
      { nome: "contrato.pdf", tipo: "application/pdf", tamanho: 10, caminho: "org-1/c-1/m-1-0.pdf" },
      { nome: "pagina.html", tipo: "text/html", tamanho: 20, caminho: "org-1/c-1/m-1-1.html" },
      { nome: "falhou.png", tipo: "image/png", tamanho: 30, caminho: null },
      { nome: "alheio.png", tipo: "image/png", tamanho: 30, caminho: "outra-org/c-1/m-1-3.png" },
    ],
  },
};

beforeEach(() => {
  h.assinar.mockClear();
  h.mensagem = {
    id: "m-1",
    media_url: null,
    media_mime: "application/pdf",
    media_storage_path: "org-1/c-1/m-1-0.pdf",
    channel_session_id: "s1",
    metadata: EMAIL,
  };
});

describe("anexo de e-mail recebido: sempre download", () => {
  it("AC-008.5: mensagem de e-mail assina a URL forçando download com o nome do anexo", async () => {
    const r = await chamar();
    expect(r.status).toBe(302);
    expect(h.assinar).toHaveBeenCalledWith("org-1/c-1/m-1-0.pdf", 3600, { download: "contrato.pdf" });
  });

  it("?anexo=N serve o anexo escolhido, não só o primeiro (um HTML também sai como download)", async () => {
    await chamar("?anexo=1");
    expect(h.assinar).toHaveBeenCalledWith("org-1/c-1/m-1-1.html", 3600, { download: "pagina.html" });
  });

  it("anexo sem caminho (não foi guardado), índice fora da lista ou de outra organização é 404", async () => {
    for (const q of ["?anexo=2", "?anexo=9", "?anexo=-1", "?anexo=x", "?anexo=3"]) {
      const r = await chamar(q);
      expect(r.status, q).toBe(404);
    }
    expect(h.assinar).not.toHaveBeenCalled();
  });

  it("mensagem que NÃO é de e-mail continua como antes: assina sem forçar download", async () => {
    h.mensagem = { ...h.mensagem!, metadata: {} };
    await chamar();
    expect(h.assinar).toHaveBeenCalledWith("org-1/c-1/m-1-0.pdf", 3600);
  });

  it("caminho de OUTRA organização na coluna da mensagem, sem ?anexo, nunca é assinado (404)", async () => {
    h.mensagem = { ...h.mensagem!, media_storage_path: "outra-org/c-1/m-1-0.pdf", metadata: {} };
    const r = await chamar();
    expect(r.status).toBe(404);
    expect(h.assinar).not.toHaveBeenCalled();
  });
});
