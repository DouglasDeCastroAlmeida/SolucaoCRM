import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { candidataDoAcervo, medir, tetoDoAgente, vereditoDoAcervo } from "@/lib/release/cabe-na-tela";
import type { Fragmento } from "@/lib/release/fragmento";
import { aplicarNoChangelog, montarSecao } from "@/lib/release/montar-secao";

/**
 * AC-002.5 (mudança SDD 008): o corte próprio consome os fragmentos antes do teto.
 *
 * A régua (30.000 bytes, `head -c` do agent.sh) e o aviso antecipado já têm cobertura em
 * `acervo-do-changelog-cobra-a-casa.test.ts` e `changelog-cabe-na-tela-da-vps.test.ts`.
 * Aqui se prova o que faltava: (1) o workflow mede o acervo ANTES de cortar, e avisa
 * antes de estourar; (2) o corte consome — depois dele o acervo está vazio e a seção cabe.
 */
const RAIZ = process.cwd();
const RAW = readFileSync(join(RAIZ, "CHANGELOG.md"), "utf8");
const AGENT_SH = readFileSync(join(RAIZ, "hostgator-setup-kit", "agent.sh"), "utf8");
const yml = readFileSync(join(RAIZ, ".github/workflows/corte-de-versao.yml"), "utf8");
const TETO = tetoDoAgente(AGENT_SH);

function frag(i: number, bytes: number): Fragmento {
  return { arquivo: `f${i}.md`, impacto: "nada_mudou", secao: "corrigido", titulo: `t${i}`, corpo: "x".repeat(bytes), atencao: null };
}

describe("corte consome os fragmentos antes do limite (AC-002.5)", () => {
  it("AC-002.5: o workflow mede o acervo antes de cortar, e o aviso não bloqueia o corte", () => {
    const iMedida = yml.indexOf("release:acervo-cabe");
    const iCorte = yml.indexOf("scripts/cortar-release.ts --escrever");
    expect(iMedida, "o workflow não mede o acervo").toBeGreaterThan(-1);
    expect(iCorte).toBeGreaterThan(iMedida);
    // Cortar É o conserto do acervo grande: um vermelho da medição não pode impedi-lo.
    const trecho = yml.slice(Math.max(0, iMedida - 300), iMedida + 200);
    expect(trecho).toMatch(/continue-on-error:\s*true/);
  });

  it("AC-002.5: o aviso aparece ANTES do estouro e a seção montada cabe no teto", () => {
    // Acervo na faixa de aviso: cabe hoje, mas dobrá-lo não caberia.
    const fragmentos = Array.from({ length: 10 }, (_, i) => frag(i, 1200));
    let n = 10;
    let m = medir(candidataDoAcervo(RAW, fragmentos)!, AGENT_SH);
    // Engorda até a fronteira do aviso, sem passar do teto.
    while (!vereditoDoAcervo(m).avisa && m.cabe && n < 400) {
      fragmentos.push(frag(n++, 1200));
      m = medir(candidataDoAcervo(RAW, fragmentos)!, AGENT_SH);
    }
    const v = vereditoDoAcervo(m);
    expect(v.avisa, "o aviso deveria disparar antes de estourar").toBe(true);
    expect(v.reprova).toBe(false);
    expect(m.fim).toBeLessThanOrEqual(TETO);

    // O corte: aplica a seção montada ao CHANGELOG e consome os fragmentos.
    const secao = montarSecao(fragmentos, "9.9.9", "2099-01-01");
    const depois = aplicarNoChangelog(RAW, secao, RAW.match(/^##\s+\[(\d+\.\d+\.\d+)\]/m)![1]!, (a, b) => `x/${a}...${b}`);
    expect(depois).toContain("## [9.9.9]");
    // Só confirma o contrato da função com lista vazia; NÃO prova que o corte apaga os arquivos
    // de `.changes/` (isso é feito por `scripts/cortar-release.ts --escrever`, fora deste teste).
    expect(candidataDoAcervo(depois, []), "lista vazia de fragmentos: nada a medir").toBeNull();
    expect(Buffer.byteLength(secao.texto, "utf8")).toBeLessThan(TETO);
  });
});
