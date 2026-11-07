import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ADR 0007 — o visual de mensageiro copia posições, formas, neutros e densidade do WhatsApp Web,
 * mas NUNCA a arte da Meta: logo, nome, ícones, figurinhas, fundo ilustrado, nem os arquivos do
 * clone `ankitrajxd/whatsapp-frontend` (que traz cópias dessa arte).
 *
 * Esta trava é o piso do épico (issue #82) e vale para todas as etapas. Ela herdou da casca da 009 o
 * teste de cores e assets do WhatsApp (AC-003.3) e acrescentou o que a 009 não cobria: arquivos de
 * imagem nomeados do WhatsApp no repositório entregue, fundo ilustrado, dependência do clone.
 *
 * Fica de fora, e só ela, a identidade do CANAL na caixa de entrada (`ChannelLogo`): é o ícone que
 * diz qual conta é WhatsApp, Instagram… — informação do produto, não aparência.
 */
const RAIZ = process.cwd();
const lerArq = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

/** Identidade do CANAL (qual conta é WhatsApp, Instagram…), não a marca do produto. */
const LOGO_DE_CANAL = "components/inbox/ChannelLogo.tsx";

function arquivos(dir: string): string[] {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : arquivos(rel);
    return /\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name) ? [rel] : [];
  });
}

/** Arquivos versionados: o que é entregue, sem depender de pasta de build nem de cópia local. */
function versionados(): string[] {
  const saida = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return saida.split("\0").filter(Boolean);
}

describe("visual de mensageiro: nenhuma arte da Meta (ADR 0007)", () => {
  it("nenhum verde ou asset do WhatsApp em app, components ou lib", () => {
    const proibidos = /#(?:25d366|128c7e|075e54|00a884|008069|dcf8c6|d9fdd3|34b7f1|111b21|202c33)\b/i;
    const achados = ["app", "components", "lib"]
      .flatMap(arquivos)
      .filter((f) => f !== LOGO_DE_CANAL)
      .filter((f) => proibidos.test(lerArq(f)) || /whatsapp[-_]?(?:logo|icon)\.(?:svg|png)/i.test(lerArq(f)));
    expect(achados, "cor ou ícone do WhatsApp: use os tokens da marca").toEqual([]);
  });

  it("nenhum arquivo de imagem do WhatsApp na parte entregue do repositório", () => {
    // Evidências de tela (evidence/, docs/) mostram o CANAL WhatsApp no produto e ficam de fora:
    // o que esta trava protege é o que o app serve (public/, app/, components/, lib/).
    const entregues = versionados().filter((f) => /^(?:public|app|components|lib)\//.test(f));
    const imagens = entregues.filter((f) => /\.(?:svg|png|jpe?g|webp|gif|ico)$/i.test(f) && /whats-?app/i.test(f));
    expect(imagens, "imagem nomeada do WhatsApp: é arte da Meta, não entra no produto").toEqual([]);
  });

  it("nenhum fundo ilustrado do WhatsApp referenciado no CSS ou nos componentes", () => {
    // `app/api/` é código de servidor (rotas), sem estilo: um `url(` ali é chamada de função, não CSS.
    const achados = ["app", "components"]
      .flatMap(arquivos)
      .filter((f) => f !== LOGO_DE_CANAL && !f.startsWith("app/api/"))
      .filter((f) => /url\([^)]*whats-?app[^)]*\)/i.test(lerArq(f)) || /bg-whats-?app|wa-bg|whatsapp-bg/i.test(lerArq(f)));
    expect(achados, "o fundo da conversa é bege liso com padrão próprio (ADR 0007)").toEqual([]);
  });

  it("o clone de referência não é dependência nem foi copiado", () => {
    const pacote = lerArq("package.json");
    expect(pacote).not.toMatch(/whatsapp-frontend|ankitrajxd/i);
    const copiados = versionados().filter((f) => /ankitrajxd|whatsapp-frontend/i.test(f) && !f.startsWith("docs/"));
    expect(copiados, "o clone é só referência visual: nada dele entra no repositório (ADR 0007)").toEqual([]);
  });
});
