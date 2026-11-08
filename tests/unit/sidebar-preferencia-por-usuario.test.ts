/**
 * Mudança 009, REQ-001: a preferência do menu lateral é POR USUÁRIO e o padrão
 * (cookie ausente) é RECOLHIDO. O cookie antigo `sidebar_collapsed` não vale mais.
 */
import { beforeEach, describe, expect, it } from "vitest";

const guardados = new Map<string, string>();

import { lerSidebarRecolhida, nomeDoCookieDoMenu } from "@/lib/shell/sidebar-cookie";

const lerDoStore = (nome: string) => (guardados.has(nome) ? { value: guardados.get(nome)! } : undefined);

beforeEach(() => {
  guardados.clear();
});

describe("preferência do menu lateral por usuário", () => {
  it("AC-001.1: sem cookie do usuário, o menu nasce recolhido", () => {
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(true);
  });

  it("AC-001.1: o cookie antigo sem usuário não é mais lido", () => {
    guardados.set("sidebar_collapsed", "0");
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(true);
  });

  it("AC-001.3: o cookie '0' do usuário devolve expandido e o '1' devolve recolhido", () => {
    guardados.set(nomeDoCookieDoMenu("u-1"), "0");
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(false);
    guardados.set(nomeDoCookieDoMenu("u-1"), "1");
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(true);
  });

  it("AC-001.4: a escolha de um usuário não altera a do outro", () => {
    guardados.set(nomeDoCookieDoMenu("u-1"), "0");
    expect(lerSidebarRecolhida(lerDoStore, "u-1")).toBe(false);
    expect(lerSidebarRecolhida(lerDoStore, "u-2")).toBe(true);
    expect(nomeDoCookieDoMenu("u-1")).not.toBe(nomeDoCookieDoMenu("u-2"));
  });
});
