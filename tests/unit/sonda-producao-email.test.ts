/**
 * Mudança 005, T-045 (AC-009.4): a lógica da sonda de produção do canal de e-mail, sem rede nem SSH.
 * Produção sem nenhuma caixa conectada: resultado igual ao de antes e nenhuma conexão de e-mail do worker.
 */
import { describe, expect, it } from "vitest";

type Item = { id: string; passou: boolean; detalhe: string };
type Buscar = (u: string, o?: unknown) => Promise<unknown>;
type Lib = {
  compararComBase: (medido: Record<string, number | boolean>, base: unknown) => Item[];
  conferirSite: (url: string, buscar: Buscar) => Promise<Item[]>;
};
const caminho = "../../scripts/sondas/sonda-producao-email.mjs";
const carregar = () => import(/* @vite-ignore */ caminho) as Promise<Lib>;

const limpo = {
  caixas_email: 0,
  conversas_email: 0,
  ignorados: 0,
  remetentes_ignorados: 0,
  canais_ativos_nao_email: 1,
  organizacoes_total: 1,
  conexoes_de_email_no_worker: 0,
};

describe("sonda de produção do canal de e-mail", () => {
  it("AC-009.4: produção sem caixa, igual à base e sem conexão de e-mail passa em todos os itens", async () => {
    const { compararComBase } = await carregar();
    const itens = compararComBase(limpo, { canais_ativos_nao_email: 1, organizacoes_total: 1 });
    expect(itens.map((i) => i.id)).toEqual(["E1", "E2", "E3", "E4", "E5", "E6"]);
    expect(itens.every((i) => i.passou)).toBe(true);
  });

  it("AC-009.4: caixa, conversa, ignorado ou conexão do worker reprovam", async () => {
    const { compararComBase } = await carregar();
    const itens = compararComBase(
      { ...limpo, caixas_email: 1, conversas_email: 2, ignorados: 1, remetentes_ignorados: 1, conexoes_de_email_no_worker: 3 },
      {},
    );
    expect(itens.filter((i) => !i.passou).map((i) => i.id)).toEqual(["E1", "E2", "E3", "E6"]);
  });

  it("AC-009.4: canal de outro tipo a menos que a base (o resto do produto mudou) reprova", async () => {
    const { compararComBase } = await carregar();
    const itens = compararComBase({ ...limpo, canais_ativos_nao_email: 0 }, { canais_ativos_nao_email: 1 });
    expect(itens.find((i) => i.id === "E4")?.passou).toBe(false);
  });

  it("AC-009.4: organização a menos que a base reprova; sem número na base o item não existe", async () => {
    const { compararComBase } = await carregar();
    expect(compararComBase({ ...limpo, organizacoes_total: 0 }, { organizacoes_total: 1 }).find((i) => i.id === "E5")?.passou).toBe(false);
    expect(compararComBase(limpo, {}).some((i) => i.id === "E5")).toBe(false);
  });

  it("AC-009.4: medição que falta (null) reprova em vez de passar em silêncio", async () => {
    const { compararComBase } = await carregar();
    const itens = compararComBase({ ...limpo, conexoes_de_email_no_worker: Number.NaN }, {});
    expect(itens.find((i) => i.id === "E6")?.passou).toBe(false);
  });

  it("AC-009.4: o site precisa responder 200 em '/', 307 em '/app' e 200 no health, sem seguir redirecionamento", async () => {
    const { conferirSite } = await carregar();
    const chamadas: string[] = [];
    const buscar: Buscar = async (u, o) => {
      chamadas.push(`${u}|${(o as { redirect?: string }).redirect}`);
      return { status: u.endsWith("/app") ? 307 : 200 };
    };
    const itens = await conferirSite("https://exemplo.test/", buscar);
    expect(itens.every((i) => i.passou)).toBe(true);
    expect(chamadas.every((c) => c.endsWith("|manual"))).toBe(true);
    const falha = await conferirSite("https://exemplo.test", async () => ({ status: 404 }));
    expect(falha.every((i) => !i.passou)).toBe(true);
  });
});
