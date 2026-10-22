/**
 * CI ENXUTO DA SOLUCAO CRM (mudança SDD 001, D-06 / ADR-004 = A-05).
 *
 * Lê os YAML de `.github/workflows/` como texto (o repositório não tem parser
 * YAML como dependência) e prova a política de custo do CI:
 *  - PR: `verify` + `invariants` com UMA só major do Postgres, sem e2e completo;
 *  - push na `main`: e2e completo;
 *  - imagens só linux/amd64;
 *  - workflows do upstream que não servem ao fork ficam desligados.
 *
 * Postgres único = 17: é o `supabase/postgres:17.6.1.136` que a instalação
 * single-server sobe (tests/shell/supabase-imagens-plataforma.test.sh,
 * hostgator-setup-kit/_supabase-images.sh) e o `postgres:17-alpine` dos
 * clientes do kit. O piso 15 era do upstream (clones antigos), não do nosso.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lerWorkflow = (nome: string): string =>
  readFileSync(join((process.env.REPO ?? process.cwd()), ".github", "workflows", nome), "utf8");

/** Texto do job `nome` (do `  nome:` de 2 espaços até o próximo job). */
function job(yaml: string, nome: string): string {
  const linhas = yaml.split("\n");
  const ini = linhas.findIndex((l) => l === `  ${nome}:`);
  if (ini < 0) throw new Error(`job ${nome} não encontrado`);
  let fim = linhas.length;
  for (let i = ini + 1; i < linhas.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(linhas[i] ?? "")) {
      fim = i;
      break;
    }
  }
  return linhas.slice(ini, fim).join("\n");
}

const semComentarios = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

describe("CI enxuto", () => {
  it("AC-004.1: no PR, invariants roda uma só major do Postgres (17) e nunca a matriz cheia", () => {
    const ci = semComentarios(lerWorkflow("ci.yml"));
    const alcance = job(ci, "invariants-alcance");
    const saidas = [...alcance.matchAll(/majors=(\[[^\]]*\])/g)].map((m) => m[1] ?? "");
    expect(saidas.length).toBeGreaterThan(0);
    for (const s of saidas) expect(JSON.parse(s)).toEqual(["17"]);
    expect(job(ci, "invariants-majors")).toContain("fromJSON(needs.invariants-alcance.outputs.majors)");
    expect(job(ci, "invariants")).toBeTruthy();
    expect(job(ci, "verify")).toBeTruthy();
  });

  it("AC-004.1: o e2e completo não roda em pull_request (alcance responde nao)", () => {
    const e2e = semComentarios(lerWorkflow("e2e.yml"));
    const alcance = job(e2e, "e2e-alcance");
    // depois do desvio "fora de PR => sim", o que sobra em pull_request é "nao"
    expect(alcance).toMatch(/!= "pull_request" \]; then[\s\S]*?\n\s*fi\n[\s\S]*?echo "e2e=nao"/);
  });

  it("AC-004.2: no push na main o e2e completo roda", () => {
    const e2e = semComentarios(lerWorkflow("e2e.yml"));
    const alcance = job(e2e, "e2e-alcance");
    // fora de pull_request a resposta é sempre "sim"
    expect(alcance).toMatch(/!= "pull_request" \]; then\s*\n\s*echo "e2e=sim"/);
    expect(e2e).toMatch(/\n {2}push:\n {4}branches: \[main\]/);
    expect(job(e2e, "e2e-parte")).toContain("needs.e2e-alcance.outputs.e2e == 'sim'");
  });

  it("AC-004.3: acolhida, relogio, mysql-integracao e release estão desligados", () => {
    const jobsRaiz: Record<string, string[]> = {
      "acolhida.yml": ["acolher"],
      "relogio.yml": ["tick"],
      "mysql-integracao.yml": ["integracao-mysql", "standalone-leva-mysql2"],
      "release.yml": ["abrir-pr-de-release", "cortar-tag"],
    };
    for (const [arquivo, jobs] of Object.entries(jobsRaiz)) {
      const yaml = semComentarios(lerWorkflow(arquivo));
      for (const j of jobs) {
        expect(job(yaml, j), `${arquivo}:${j}`).toMatch(/^ {4}if: false\b/m);
      }
    }
  });

  it("AC-004.4: as imagens são publicadas só para linux/amd64", () => {
    const pub = semComentarios(lerWorkflow("publish-image.yml"));
    expect(pub).not.toMatch(/linux\/arm64/);
    expect(pub).not.toMatch(/ubuntu-24\.04-arm/);
    expect(pub).not.toMatch(/arch: \[amd64, arm64\]/);
    expect(pub).toMatch(/arch: \[amd64\]/);
    expect(job(pub, "imagens-ok")).toBeTruthy();
  });

  it("AC-004.4: a divergência da regra de packaging está registrada na constituição", () => {
    const c = readFileSync(join((process.env.REPO ?? process.cwd()), ".sdd", "constitution.md"), "utf8");
    expect(c).toMatch(/ADR-004/);
    expect(c).toMatch(/linux\/amd64/);
  });
});
