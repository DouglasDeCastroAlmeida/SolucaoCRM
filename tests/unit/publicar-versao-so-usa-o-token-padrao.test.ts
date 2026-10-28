import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AC-002.4 (mudança SDD 008, adendo de 2026-10-28): a publicação da versão é um segundo
 * workflow manual, só com o `GITHUB_TOKEN`.
 *
 * Tag empurrada com o `GITHUB_TOKEN` não dispara `publish-image.yml` (gatilho `push: tags`),
 * mas `workflow_dispatch` disparado por ele dispara. Então `publicar-versao.yml` cria a tag
 * e dispara a publicação explicitamente. Teste de forma: o disparo real só acontece no GitHub.
 */
const RAIZ = process.cwd();
const yml = readFileSync(join(RAIZ, ".github/workflows/publicar-versao.yml"), "utf8");
const publish = readFileSync(join(RAIZ, ".github/workflows/publish-image.yml"), "utf8");
/** Comentário não conta: o texto explica o que o workflow NÃO usa. */
const efetivo = yml
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("#"))
  .join("\n");
const runs = [...efetivo.matchAll(/^\s+run:\s*\|\n((?:\s{10,}.*\n?|\s*\n)+)/gm)].map((m) => m[1]).join("\n");

describe("publicar-versao.yml (AC-002.4)", () => {
  it("AC-002.4: é disparável à mão (workflow_dispatch) com o input versao, e só por isso", () => {
    expect(efetivo).toMatch(/^on:\s*\n\s+workflow_dispatch:/m);
    expect(efetivo).not.toMatch(/^\s+(push|pull_request|pull_request_target|schedule|release):/m);
    expect(efetivo).toMatch(/inputs:\s*\n\s+versao:/);
  });

  it("AC-002.4: o único segredo é o token padrão — sem aplicativo nem segredo de terceiro", () => {
    const segredos = [...efetivo.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(segredos.filter((s) => s !== "GITHUB_TOKEN")).toEqual([]);
    expect(efetivo).not.toMatch(/RELEASE_APP|create-github-app-token|app-slug/);
    expect(efetivo, "precisa de fato usar o token padrão").toMatch(/secrets\.GITHUB_TOKEN|github\.token/);
  });

  it("AC-002.4: permissões explícitas e mínimas — escrita só em actions e contents", () => {
    expect(efetivo).toMatch(/^permissions:/m);
    const escritas = [...efetivo.matchAll(/^\s+([a-z-]+):\s*write\s*$/gm)].map((m) => m[1]).sort();
    expect(escritas).toEqual(["actions", "contents"]);
    expect(efetivo).not.toMatch(/write-all/);
  });

  it("AC-002.4: nenhuma referência ao upstream nem à vitrine dele", () => {
    expect(yml).not.toMatch(/melgarafael|deskcomm\.com\.br/i);
  });

  it("AC-002.4: só roda no repositório do dono (fork herdaria o workflow) e a partir da main", () => {
    expect(efetivo).toContain("github.repository == 'DouglasDeCastroAlmeida/SolucaoCRM'");
    expect(efetivo).toContain("github.ref == 'refs/heads/main'");
  });

  it("AC-002.4: nunca força nada e nunca interpola input em script", () => {
    expect(efetivo).not.toMatch(/--force|--force-with-lease|push\s+-f\b|\s-f\s+refs\/tags/);
    expect(runs.length, "o recorte dos scripts está cego").toBeGreaterThan(100);
    expect(runs).not.toMatch(/\$\{\{/);
    expect(efetivo).toMatch(/VERSAO:\s*\$\{\{\s*inputs\.versao\s*\}\}/);
  });

  it("AC-002.4: valida o formato, a seção do CHANGELOG e a inexistência da tag antes de criá-la", () => {
    const iFormato = runs.indexOf("[0-9]+");
    const iChangelog = runs.indexOf("CHANGELOG.md");
    const iExiste = runs.indexOf("ls-remote");
    const iCria = runs.indexOf("git tag -a");
    const iPush = runs.indexOf("git push origin");
    expect(iFormato).toBeGreaterThan(-1);
    expect(iChangelog).toBeGreaterThan(-1);
    expect(iExiste).toBeGreaterThan(-1);
    expect(iCria, "a tag precisa ser ANOTADA").toBeGreaterThan(-1);
    expect(iPush).toBeGreaterThan(-1);
    expect(Math.max(iFormato, iChangelog, iExiste)).toBeLessThan(iCria);
    expect(iCria).toBeLessThan(iPush);
  });

  it("AC-002.4: dispara a publicação na ref da tag, sem criar a imagem aqui", () => {
    expect(runs).toMatch(/gh workflow run publish-image\.yml --ref "v\$\{VERSAO\}"/);
    expect(efetivo).not.toMatch(/docker\/(login|build-push)-action|packages:/);
  });
});

describe("publish-image.yml continua a única porta da publicação (AC-002.4)", () => {
  it("AC-002.4: aceita disparo manual e mantém a trava de procedência da tag", () => {
    expect(publish).toMatch(/^ {2}workflow_dispatch:/m);
    expect(publish).toMatch(/^ {2}a-tag-veio-da-main:/m);
    expect(publish).toMatch(/identical\|behind\)/);
  });

  it("AC-002.4: o imagens-ok segue exigindo sucesso do build fora de pull_request", () => {
    expect(publish).toMatch(/^ {2}imagens-ok:/m);
    expect(publish).toContain('[ "$BUILD" = "success" ]');
  });

  it("AC-002.4: o canal stable não anda por disparo manual (só push de tag)", () => {
    expect(publish).toContain(
      "if: github.event_name == 'push' && github.ref_type == 'tag' && startsWith(github.ref_name, 'v')",
    );
  });
});
