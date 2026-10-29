/**
 * Mudança 009, REQ-001: a preferência do menu lateral é POR USUÁRIO e o padrão
 * (cookie ausente) é RECOLHIDO. O cookie antigo `sidebar_collapsed` não vale mais.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const definidos: Array<{ nome: string; valor: string; opcoes: Record<string, unknown> }> = [];
const guardados = new Map<string, string>();
let usuario: { id: string } | null = { id: "u-1" };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (nome: string, valor: string, opcoes: Record<string, unknown>) => {
      definidos.push({ nome, valor, opcoes });
    },
    get: (nome: string) => (guardados.has(nome) ? { value: guardados.get(nome) } : undefined),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario } }) } }),
}));

import { toggleSidebar } from "@/app/actions/shell/toggleSidebar";
import { lerSidebarRecolhida, nomeDoCookieDoMenu } from "@/lib/shell/sidebar-cookie";

const lerDoStore = (nome: string) => (guardados.has(nome) ? { value: guardados.get(nome)! } : undefined);

beforeEach(() => {
  definidos.length = 0;
  guardados.clear();
  usuario = { id: "u-1" };
});

describe("preferência do menu lateral por usuário", () => {
  it("AC-001.1: sem cookie do usuário, o menu nasce recolhido", () => {
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(true);
  });

  it("AC-001.1: o cookie antigo sem usuário não é mais lido", () => {
    guardados.set("sidebar_collapsed", "0");
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(true);
  });

  it("AC-001.3: expandir grava '0' no cookie do usuário e a leitura devolve expandido", async () => {
    await toggleSidebar(true);
    expect(definidos).toHaveLength(1);
    expect(definidos[0]!.nome).toBe(nomeDoCookieDoMenu("u-1"));
    expect(definidos[0]!.valor).toBe("0");
    expect(definidos[0]!.opcoes).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/" });
    guardados.set(definidos[0]!.nome, definidos[0]!.valor);
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(false);
  });

  it("AC-001.3: recolher grava '1' e a leitura devolve recolhido", async () => {
    await toggleSidebar(false);
    expect(definidos[0]!.valor).toBe("1");
    guardados.set(definidos[0]!.nome, definidos[0]!.valor);
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(true);
  });

  it("AC-001.4: a escolha de um usuário não altera a do outro", async () => {
    await toggleSidebar(true);
    guardados.set(definidos[0]!.nome, definidos[0]!.valor);
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(false);
    expect(lerSidebarRecolhida(lerDoStore, "u-2")).toBe(true);
    expect(nomeDoCookieDoMenu("u-1")).not.toBe(nomeDoCookieDoMenu("u-2"));
  });

  it("AC-001.4: sem usuário autenticado a ação não grava nada", async () => {
    usuario = null;
    await toggleSidebar(true);
    expect(definidos).toHaveLength(0);
  });
});
