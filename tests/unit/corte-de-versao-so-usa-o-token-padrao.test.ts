import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AC-002.4 (mudança SDD 008): o corte de versão próprio depende só do token padrão.
 *
 * O `release.yml` do upstream abre PR e cria tag com o token de um GitHub App que não é
 * nosso. O `corte-de-versao.yml` o substitui: disparo manual, `GITHUB_TOKEN`, permissões
 * mínimas e nenhuma referência ao upstream. Teste de forma: o corte real só acontece
 * num disparo no GitHub (T-018, com autorização do dono).
 */
const RAIZ = process.cwd();
const yml = readFileSync(join(RAIZ, ".github/workflows/corte-de-versao.yml"), "utf8");
/** Comentário não conta: o texto explica o que o workflow NÃO usa. */
const efetivo = yml
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("#"))
  .join("\n");

describe("corte-de-versao.yml (AC-002.4)", () => {
  it("AC-002.4: é disparável à mão (workflow_dispatch) e só por isso", () => {
    expect(efetivo).toMatch(/^on:\s*\n\s+workflow_dispatch:/m);
    expect(efetivo).not.toMatch(/^\s+(push|pull_request|pull_request_target|schedule):/m);
  });

  it("AC-002.4: o único segredo é o token padrão — sem aplicativo nem segredo de terceiro", () => {
    const segredos = [...efetivo.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(segredos.filter((s) => s !== "GITHUB_TOKEN")).toEqual([]);
    expect(efetivo).not.toMatch(/RELEASE_APP|create-github-app-token|app-slug/);
    expect(efetivo, "precisa de fato usar o token padrão").toMatch(/secrets\.GITHUB_TOKEN|github\.token/);
  });

  it("AC-002.4: permissões explícitas e mínimas — escrita só em contents e pull-requests", () => {
    expect(efetivo).toMatch(/^permissions:/m);
    const escritas = [...efetivo.matchAll(/^\s+([a-z-]+):\s*write\s*$/gm)].map((m) => m[1]).sort();
    expect(escritas).toEqual(["contents", "pull-requests"]);
    expect(efetivo).not.toMatch(/write-all/);
  });

  it("AC-002.4: nenhuma referência ao upstream nem à vitrine dele", () => {
    expect(yml).not.toMatch(/melgarafael|deskcomm\.com\.br/i);
  });

  it("AC-002.4: roda o corte do repositório e abre PR de release, sem criar tag", () => {
    expect(efetivo).toContain("scripts/cortar-release.ts --escrever");
    expect(efetivo).toMatch(/gh pr create/);
    expect(efetivo).not.toMatch(/git tag |git push[^\n]*(--tags|refs\/tags)/);
  });

  it("AC-002.4: só roda no repositório do dono (fork herdaria o workflow)", () => {
    expect(efetivo).toContain("github.repository == 'DouglasDeCastroAlmeida/SolucaoCRM'");
  });

  it("AC-002.4: o job do upstream continua desligado e diz por quê", () => {
    const release = readFileSync(join(RAIZ, ".github/workflows/release.yml"), "utf8");
    expect(release).toContain("corte-de-versao.yml");
    expect(release).not.toMatch(/deskcomm\.com\.br/);
  });
});
