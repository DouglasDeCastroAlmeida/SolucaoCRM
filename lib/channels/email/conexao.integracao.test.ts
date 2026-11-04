import { describe, expect, it } from "vitest";

import { verificarCaixa } from "./conexao";

/**
 * Integração OPCIONAL contra um servidor de e-mail de verdade (o servidor de teste da
 * homologação). Desligada por padrão: só roda com EMAIL_TESTE_REAL=1 e as variáveis
 * EMAIL_TESTE_HOST, EMAIL_TESTE_USUARIO e EMAIL_TESTE_SENHA. Nada daqui é impresso.
 *
 * Passa pelo `validarDestino` de verdade: o servidor precisa ter IP público.
 */
const ligado = process.env.EMAIL_TESTE_REAL === "1";
const host = process.env.EMAIL_TESTE_HOST ?? "";
const usuario = process.env.EMAIL_TESTE_USUARIO ?? "";
const senha = process.env.EMAIL_TESTE_SENHA ?? "";

describe.skipIf(!ligado || !host || !usuario || !senha)("conexão real (opcional)", () => {
  it("AC-001.3: entra na caixa de entrada e confere o envio, sem mandar e-mail", async () => {
    const r = await verificarCaixa(
      {
        endereco: usuario,
        usuario,
        senha,
        imap: { host, porta: 993, seguranca: "ssl" },
        smtp: { host, porta: 465, seguranca: "ssl" },
      },
      { enviarTeste: false },
    );

    expect(r.ok).toBe(true);
  });

  it("AC-001.4: senha errada é dita como senha recusada", async () => {
    const r = await verificarCaixa(
      {
        endereco: usuario,
        usuario,
        senha: "senha-errada-de-proposito",
        imap: { host, porta: 993, seguranca: "ssl" },
        smtp: { host, porta: 465, seguranca: "ssl" },
      },
      { enviarTeste: false },
    );

    expect(r).toMatchObject({ ok: false, causa: "senha_recusada" });
  });
});
