import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ buscar: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { TLS_ASK_TOKEN: "tok-rota-123456", VPS_PUBLIC_IP: "203.0.113.10" } }));
vi.mock("@/lib/brands/repositorio", () => ({ buscarMarcaDoHost: h.buscar }));
vi.mock("node:dns/promises", () => {
  const resolve4 = vi.fn(async () => ["203.0.113.10"]);
  return { resolve4, default: { resolve4 } };
});

import { GET } from "@/app/api/internal/tls-ask/route";

const req = (qs: string, headers: Record<string, string> = {}) =>
  new Request(`http://app:3000/api/internal/tls-ask?${qs}`, { headers }) as unknown as Parameters<typeof GET>[0];

describe("rota /api/internal/tls-ask", () => {
  beforeEach(() => {
    h.buscar.mockReset();
    h.buscar.mockResolvedValue({ brand: { status: "active" }, domainKind: "proprio" });
  });

  it("AC-007.1: 200 para pergunta válida", async () => {
    const r = await GET(req("domain=rota.cliente.com&token=tok-rota-123456"));
    expect(r.status).toBe(200);
  });

  it("AC-007.3: recusa sem token e com x-forwarded-for", async () => {
    expect((await GET(req("domain=rota.cliente.com"))).status).toBe(403);
    const r = await GET(req("domain=rota.cliente.com&token=tok-rota-123456", { "x-forwarded-for": "1.2.3.4" }));
    expect(r.status).toBe(403);
  });

  it("AC-007.3: o proxy não decide o caminho (autenticação é o token na rota)", async () => {
    const { PUBLIC_PATHS } = await import("@/lib/auth/public-paths");
    expect(PUBLIC_PATHS.some((re) => re.test("/api/internal/tls-ask"))).toBe(true);
  });

  it("AC-007.2: erro de banco => 503 (nunca aprova)", async () => {
    h.buscar.mockRejectedValue(new Error("db"));
    expect((await GET(req("domain=erro.cliente.com&token=tok-rota-123456"))).status).toBe(503);
  });
});
