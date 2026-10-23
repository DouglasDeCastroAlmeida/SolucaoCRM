/**
 * WORKFLOWS DE DEPLOY DA SOLUCAO CRM (mudança SDD 001, T-012).
 *
 * Lê os YAML como texto (sem parser YAML no repositório) e prova a política:
 *  - hml dispara sozinho só depois do `publish-image` verde na main;
 *  - prod só por `workflow_dispatch`, ambiente `producao` (aprovação do dono);
 *  - nenhum gatilho de PR/fork, nenhum `secrets: inherit`, segredo só via `env:`;
 *  - o único comando remoto é `deploy.sh <ambiente> <sha>`;
 *  - smoke test pós-deploy: `/` = 200 e `/app` = 307.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (nome: string): string =>
  readFileSync(join(process.env.REPO ?? process.cwd(), ".github", "workflows", nome), "utf8");
const semComentarios = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

const hml = semComentarios(ler("deploy-hml.yml"));
const prod = semComentarios(ler("deploy-prod.yml"));

/** Só os blocos `run: |` (o que o shell do runner executa). */
function runs(yaml: string): string {
  const linhas = yaml.split("\n");
  const out: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*\|?\s*$/.exec(linhas[i] ?? "");
    if (!m) continue;
    const recuo = (m[1] ?? "").length;
    for (let j = i + 1; j < linhas.length; j++) {
      const l = linhas[j] ?? "";
      if (l.trim() !== "" && l.search(/\S/) <= recuo) break;
      out.push(l);
    }
  }
  return out.join("\n");
}

describe.each([
  ["deploy-hml.yml", hml, "homologacao", "hml"],
  ["deploy-prod.yml", prod, "producao", "prod"],
])("%s", (_nome, yaml, ambiente, sigla) => {
  it("AC-005.4: sem pull_request, sem pull_request_target e sem secrets: inherit", () => {
    expect(yaml).not.toMatch(/pull_request/);
    expect(yaml).not.toMatch(/secrets:\s*inherit/);
  });

  it("AC-005.4: permissões mínimas declaradas e sem escrita no repositório", () => {
    expect(yaml).toMatch(/^permissions:\n/m);
    expect(yaml).not.toMatch(/contents:\s*write/);
    expect(yaml).not.toMatch(/write-all/);
  });

  it(`AC-005.2: usa o environment ${ambiente}`, () => {
    expect(yaml).toMatch(new RegExp(String.raw`environment:\s*${ambiente}\s`));
  });

  it("AC-005.5: concurrency por ambiente, sem cancelar deploy em andamento", () => {
    expect(yaml).toMatch(new RegExp(String.raw`concurrency:\s+group:\s*deploy-${sigla}\s`));
    expect(yaml).toMatch(/cancel-in-progress:\s*false/);
    expect(yaml).not.toMatch(/cancel-in-progress:\s*true/);
  });

  it("AC-005.4: SSH com as quatro chaves e known_hosts verificado, nunca accept-new", () => {
    for (const s of ["SSH_HOST", "SSH_PORT", "SSH_USER", "SSH_PRIVATE_KEY", "SSH_KNOWN_HOSTS"]) {
      expect(yaml, s).toContain(`secrets.${s}`);
    }
    expect(yaml).toMatch(/StrictHostKeyChecking=yes/);
    expect(yaml).not.toMatch(/accept-new|StrictHostKeyChecking=no/);
    expect(yaml).toMatch(/chmod 600/);
    expect(yaml).toMatch(/configure SSH_\*/i);
  });

  it("AC-005.4: nenhum segredo vai para um bloco run (só via env:) e nada é ecoado", () => {
    const r = runs(yaml);
    expect(r).not.toMatch(/\$\{\{\s*secrets\./);
    expect(r).not.toMatch(/echo[^\n]*\$\{?SSH_PRIVATE_KEY/);
    expect(r).not.toMatch(/set -x|bash -x/);
  });

  it("AC-005.3: o único comando remoto é deploy.sh <ambiente> <sha>, com SHA de 40 hex", () => {
    const r = runs(yaml);
    const remotos = [...r.matchAll(/deploy\.sh\s+(\S+)\s+(\S+)/g)];
    expect(remotos.length).toBe(1);
    expect(remotos[0]?.[1]).toBe(sigla);
    expect(remotos[0]?.[2]).toMatch(/SHA/);
    expect(r).toMatch(/\^\[0-9a-f\]\{40\}\$/);
    expect(r).not.toMatch(/\blatest\b/);
  });

  it("AC-005.1: smoke test pós-deploy contra a URL pública: / = 200 e /app = 307", () => {
    const r = runs(yaml);
    expect(r).toMatch(/\b200\b/);
    expect(r).toMatch(/\b307\b/);
    expect(r).toMatch(/\/app/);
    expect(yaml).toMatch(/vars\.URL_PUBLICA/);
  });
});

describe("deploy-hml.yml (gatilho)", () => {
  it("AC-005.1: dispara só após publish-image concluído com sucesso na main", () => {
    expect(hml).toMatch(/^on:\s*\n\s+workflow_run:/m);
    expect(hml).toMatch(/workflows:\s*\["Publicar imagem Docker \(GHCR\)"\]/);
    expect(hml).toMatch(/types:\s*\[completed\]/);
    expect(hml).toMatch(/branches:\s*\[main\]/);
    expect(hml).toMatch(/workflow_run\.conclusion == 'success'/);
    expect(hml).toMatch(/workflow_run\.event == 'push'/);
    expect(hml).not.toMatch(/workflow_dispatch/);
  });

  it("AC-005.3: o SHA vem do run que publicou (head_sha)", () => {
    expect(hml).toMatch(/workflow_run\.head_sha/);
  });
});

describe("deploy-prod.yml (gatilho)", () => {
  it("AC-005.2: só workflow_dispatch, com input sha", () => {
    expect(prod).toMatch(/^on:\s*\n\s+workflow_dispatch:/m);
    expect(prod).not.toMatch(/^\s+(push|schedule|workflow_run|release):/m);
    expect(prod).toMatch(/inputs:\s*\n\s+sha:/);
  });

  it("AC-005.3: confere no GHCR que as três imagens com esta tag existem antes de implantar", () => {
    const r = runs(prod);
    expect(r).toMatch(/manifest inspect/);
    for (const img of ["deskcommcrm", "deskcomm-worker", "deskcomm-scheduler"]) {
      expect(r, img).toContain(img);
    }
    expect(prod).toMatch(/packages:\s*read/);
  });

  it("AC-005.2: o único gatilho é workflow_dispatch e o job exige ref main", () => {
    const gatilhos = [...prod.matchAll(/^ {2}([a-z_]+):\s*$/gm)].map((m) => m[1]);
    expect(gatilhos.filter((g) => ["workflow_dispatch", "push", "pull_request", "schedule", "workflow_run", "release"].includes(g ?? ""))).toEqual(["workflow_dispatch"]);
    expect(prod).toMatch(/^ {4}if: github\.ref == 'refs\/heads\/main'/m);
  });

  it("integração: o dono das imagens segue como 3º argumento, em minúsculas e validado", () => {
    for (const y of [hml, prod]) {
      expect(runs(y)).toMatch(/deploy\.sh \S+ "\$SHA" "\$DONO_MIN"/);
      expect(runs(y)).toContain("tr 'A-Z' 'a-z'");
      expect(runs(y)).toContain("^[a-z0-9][a-z0-9-]{0,38}$");
    }
  });

  it("AC-005.2: só a main pode disparar o deploy de produção", () => {
    expect(prod).toMatch(/github\.ref == 'refs\/heads\/main'/);
  });
});
