/**
 * Mudança 003, T-041 (AC-002.4, AC-010.5): a lógica da sonda de produção, sem rede (fetch injetado).
 */
import { describe, expect, it } from "vitest";

type Item = { id: string; passou: boolean; detalhe: string };
type Buscar = (u: string, o?: unknown) => Promise<unknown>;
type Lib = {
  compararComBase: (medido: Record<string, number>, base: unknown) => Item[];
  conferirSite: (url: string, buscar: Buscar) => Promise<Item[]>;
  rodar: (env: Record<string, string>, buscar: Buscar) => Promise<Item[]>;
};
const caminho = "../../scripts/sondas/sonda-producao-cobranca.mjs";
const carregar = () => import(/* @vite-ignore */ caminho) as Promise<Lib>;

const limpo = { marcas_ligadas: 0, suspensas_cobranca: 0, assinaturas_trial_com_cartao: 0, organizacoes_total: 3 };

function resp(status: number, contentRange?: string) {
  return { status, ok: status >= 200 && status < 300, headers: { get: (n: string) => (n === "content-range" ? (contentRange ?? null) : null) } };
}

describe("sonda de produção da cobrança", () => {
  it("AC-010.5: produção como antes (tudo zero, organizações iguais) passa em todos os itens", async () => {
    const { compararComBase } = await carregar();
    const itens = compararComBase(limpo, { organizacoes_total: 3 });
    expect(itens.map((i) => i.id)).toEqual(["B1", "B2", "B3", "B4"]);
    expect(itens.every((i) => i.passou)).toBe(true);
  });

  it("AC-010.5: marca ligada, suspensão por cobrança e assinatura em estado de cobrança reprovam", async () => {
    const { compararComBase } = await carregar();
    const itens = compararComBase({ ...limpo, marcas_ligadas: 1, suspensas_cobranca: 2, assinaturas_trial_com_cartao: 1 }, {});
    expect(itens.filter((i) => !i.passou).map((i) => i.id)).toEqual(["B1", "B2", "B3"]);
  });

  it("AC-010.5: organização a menos que a base reprova; sem número na base, B4 não existe", async () => {
    const { compararComBase } = await carregar();
    expect(compararComBase({ ...limpo, organizacoes_total: 2 }, { organizacoes_total: 3 }).find((i) => i.id === "B4")?.passou).toBe(false);
    expect(compararComBase(limpo, {}).some((i) => i.id === "B4")).toBe(false);
  });

  it("AC-002.4: '/' 200, '/app' 307 e health 200 passam; 404 reprova; não segue redirecionamento", async () => {
    const { conferirSite } = await carregar();
    const chamadas: Array<[string, unknown]> = [];
    const bom: Buscar = async (u, o) => {
      chamadas.push([u, o]);
      return resp(u.endsWith("/app") ? 307 : 200);
    };
    expect((await conferirSite("https://x.com.br/", bom)).every((i) => i.passou)).toBe(true);
    expect(chamadas[0]?.[0]).toBe("https://x.com.br/");
    expect(chamadas.every(([, o]) => (o as { redirect: string }).redirect === "manual")).toBe(true);
    const so404 = await conferirSite("https://x.com.br", async () => resp(404));
    expect(so404.every((i) => !i.passou)).toBe(true);
    const semRede = await conferirSite("https://x.com.br", async () => {
      throw new Error("rede");
    });
    expect(semRede[0]?.detalhe).toBe("sem resposta");
  });

  it("AC-010.5: lê as contagens pelo content-range, usa só GET e nunca imprime a chave", async () => {
    const { rodar } = await carregar();
    const metodos: string[] = [];
    const buscar: Buscar = async (u, o) => {
      metodos.push((o as { method: string }).method);
      if (u.includes("/rest/v1/")) return resp(200, u.endsWith("select=id&limit=1") ? "0-0/3" : "*/0");
      return resp(u.endsWith("/app") ? 307 : 200);
    };
    const itens = await rodar(
      { SONDA_URL_PRODUCAO: "https://x.com.br", SONDA_SUPABASE_URL: "https://b.supabase.co", SONDA_CHAVE_LEITURA: "segredo-xyz", SONDA_LINHA_DE_BASE: '{"organizacoes_total":3}' },
      buscar,
    );
    expect(itens.every((i) => i.passou)).toBe(true);
    expect(new Set(metodos)).toEqual(new Set(["GET"]));
    expect(JSON.stringify(itens)).not.toContain("segredo-xyz");
  });

  it("falha do banco vira item B0 reprovado, sem vazar a chave", async () => {
    const { rodar } = await carregar();
    const buscar: Buscar = async (u) => (u.includes("/rest/v1/") ? resp(401) : resp(u.endsWith("/app") ? 307 : 200));
    const itens = await rodar({ SONDA_URL_PRODUCAO: "https://x.com.br", SONDA_SUPABASE_URL: "https://b.supabase.co", SONDA_CHAVE_LEITURA: "segredo-xyz" }, buscar);
    expect(itens.find((i) => i.id === "B0")?.passou).toBe(false);
    expect(JSON.stringify(itens)).not.toContain("segredo-xyz");
  });
});
