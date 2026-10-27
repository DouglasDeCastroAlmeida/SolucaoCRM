/**
 * AC-004.3 e AC-006.4: todo texto novo da mudança 007 sai em pt-BR, es e en, com
 * chave ÚNICA no dicionário e o literal do código IDÊNTICO à chave.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  confirmacaoDoClienteLigadaNaInstalacao,
  montarAgradecimento,
} from "@/lib/agenda/aplicar-confirmacao-do-cliente";
import { FRASE_DE_CONFIRMACAO_PT, textoPadraoDoLembrete } from "@/lib/agenda/lembrete-padrao";
import { traduzir } from "@/lib/i18n/dicionario";

const raiz = process.cwd();
const dicionario = readFileSync(join(raiz, "lib/i18n/dicionario.ts"), "utf8");
const aplicar = readFileSync(join(raiz, "lib/agenda/aplicar-confirmacao-do-cliente.ts"), "utf8");

/** O literal de uma constante `NOME = "..."` do módulo (pode quebrar a linha depois do `=`). */
function literalDe(nome: string): string {
  const m = new RegExp(`const ${nome} =\\s*\\n?\\s*"([^"]+)";`).exec(aplicar);
  if (!m) throw new Error(`constante ${nome} não encontrada`);
  return m[1];
}

function ocorrenciasDaChave(chave: string): number {
  return dicionario.split(`\n  ${JSON.stringify(chave)}:`).length - 1;
}

const TEXTOS_PT = {
  agradecimento: literalDe("AGRADECIMENTO_PT"),
  respostaRemarcar: literalDe("RESPOSTA_REMARCAR_PT"),
  avisoTitulo: literalDe("AVISO_TITULO_PT"),
  avisoCorpo: literalDe("AVISO_CORPO_PT"),
};

const OUTRAS_CHAVES = [
  "Confirmado pelo cliente",
  "Pediu para remarcar",
  "Pedir confirmação ao cliente",
  "Ativar lembretes padrão",
  FRASE_DE_CONFIRMACAO_PT,
];

describe("textos novos da confirmação do cliente", () => {
  it.each([...Object.entries(TEXTOS_PT), ...OUTRAS_CHAVES.map((c) => [c, c] as const)])(
    "AC-006.4: %s tem chave única e entrada es diferente do pt-BR",
    (_nome, chave) => {
      expect(ocorrenciasDaChave(chave)).toBe(1);
      expect(traduzir(chave, "es")).not.toBe(chave);
      expect(traduzir(chave, "pt-BR")).toBe(chave);
    },
  );

  it("AC-004.3: agradecimento sai em pt-BR, es e en, sem sobra de molde", () => {
    const base = {
      tipo: "Avaliação",
      quando: new Date("2026-11-05T17:30:00.000Z"),
      timezone: "America/Sao_Paulo",
    };
    const pt = montarAgradecimento({ ...base, idioma: "pt-BR" });
    const es = montarAgradecimento({ ...base, idioma: "es" });
    const en = montarAgradecimento({ ...base, idioma: "en" });
    expect(pt).toMatch(/^Obrigado pela confirmação!.*Avaliação.*14:30/);
    expect(es).toMatch(/^¡Gracias por confirmar!.*Avaliação.*14:30/);
    expect(en).toMatch(/^Thank you for confirming!.*Avaliação.*14:30/);
    for (const t of [pt, es, en]) expect(t).not.toContain("{{");
  });

  it("AC-006.4: o inglês do módulo existe para cada texto de resposta e aviso", () => {
    for (const nome of ["RESPOSTA_REMARCAR_EN", "AVISO_TITULO_EN", "AVISO_CORPO_EN", "AGRADECIMENTO_EN"]) {
      expect(literalDe(nome).length).toBeGreaterThan(10);
    }
  });

  it("AC-006.4: texto padrão do lembrete com a frase de confirmação sai nos 3 idiomas", () => {
    expect(textoPadraoDoLembrete("dia_antes", "pt-BR", true)).toContain(FRASE_DE_CONFIRMACAO_PT);
    expect(textoPadraoDoLembrete("dia_antes", "es", true)).toContain("Responde 1");
    expect(textoPadraoDoLembrete("horas_antes", "en", true)).toContain("Reply 1");
  });
});

describe("caixa da chave AGENDA_CONFIRMACAO_CLIENTE", () => {
  const antes = process.env.AGENDA_CONFIRMACAO_CLIENTE;
  afterEach(() => {
    if (antes === undefined) delete process.env.AGENDA_CONFIRMACAO_CLIENTE;
    else process.env.AGENDA_CONFIRMACAO_CLIENTE = antes;
  });

  it.each(["off", "OFF", " Off ", "FALSE", "Desligado", "0"])("AC-005.2: %j desliga", (v) => {
    process.env.AGENDA_CONFIRMACAO_CLIENTE = v;
    expect(confirmacaoDoClienteLigadaNaInstalacao()).toBe(false);
  });

  it.each(["", "on", "true", "ligado"])("AC-005.2: %j mantém ligada", (v) => {
    process.env.AGENDA_CONFIRMACAO_CLIENTE = v;
    expect(confirmacaoDoClienteLigadaNaInstalacao()).toBe(true);
  });
});
