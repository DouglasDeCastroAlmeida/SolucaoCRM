/**
 * Mudança 003, Fatia 5 (ADR-002): `cobranca_planos` passou a ter dono (a
 * instalação, `brand_id` nulo, ou uma marca). Toda leitura que escolhe o plano
 * de alguém menciona `brand_id` logo ao lado do `from`; as que não mencionam
 * vivem na lista abaixo, cada uma com a razão por que não misturam escopos.
 *
 * Cerca estrutural: uma leitura nova sem filtro de marca reprova aqui, em vez de
 * mostrar o plano de uma marca a outra.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const JANELA = 7; // linhas depois do `from` em que `brand_id` precisa aparecer

/** Lê por id que já vem de uma linha de `cobranca_assinaturas` (que já pertence a uma organização). */
const POR_ID_DA_ASSINATURA = "lê por id que veio da assinatura da organização: não escolhe plano, só descreve o que já está atribuído";
const PERMITIDAS: Record<string, string> = {
  "lib/cobranca/checkout.ts": POR_ID_DA_ASSINATURA,
  "lib/cobranca/sincronizar.ts": POR_ID_DA_ASSINATURA,
  "lib/billing-trial/iniciar.ts": POR_ID_DA_ASSINATURA,
  "app/api/v1/admin/cobranca/conexao/route.ts": POR_ID_DA_ASSINATURA,
  "lib/cobranca/rodada.ts": "teto de IA de TODA assinatura, de qualquer escopo: o aviso vale para a empresa onde quer que o plano more",
  "app/api/v1/admin/cobranca/planos/route.ts": "insere plano da instalação: brand_id fica nulo por omissão e o corpo não aceita brand_id",
};

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

describe("leituras de cobranca_planos", () => {
  it("AC-001.1: toda leitura declara o escopo (brand_id) ou está na lista com a razão", () => {
    const sem: string[] = [];
    for (const dir of ["app", "lib"]) {
      for (const arquivo of arquivos(join(RAIZ, dir))) {
        const rel = relative(RAIZ, arquivo).replace(/\\/g, "/");
        if (rel in PERMITIDAS) continue;
        const linhas = readFileSync(arquivo, "utf8").split("\n");
        linhas.forEach((linha, i) => {
          if (!linha.includes('from("cobranca_planos")')) return;
          const trecho = linhas.slice(i, i + JANELA + 1).join("\n");
          if (!/brand_id/.test(trecho)) sem.push(`${rel}:${i + 1}`);
        });
      }
    }
    expect(sem).toEqual([]);
  });

  it("a lista de exceções só contém arquivos que ainda leem a tabela", () => {
    const mortas = Object.keys(PERMITIDAS).filter((rel) => !readFileSync(join(RAIZ, rel), "utf8").includes('from("cobranca_planos")'));
    expect(mortas).toEqual([]);
  });
});
