/**
 * Cerca do REQ-005 (mudança SDD 008): nada que EXECUTA aponta para o repositório upstream.
 *
 * Reprova `melgarafael` ou `deskcomm.com.br` nos caminhos que executam ou que o operador
 * segue (scripts, kit, workflows, Dockerfiles, compose, .env de exemplo, infra, código de
 * produção, skills dos assistentes, READMEs), fora da lista EXCECOES. A falha aponta
 * arquivo:linha.
 *
 * CONJUNTO VARRIDO (git ls-files): scripts/, hostgator-setup-kit/, .github/, infra/, loop/,
 * workers/, hooks/, app/, components/, lib/ (sem *.test.*), extensoes/, tests/shell/,
 * tests/setup/, .agents/skills/ (o espelho .claude/skills é gerado dali), SECURITY.md,
 * CONTRIBUTING*.md, public/llms.txt, `.env*example`,
 * Dockerfile*, docker-compose*, ubuntu-local-installer.sh, .mailmap e README*.md.
 *
 * NÃO VARRE (histórico, crédito ou asserção que não executa): CHANGELOG, LICENSE, NOTICE,
 * docs/, .sdd/, .changes/, evidence/, triagem/, supabase/, AGENTS.md e CLAUDE.md (doutrina com
 * histórico e nomes de crédito; só o slug de comandos foi trocado), tests/unit/ (asserções;
 * alguns citam o upstream de propósito para provar que ele saiu) e este arquivo.
 *
 * README: a regra é só LINK/COMANDO ao upstream (github.com|ghcr.io|raw.githubusercontent.com
 * |repos/ + melgarafael, e deskcomm.com.br). O nome do autor, "DeskcommCRM" em prosa e as
 * redes sociais dele (crédito, REQ-004) continuam permitidos.
 *
 * A LISTA SÓ ENCOLHE: TETO_DE_EXCECOES é gravado aqui. Cresceu a lista? Reprova. Encolheu?
 * Baixe o TETO no mesmo commit (senão reprova também, para a folga não virar vaga).
 * Exceção que já não casa com nada também reprova: remova-a.
 *
 * AGENDA DE SAÍDA: as exceções do release.yml (Fatia 6) e de infra/executor-proprio/**
 * (Fatia 7) saem quando essas fatias encerrarem; o teto desce de 15 para 11.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(__dirname, "../..");
const ESTE_ARQUIVO = "tests/unit/nada-executa-contra-o-upstream.test.ts";

const PROIBIDO_GERAL = /melgarafael|deskcomm\.com\.br/i;
const PROIBIDO_README =
  /(github\.com|ghcr\.io|raw\.githubusercontent\.com|repos)\/melgarafael|deskcomm\.com\.br/i;

export type Excecao = { caminho: string; motivo: string };

const CREDITO =
  "crédito/identidade do autor original — revisão de propriedade intelectual pós-primeira-versão";
const ASSERCAO_NEGATIVA =
  "asserção negativa: o texto prova que o kit NÃO cita o dono do upstream";

export const EXCECOES: Excecao[] = [
  { caminho: ".agents/skills/deskcomm-contribuir/scripts/quem-sou.sh", motivo: CREDITO },
  { caminho: ".mailmap", motivo: CREDITO },
  { caminho: "tests/shell/deskcomm-contribuir.test.sh", motivo: CREDITO },
  {
    caminho: ".agents/skills/deskcomm-contribuir/SKILL.md",
    motivo:
      "prosa sobre a vitrine/changelog do site do upstream; sem comando; reescrever com a política de site próprio (fora de escopo)",
  },
  {
    caminho: "extensoes/catalogo.json",
    motivo: "dado de catálogo versionado; regenerar com a origem do dono fica para depois (grill)",
  },
  {
    caminho: "extensoes/loja.json",
    motivo: "dado de catálogo versionado; regenerar com a origem do dono fica para depois (grill)",
  },
  {
    caminho: ".github/workflows/release.yml",
    motivo: "job desligado, removido/reescrito na Fatia 6",
  },
  { caminho: "infra/executor-proprio/instalar.sh", motivo: "Fatia 7" },
  { caminho: "infra/executor-proprio/so-o-que-e-nosso.sh", motivo: "Fatia 7" },
  { caminho: "infra/executor-proprio/vaga.sh", motivo: "Fatia 7" },
  { caminho: "tests/shell/extensao-nao-instala.test.sh", motivo: ASSERCAO_NEGATIVA },
  { caminho: "tests/shell/update-guard.test.sh", motivo: ASSERCAO_NEGATIVA },
  {
    caminho: "hostgator-setup-kit/test-validators.sh",
    motivo: `${ASSERCAO_NEGATIVA}; e fixture de crontab de um vizinho (crm.deskcomm.com.br)`,
  },
  {
    caminho: "lib/waha/client.ts",
    motivo: "comentário histórico: cita a issue do upstream onde a medida foi feita",
  },
  {
    caminho: "tests/setup/vitest.setup.ts",
    motivo: "comentário histórico: cita a issue do upstream onde o defeito foi achado",
  },
];

/** Só pode baixar. Subir exige justificar no PR e é recusado por este teste. */
export const TETO_DE_EXCECOES = 15;

