import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { camadaDaMarca } from "@/lib/branding/camada-de-marca";
import { resolverMarcaDaOrganizacao } from "@/lib/branding/organizacao";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import { camadaDaInstalacao, camadaDoAmbiente, resolverMarca } from "@/lib/branding/resolve";
import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

const marca = (patch: Partial<Brand> = {}): Brand => ({
  ...MARCA_PADRAO_EMBUTIDA,
  is_default: false,
  name: "Corretor",
  app_name: "Corretor Pro",
  accent_hex: "#0a5c36",
  ...patch,
});
const instalacao = { app_name: "Instalação", accent_hex: "#2563eb" };
const ambiente = { APP_NAME: "Ambiente", APP_ACCENT_HEX: "#aa3300" };
const orgSettings = { branding: { app_name: "Clínica da Ana", accent_hex: "#7c3aed" } };

describe("precedência das camadas", () => {
  it("AC-005.5: organização vence a marca, a marca vence a instalação, a instalação vence o ambiente", () => {
    const m = resolverMarcaDaOrganizacao(orgSettings, instalacao, ambiente, marca());
    expect(m.name).toBe("Clínica da Ana");
    expect(m.origens.nome).toBe("organizacao");

    const semOrg = resolverMarcaDaOrganizacao(null, instalacao, ambiente, marca());
    expect(semOrg.name).toBe("Corretor Pro");
    expect(semOrg.origens.nome).toBe("marca");
    expect(semOrg.origens.cor).toBe("marca");

    const semMarca = resolverMarcaDaOrganizacao(null, instalacao, ambiente, null);
    expect(semMarca.origens.nome).toBe("banco");

    const soAmbiente = resolverMarcaDaOrganizacao(null, null, ambiente, null);
    expect(soAmbiente.origens.nome).toBe("env");
  });

  it("AC-005.5: marca padrão (campos nulos) herda da instalação, não copia", () => {
    const padrao = resolverMarcaDaOrganizacao(null, instalacao, ambiente, MARCA_PADRAO_EMBUTIDA);
    const antes = resolverMarcaDaOrganizacao(null, instalacao, ambiente);
    expect(padrao.name).toBe(antes.name);
    expect(padrao.origens).toEqual(antes.origens);
  });

  it("AC-005.5: permite_personalizacao = false faz a marca valer por cima da organização", () => {
    const m = resolverMarcaDaOrganizacao(
      orgSettings,
      instalacao,
      ambiente,
      marca({ permite_personalizacao: false }),
    );
    expect(m.name).toBe("Corretor Pro");
    expect(m.origens.nome).toBe("marca");
  });

  it("AC-005.5: antes do login só a marca entra, sem camada da organização", () => {
    const m = resolverMarca(
      [camadaDaMarca(marca()), camadaDaInstalacao(instalacao), camadaDoAmbiente(ambiente)],
      REGUA_DO_PRODUTO,
    );
    expect(m.origens.nome).toBe("marca");
  });

  it("AC-005.5: camada de marca nula não fala de nada e não apaga a de baixo", () => {
    const m = resolverMarca([camadaDaMarca(null), camadaDaInstalacao(instalacao)], REGUA_DO_PRODUTO);
    expect(m.name).toBe("Instalação");
  });
});

describe("PDF de LGPD sem marca", () => {
  it("AC-005.6: o renderizador do PDF não importa nada da camada de marca", () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), "lib/lgpd/pdf-renderer.tsx"), "utf8");
    expect(fonte).not.toMatch(/from\s+["']@\/lib\/(branding|brands)/);
    expect(fonte).not.toMatch(/marcaDoHost|marcaDaSaida|camadaDaMarca/);
  });
});
