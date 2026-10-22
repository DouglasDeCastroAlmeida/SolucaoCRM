import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// O deploy da Solução CRM (infra/solucao/deploy.sh) instala SEMPRE a imagem pela tag do SHA
// completo do commit (AC-005.3: versão fixa, nunca `latest`). Se o publish-image deixar de
// publicar essa tag, o deploy falha só na VPS — este teste o pega antes.
const yaml = readFileSync(join(process.cwd(), ".github/workflows/publish-image.yml"), "utf8")
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

describe("publish-image: tag do SHA para o deploy", () => {
  it("AC-005.3: as duas listas de tags (build por arquitetura e união dos manifestos) publicam o SHA longo, só na main", () => {
    const linhas = yaml.match(/type=sha,format=long,prefix=,enable=\$\{\{ github\.ref_type == 'branch' && github\.ref_name == 'main' \}\}/g) ?? [];
    expect(linhas).toHaveLength(2);
  });
});
