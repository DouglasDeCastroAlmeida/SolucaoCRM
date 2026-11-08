import { describe, expect, it } from "vitest";

import {
  HOST_DA_HOMOLOGACAO,
  URL_DA_HOMOLOGACAO,
  lerCredenciaisHml,
  montarIndice,
  navegacaoPermitida,
  redigir,
  resolverAlvo,
} from "../e2e/helpers/visual-de-mensageiro-alvo";

/**
 * Issue #103: a jornada de capturas pode rodar contra a homologação, e SÓ contra ela. Aqui ficam as duas
 * garantias que não se provam olhando uma captura: recusa de qualquer outro host e ausência de segredo
 * em qualquer texto que a jornada produz.
 */
// Valores inventados só para este teste; nada a ver com a conta real.
const EMAIL = "conta.de.teste@exemplo.test";
const SENHA = "Senha-Inventada-9Zq!";

describe("resolverAlvo: o modo e o host da jornada", () => {
  it("sem VISUAL_ALVO fica no modo local de sempre", () => {
    expect(resolverAlvo({})).toEqual({ modo: "local" });
    expect(resolverAlvo({ VISUAL_ALVO: "" })).toEqual({ modo: "local" });
  });

  it("VISUAL_ALVO=hml usa exatamente a homologação", () => {
    expect(resolverAlvo({ VISUAL_ALVO: "hml" })).toEqual({ modo: "hml", baseURL: URL_DA_HOMOLOGACAO });
    expect(URL_DA_HOMOLOGACAO).toBe("https://hml.corretora.io");
  });

  it.each(["prod", "producao", "https://corretora.io", "HML ", "local", "hml.corretora.io"])(
    "recusa o alvo %j",
    (alvo) => {
      expect(() => resolverAlvo({ VISUAL_ALVO: alvo })).toThrow(/recus/i);
    },
  );

  it.each([
    "https://corretora.io",
    "https://app.corretora.io",
    "https://hml.corretora.io.atacante.com",
    "https://atacante.com/hml.corretora.io",
    "https://user@corretora.io",
    "http://hml.corretora.io",
    "https://hml.corretora.io:8443",
    "https://hml.corretora.io@corretora.io",
    "http://localhost:3001",
    "isto nao e url",
  ])("recusa base apontada para %j mesmo com VISUAL_ALVO=hml", (url) => {
    expect(() => resolverAlvo({ VISUAL_ALVO: "hml", VISUAL_BASE_URL: url })).toThrow(/recus/i);
    expect(() => resolverAlvo({ VISUAL_ALVO: "hml", PLAYWRIGHT_BASE_URL: url })).toThrow(/recus/i);
  });

  it("aceita a base explícita quando é exatamente a homologação", () => {
    expect(resolverAlvo({ VISUAL_ALVO: "hml", VISUAL_BASE_URL: "https://hml.corretora.io/" })).toEqual({
      modo: "hml",
      baseURL: URL_DA_HOMOLOGACAO,
    });
  });
});

describe("navegacaoPermitida: nada sai do host da homologação", () => {
  it("deixa passar só o host exato, em https", () => {
    expect(navegacaoPermitida(`https://${HOST_DA_HOMOLOGACAO}/app/inbox?x=1`)).toBe(true);
  });

  it.each([
    "https://corretora.io/app",
    "https://hml.corretora.io.atacante.com/",
    "http://hml.corretora.io/",
    "https://accounts.google.com/",
    "about:blank#x",
    "nao e url",
  ])("barra %j", (url) => {
    expect(navegacaoPermitida(url)).toBe(false);
  });
});

describe("lerCredenciaisHml: de onde vêm e-mail e senha", () => {
  it("lê do ambiente", () => {
    expect(lerCredenciaisHml({ HML_ADMIN_EMAIL: EMAIL, HML_ADMIN_PASSWORD: SENHA }, () => undefined)).toEqual({
      email: EMAIL,
      senha: SENHA,
    });
  });

  it("cai no arquivo local de segredos, ignorando comentários e aspas", () => {
    const arquivo = `# conta de teste\nHML_ADMIN_EMAIL="${EMAIL}"\nHML_ADMIN_PASSWORD='${SENHA}'\n`;
    expect(lerCredenciaisHml({}, () => arquivo)).toEqual({ email: EMAIL, senha: SENHA });
  });

  it("falha sem repetir valor nenhum quando falta uma chave", () => {
    let erro = "";
    try {
      lerCredenciaisHml({ HML_ADMIN_EMAIL: EMAIL }, () => undefined);
    } catch (e) {
      erro = (e as Error).message;
    }
    expect(erro).toMatch(/HML_ADMIN_PASSWORD/);
    expect(erro).not.toContain(EMAIL);
  });
});

describe("redigir e montarIndice: nenhum segredo em saída", () => {
  it("troca e-mail e senha onde aparecerem, inclusive repetidos e dentro de URL", () => {
    const texto = `fill("${SENHA}") em ${EMAIL}; de novo ${SENHA}; url=?p=${encodeURIComponent(SENHA)}`;
    const limpo = redigir(texto, [EMAIL, SENHA]);
    expect(limpo).not.toContain(SENHA);
    expect(limpo).not.toContain(EMAIL);
    expect(limpo).not.toContain(encodeURIComponent(SENHA));
    expect(limpo).toContain("[segredo]");
  });

  it("ignora segredo vazio (não pode apagar o texto todo)", () => {
    expect(redigir("abc", [""])).toBe("abc");
  });

  it("o índice traz data, host e cada captura, e passa limpo mesmo com segredo na observação", () => {
    const md = montarIndice({
      fase: "antes",
      host: HOST_DA_HOMOLOGACAO,
      data: "2026-11-07",
      segredos: [EMAIL, SENHA],
      registros: [
        { etapa: 1, slug: "inbox-casca", viewport: "celular", tema: "escuro", status: "ok" },
        {
          etapa: 1,
          slug: "painel-inicial",
          viewport: "celular",
          tema: "claro",
          status: "falha",
          observacao: `estouro de 12px; fill("${SENHA}")`,
        },
        { etapa: 4, slug: "admin-painel", viewport: "computador", tema: "claro", status: "pulada", observacao: "conta não é da plataforma" },
      ],
    });
    expect(md).toContain("2026-11-07");
    expect(md).toContain(HOST_DA_HOMOLOGACAO);
    expect(md).toContain("etapa-1/inbox-casca-celular-escuro.png");
    expect(md).toMatch(/painel-inicial.*falha/);
    expect(md).toMatch(/admin-painel.*pulada.*conta não é da plataforma/);
    expect(md).not.toContain(SENHA);
    expect(md).not.toContain(EMAIL);
  });

  it("não cria link para captura que não existe (falha e pulada ficam sem arquivo)", () => {
    const md = montarIndice({
      fase: "antes",
      host: HOST_DA_HOMOLOGACAO,
      data: "2026-11-07",
      segredos: [],
      registros: [{ etapa: 2, slug: "x", viewport: "celular", tema: "claro", status: "pulada", observacao: "motivo" }],
    });
    expect(md).not.toContain("x-celular-claro.png");
  });
});
