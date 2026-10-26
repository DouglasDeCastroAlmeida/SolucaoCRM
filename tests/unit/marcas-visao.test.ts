import { describe, expect, it } from "vitest";

import {
  filtrarOrgsDaMarca,
  orgPertenceAMarca,
  orgVisivelOuNula,
} from "@/lib/brands/visao";
import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

const base: Brand = { ...MARCA_PADRAO_EMBUTIDA };
const marcaA: Brand = { ...base, id: "marca-a", slug: "a", name: "A", is_default: false };
const padraoReal: Brand = { ...base, id: "marca-padrao-real", is_default: true };

const usuario = { is_platform_admin: false };
const admin = { is_platform_admin: true };

const orgA = { organization_id: "org-a", brand_id: "marca-a" };
const orgB = { organization_id: "org-b", brand_id: "marca-b" };
const orgSem = { organization_id: "org-sem", brand_id: null };

describe("AC-004.1: orgPertenceAMarca e o filtro do seletor", () => {
  it("AC-004.1: organização da marca do host pertence", () => {
    expect(orgPertenceAMarca(orgA, marcaA, usuario)).toBe(true);
  });

  it("AC-004.1: organização de outra marca não pertence", () => {
    expect(orgPertenceAMarca(orgB, marcaA, usuario)).toBe(false);
  });

  it("AC-004.1: brand_id nulo conta como marca padrão e só pertence a ela", () => {
    expect(orgPertenceAMarca(orgSem, padraoReal, usuario)).toBe(true);
    expect(orgPertenceAMarca(orgSem, marcaA, usuario)).toBe(false);
  });

  it("AC-004.1: admin da plataforma enxerga organizações de qualquer marca", () => {
    expect(orgPertenceAMarca(orgB, marcaA, admin)).toBe(true);
  });

  it("AC-004.1: marca padrão embutida (chave off ou banco fora) não filtra nada", () => {
    expect(orgPertenceAMarca(orgB, MARCA_PADRAO_EMBUTIDA, usuario)).toBe(true);
  });

  it("AC-004.1: quem tem organizações nas marcas A e B entrando por A vê só as de A", () => {
    const lista = filtrarOrgsDaMarca([orgA, orgB], marcaA, usuario);
    expect(lista.map((o) => o.organization_id)).toEqual(["org-a"]);
  });
});

describe("AC-004.2: link de organização de outra marca", () => {
  it("AC-004.2: organização de outra marca devolve nulo, igual a uma que não existe", () => {
    const orgs = [orgA, orgB];
    const deOutraMarca = orgVisivelOuNula("org-b", orgs, marcaA, usuario);
    const inexistente = orgVisivelOuNula("org-que-nao-existe", orgs, marcaA, usuario);
    expect(deOutraMarca).toBeNull();
    expect(deOutraMarca).toEqual(inexistente);
  });

  it("AC-004.2: organização da própria marca é devolvida", () => {
    expect(orgVisivelOuNula("org-a", [orgA, orgB], marcaA, usuario)).toEqual(orgA);
  });
});
