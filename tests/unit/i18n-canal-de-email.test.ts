import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MENSAGEM_DA_CAUSA } from "@/lib/channels/email/conexao";
import { DICIONARIO } from "@/lib/i18n/dicionario";

/**
 * AC-009.5 (mudança 005): todo texto novo do canal de e-mail sai do dicionário
 * (pt-BR é a própria chave; es é obrigatório; o catálogo en está em construção e
 * nenhuma tela o lê — ver `i18n-textos-novos-da-006`), e nenhuma tela do canal
 * deixa frase em português fora de t().
 */

const RAIZ = join(__dirname, "..", "..");

const ARQUIVOS_COM_T = [
  "app/api/v1/channels/email/[id]/route.ts",
  "app/api/v1/channels/email/ignorados/[id]/promover/route.ts",
  "app/api/v1/channels/email/ignorados/route.ts",
  "app/api/v1/channels/email/remetentes/route.ts",
  "app/api/v1/channels/email/route.ts",
  "app/api/v1/channels/email/testar/route.ts",
  "lib/channels/email/avisos.ts",
  "lib/channels/email/rotas.ts",
  "components/connections/CanalEmailClient.tsx",
  "components/connections/email/AssistenteDeConexao.tsx",
  "components/connections/email/CartaoDaCaixa.tsx",
  "components/inbox/EmailDaMensagem.tsx",
  "components/inbox/Composer.tsx",
  "components/inbox/MessageBubble.tsx",
] as const;

// Composer e MessageBubble são compartilhados com outros canais: entram só na checagem de espanhol (o JSX solto deles é de quem os criou).
const ARQUIVOS_TSX = ARQUIVOS_COM_T.filter((a) => a.endsWith(".tsx") && !/Composer|MessageBubble/.test(a));

const CHAMADA =
  /(?<![\w.])(?:t|ts|traduzir|traduzirTexto)\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`$]*`)/g;

function chavesDe(arquivo: string): string[] {
  const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
  return [...fonte.matchAll(CHAMADA)].map((m) => (m[1] ?? "").slice(1, -1).replace(/\\(["'`])/g, "$1"));
}

describe("AC-009.5: textos do canal de e-mail saem do dicionário", () => {
  it("AC-009.5: a varredura enxerga chamadas de tradução (não é vacuidade)", () => {
    expect(ARQUIVOS_COM_T.flatMap(chavesDe).length).toBeGreaterThan(60);
  });

  it("AC-009.5: todo literal passado a t()/traduzir() tem espanhol", () => {
    const sem = ARQUIVOS_COM_T.flatMap((a) =>
      chavesDe(a)
        .filter((k) => !DICIONARIO[k]?.es)
        .map((k) => `${a} → ${k.slice(0, 90)}`),
    );
    expect(sem).toEqual([]);
  });

  it("AC-009.5: toda causa de falha da conexão tem espanhol", () => {
    expect(Object.values(MENSAGEM_DA_CAUSA).filter((k) => !DICIONARIO[k]?.es)).toEqual([]);
  });

  it("AC-009.5: nenhuma tela do canal deixa frase em português fora de t()", () => {
    const soltos: string[] = [];
    for (const a of ARQUIVOS_TSX) {
      const fonte = readFileSync(join(RAIZ, a), "utf8");
      // Texto corrido entre tags: >Texto com letras<
      for (const m of fonte.matchAll(/>\s*([A-ZÀ-Ú][^<>{}\n]*[a-zà-ú][^<>{}\n]*)\s*</g)) {
        soltos.push(`${a} → ${(m[1] ?? "").trim()}`);
      }
      for (const m of fonte.matchAll(/\b(?:placeholder|aria-label|title|alt)="([^"{}]*[A-Za-zÀ-ú]{3,}[^"{}]*)"/g)) {
        soltos.push(`${a} → ${m[1]}`);
      }
    }
    expect(soltos).toEqual([]);
  });
});