const PREFIXOS = [
  "scripts/",
  "hostgator-setup-kit/",
  ".github/",
  "infra/",
  "loop/",
  "workers/",
  "hooks/",
  "app/",
  "components/",
  "lib/",
  "extensoes/",
  "tests/shell/",
  "tests/setup/",
  ".agents/skills/",
  "public/llms.txt",
];

export function executa(caminho: string): boolean {
  if (caminho === ESTE_ARQUIVO) return false;
  if (/^(lib|app|components|hooks|workers)\/.*\.test\.[jt]sx?$/.test(caminho)) return false;
  if (PREFIXOS.some((p) => caminho.startsWith(p))) return true;
  return /^(Dockerfile[^/]*|docker-compose[^/]*|\.env[^/]*example|ubuntu-local-installer\.sh|\.mailmap|SECURITY\.md|CONTRIBUTING[^/]*\.md|README[^/]*\.md)$/.test(
    caminho,
  );
}

export type Ocorrencia = { caminho: string; linha: number; texto: string };

export function varrer(caminho: string, conteudo: string): Ocorrencia[] {
  const regra = /^README[^/]*\.md$/.test(caminho) ? PROIBIDO_README : PROIBIDO_GERAL;
  const achadas: Ocorrencia[] = [];
  conteudo.split("\n").forEach((texto, i) => {
    if (regra.test(texto)) achadas.push({ caminho, linha: i + 1, texto: texto.trim().slice(0, 120) });
  });
  return achadas;
}

function arquivosQueExecutam(): string[] {
  const saida = execFileSync("git", ["ls-files", "-z"], {
    cwd: RAIZ,
    maxBuffer: 64 * 1024 * 1024,
  }).toString("utf8");
  return saida.split("\0").filter((c) => c && executa(c));
}

function todasAsOcorrencias(): Ocorrencia[] {
  const todas: Ocorrencia[] = [];
  for (const caminho of arquivosQueExecutam()) {
    let conteudo: string;
    try {
      conteudo = readFileSync(resolve(RAIZ, caminho), "utf8");
    } catch {
      continue; // apagado na árvore de trabalho
    }
    todas.push(...varrer(caminho, conteudo));
  }
  return todas;
}

describe("nada executa contra o upstream (REQ-005)", () => {
  it("AC-005.1: nenhum arquivo que executa cita o upstream fora das exceções", () => {
    const liberados = new Set(EXCECOES.map((e) => e.caminho));
    const proibidas = todasAsOcorrencias().filter((o) => !liberados.has(o.caminho));
    const relatorio = proibidas.map((o) => `${o.caminho}:${o.linha}  ${o.texto}`).join("\n");
    expect(proibidas.length, `ponteiro ao upstream:\n${relatorio}`).toBe(0);
  });

  it("AC-005.1: a varredura enxerga o literal e aponta a linha (sabotagem em memória)", () => {
    expect(varrer("scripts/x.sh", "a\nb\ngit clone https://github.com/melgarafael/X\n")).toEqual([
      { caminho: "scripts/x.sh", linha: 3, texto: "git clone https://github.com/melgarafael/X" },
    ]);
    expect(varrer("scripts/x.sh", "curl https://www.deskcomm.com.br/a")).toHaveLength(1);
    expect(varrer("README.md", "[CI](https://github.com/melgarafael/DeskcommCRM/x)")).toHaveLength(1);
    expect(varrer("README.md", "Autor: Rafael Melgaço — [Instagram](https://instagram.com/melgarafael)")).toHaveLength(0);
    expect(executa("README.en.md")).toBe(true);
    expect(executa("docs/x.md")).toBe(false);
    expect(executa("lib/a/b.test.ts")).toBe(false);
  });

  it("AC-005.2: toda exceção tem motivo escrito, caminho único e ainda casa com algo", () => {
    const caminhos = EXCECOES.map((e) => e.caminho);
    expect(new Set(caminhos).size).toBe(caminhos.length);
    for (const e of EXCECOES) expect(e.motivo.trim().length, e.caminho).toBeGreaterThan(5);
    const comOcorrencia = new Set(todasAsOcorrencias().map((o) => o.caminho));
    const obsoletas = caminhos.filter((c) => !comOcorrencia.has(c));
    expect(obsoletas, `exceção que não casa mais com nada (remova e baixe o teto): ${obsoletas}`).toEqual([]);
  });

  it("AC-005.2: a lista só encolhe — não passa do teto e o teto acompanha a lista", () => {
    expect(EXCECOES.length).toBeLessThanOrEqual(TETO_DE_EXCECOES);
    expect(TETO_DE_EXCECOES, "a lista encolheu: baixe TETO_DE_EXCECOES").toBe(EXCECOES.length);
  });
});
