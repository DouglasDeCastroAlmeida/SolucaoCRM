/**
 * AC-007.4 e AC-007.5: todo texto novo do inbox (mudança 004) existe em pt-BR e
 * em es com chave ÚNICA no dicionário, e o literal do código é IDÊNTICO à chave.
 * Os literais vêm do próprio código (não de lista manual): texto novo sem
 * tradução reprova aqui.
 *
 * Inglês: este módulo não usa mapa local de en. As funções recebem `t` por
 * parâmetro e o dicionário só tem pt-BR e es (`Idioma`); o en cai no próprio
 * pt-BR por desenho do `traduzir`, igual ao resto das telas do inbox.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { traduzir } from "@/lib/i18n/dicionario";
import { ROTULO_DO_TIPO } from "@/lib/messaging/previa-da-mensagem";

const raiz = process.cwd();
const ler = (arquivo: string) => readFileSync(join(raiz, arquivo), "utf8");
const dicionario = ler("lib/i18n/dicionario.ts");

/** Arquivos que a mudança 004 tocou e que escrevem texto de tela com `t("…")`. */
const ARQUIVOS = [
  "lib/inbox/formato-da-lista.ts",
  "lib/inbox/agrupar-mensagens.ts",
  "components/inbox/MessageBubble.tsx",
  "components/inbox/InboxFilters.tsx",
  "components/inbox/ConversationListItem.tsx",
  "components/inbox/ChatThread.tsx",
];

function literaisDe(arquivo: string): string[] {
  const achados = [...ler(arquivo).matchAll(/\bt\(\s*"([^"\n]+)"\s*\)/g)].map((m) => m[1]!);
  return achados;
}

const LITERAIS = [
  ...new Set([...ARQUIVOS.flatMap(literaisDe), ...Object.values(ROTULO_DO_TIPO)]),
].sort();

/** Chave no dicionário, com ou sem aspas (identificador simples vem sem). */
function ocorrenciasDaChave(chave: string): number {
  const comAspas = dicionario.split(`
  ${JSON.stringify(chave)}:`).length - 1;
  const semAspas = dicionario.split(`
  ${chave}:`).length - 1;
  return comAspas + semAspas;
}

// Palavras que se escrevem igual em espanhol: a entrada existe, mas o texto coincide.
const IGUAL_EM_ES = new Set([
  "Anonimizado",
  "Bloqueado",
  "Cancelar",
  "Cliente",
  "Documento",
  "Enviando",
  "Filtrar por número de WhatsApp",
  "Grupo",
  "Grupos",
  "Sistema",
]);

describe("textos do inbox no estilo WhatsApp (i18n)", () => {
  it("AC-007.4: o teste achou os textos novos conhecidos no código", () => {
    for (const esperado of [
      "Você:",
      "Enviando",
      "Hoje",
      "Ontem",
      "Sem mensagens",
      "Não atribuídas: esperando um atendente",
      "IA: conduzidas pelo atendimento automático",
    ]) {
      expect(LITERAIS).toContain(esperado);
    }
  });

  it.each(LITERAIS)("AC-007.4: %s tem chave única e entrada es", (chave) => {
    expect(ocorrenciasDaChave(chave)).toBe(1);
    expect(traduzir(chave, "pt-BR")).toBe(chave);
    const es = traduzir(chave, "es");
    expect(es.length).toBeGreaterThan(0);
    if (!IGUAL_EM_ES.has(chave)) expect(es).not.toBe(chave);
  });
});
