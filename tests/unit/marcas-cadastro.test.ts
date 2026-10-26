import { describe, expect, it } from "vitest";

import { decidirCadastroDaMarca } from "@/lib/auth/cadastro-da-marca";
import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

const marcaDeVertical: Brand = {
  ...MARCA_PADRAO_EMBUTIDA,
  id: "marca-corretor",
  slug: "corretor",
  name: "Corretor",
  is_default: false,
  cadastro_aberto: false,
};
const marcaAberta: Brand = { ...marcaDeVertical, cadastro_aberto: true };
const padraoReal: Brand = { ...MARCA_PADRAO_EMBUTIDA, id: "padrao-real", cadastro_aberto: false };

describe("AC-005.2: cadastro fechado responde por convite", () => {
  it("AC-005.2: marca com cadastro_aberto=false fecha o cadastro, mesmo com a instalação aberta", () => {
    expect(decidirCadastroDaMarca(marcaDeVertical, "aberto")).toBe("so_convite");
  });

  it("AC-005.2: instalação em só-convite fecha qualquer marca, aberta ou não", () => {
    expect(decidirCadastroDaMarca(marcaAberta, "so_convite")).toBe("so_convite");
  });
});

describe("AC-005.3: cadastro aberto", () => {
  it("AC-005.3: marca com cadastro_aberto=true segue o modo da instalação", () => {
    expect(decidirCadastroDaMarca(marcaAberta, "aberto")).toBe("aberto");
    expect(decidirCadastroDaMarca(marcaAberta, "com_aprovacao")).toBe("com_aprovacao");
  });
});

describe("AC-002.2: a marca padrão não muda o comportamento de hoje", () => {
  it("AC-002.2: marca padrão (embutida ou real) segue só o modo da instalação", () => {
    expect(decidirCadastroDaMarca(MARCA_PADRAO_EMBUTIDA, "aberto")).toBe("aberto");
    expect(decidirCadastroDaMarca(padraoReal, "aberto")).toBe("aberto");
    expect(decidirCadastroDaMarca(padraoReal, "com_aprovacao")).toBe("com_aprovacao");
  });
});

import { marcaDeOrigemDoCadastro } from "@/lib/auth/cadastro-da-marca";

describe("C2: a marca de origem do cadastro vale quando confirmar o e-mail em outro host", () => {
  const hostB: Brand = { ...marcaDeVertical, id: "marca-b", slug: "b" };
  const origemA: Brand = { ...marcaAberta, id: "marca-a", slug: "a" };

  it("AC-005.3: user_metadata.brand_id de marca ativa vence o host do link", async () => {
    const buscar = async (id: string) => (id === "marca-a" ? origemA : null);
    const r = await marcaDeOrigemDoCadastro({ brand_id: "marca-a" }, hostB, buscar);
    expect(r.id).toBe("marca-a");
  });

  it("AC-005.3: sem brand_id nos metadados, vale a marca do host", async () => {
    const r = await marcaDeOrigemDoCadastro({}, hostB, async () => origemA);
    expect(r.id).toBe("marca-b");
  });

  it("AC-005.3: marca de origem inexistente ou inativa, ou leitura que falha, cai no host", async () => {
    expect((await marcaDeOrigemDoCadastro({ brand_id: "x" }, hostB, async () => null)).id).toBe("marca-b");
    expect(
      (await marcaDeOrigemDoCadastro({ brand_id: "marca-a" }, hostB, async () => ({ ...origemA, status: "inactive" }))).id,
    ).toBe("marca-b");
    expect(
      (await marcaDeOrigemDoCadastro({ brand_id: "marca-a" }, hostB, async () => { throw new Error("x"); })).id,
    ).toBe("marca-b");
  });

  it("AC-005.3: com a chave off (marca embutida no host) a origem não é consultada", async () => {
    const r = await marcaDeOrigemDoCadastro({ brand_id: "marca-a" }, MARCA_PADRAO_EMBUTIDA, async () => origemA);
    expect(r.id).toBe(MARCA_PADRAO_EMBUTIDA.id);
  });
});
