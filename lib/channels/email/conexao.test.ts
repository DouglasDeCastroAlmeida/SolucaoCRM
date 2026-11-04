import { describe, expect, it, vi } from "vitest";

import { verificarCaixa, type ConfigDaCaixa, type DependenciasDaConexao } from "./conexao";

const SENHA = "S3nh4-Muito-Secreta";

const CONFIG: ConfigDaCaixa = {
  endereco: "atendimento@exemplo.com",
  usuario: "atendimento@exemplo.com",
  senha: SENHA,
  imap: { host: "mail.exemplo.com", porta: 993, seguranca: "ssl" },
  smtp: { host: "mail.exemplo.com", porta: 465, seguranca: "ssl" },
};

const IP_PUBLICO = "93.184.216.34";

/** Servidores simulados: cada teste liga só a falha que quer provar. */
function montar(
  falhas: { imap?: unknown; smtpVerify?: unknown; smtpEnvio?: unknown; dns?: unknown; ip?: string } = {},
) {
  const imap = {
    opcoes: undefined as Record<string, unknown> | undefined,
    connect: vi.fn(async () => {
      if (falhas.imap) throw falhas.imap;
    }),
    mailboxOpen: vi.fn(async (_caminho: string, _opcoes?: { readOnly?: boolean }) => ({
      uidValidity: 1700n,
      uidNext: 42,
      exists: 3,
    })),
    logout: vi.fn(async () => undefined),
    close: vi.fn(),
  };
  const smtp = {
    opcoes: undefined as Record<string, unknown> | undefined,
    verify: vi.fn(async () => {
      if (falhas.smtpVerify) throw falhas.smtpVerify;
      return true as const;
    }),
    sendMail: vi.fn(async (_m: Record<string, unknown>) => {
      if (falhas.smtpEnvio) throw falhas.smtpEnvio;
      return { accepted: [CONFIG.endereco], rejected: [] as string[], messageId: "<teste@exemplo.com>" };
    }),
    close: vi.fn(),
  };
  const deps: DependenciasDaConexao = {
    resolver: async () => {
      if (falhas.dns) throw falhas.dns;
      return [{ address: falhas.ip ?? IP_PUBLICO, family: 4 }];
    },
    criarImap: (opcoes) => {
      imap.opcoes = opcoes as unknown as Record<string, unknown>;
      return imap;
    },
    criarSmtp: (opcoes) => {
      smtp.opcoes = opcoes as unknown as Record<string, unknown>;
      return smtp;
    },
  };
  return { imap, smtp, deps };
}

const erroDeRede = (code: string) => Object.assign(new Error(`connect ${code}`), { code });

describe("conexão com a caixa de e-mail (servidores simulados)", () => {
  it("AC-001.3: com tudo certo entra na caixa de entrada e envia o e-mail de teste para a própria caixa", async () => {
    const { imap, smtp, deps } = montar();
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);

    expect(r).toEqual({ ok: true, uidValidity: "1700", uidNext: 42, testeEnviado: true });
    expect(imap.mailboxOpen).toHaveBeenCalledWith("INBOX", { readOnly: true });
    expect(smtp.sendMail).toHaveBeenCalledTimes(1);
    const enviado = smtp.sendMail.mock.calls[0]?.[0];
    expect(enviado).toMatchObject({ from: CONFIG.endereco, to: CONFIG.endereco });
    expect(imap.logout).toHaveBeenCalled();
    expect(smtp.close).toHaveBeenCalled();
  });

  it("AC-001.4: conecta no IP já validado, com o nome original só como servername e TLS verificado", async () => {
    const { imap, smtp, deps } = montar();
    await verificarCaixa(CONFIG, { enviarTeste: true }, deps);

    expect(imap.opcoes).toMatchObject({
      host: IP_PUBLICO,
      port: 993,
      secure: true,
      servername: "mail.exemplo.com",
      tls: { servername: "mail.exemplo.com", rejectUnauthorized: true },
    });
    expect(smtp.opcoes).toMatchObject({
      host: IP_PUBLICO,
      port: 465,
      secure: true,
      tls: { servername: "mail.exemplo.com", rejectUnauthorized: true },
    });
  });

  it("AC-001.4: porta com STARTTLS exige o upgrade, nunca cai para conexão aberta", async () => {
    const { imap, smtp, deps } = montar();
    const cfg: ConfigDaCaixa = {
      ...CONFIG,
      imap: { host: "mail.exemplo.com", porta: 143, seguranca: "starttls" },
      smtp: { host: "mail.exemplo.com", porta: 587, seguranca: "starttls" },
    };
    await verificarCaixa(cfg, { enviarTeste: false }, deps);
    expect(imap.opcoes).toMatchObject({ secure: false, doSTARTTLS: true });
    expect(smtp.opcoes).toMatchObject({ secure: false, requireTLS: true });
  });

  it("AC-001.3: ao só conectar (sem teste) confere o SMTP sem mandar e-mail nenhum", async () => {
    const { smtp, deps } = montar();
    const r = await verificarCaixa(CONFIG, { enviarTeste: false }, deps);
    expect(r).toMatchObject({ ok: true, testeEnviado: false });
    expect(smtp.verify).toHaveBeenCalled();
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it("AC-001.4: senha recusada no IMAP diz senha em português e para ali, sem tentar o envio", async () => {
    const recusa = Object.assign(new Error("Command failed"), {
      authenticationFailed: true,
      responseText: "Invalid credentials",
    });
    const { smtp, imap, deps } = montar({ imap: recusa });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);

    expect(r).toMatchObject({ ok: false, causa: "senha_recusada", etapa: "leitura" });
    if (!r.ok) expect(r.mensagem).toMatch(/senha/i);
    expect(smtp.verify).not.toHaveBeenCalled();
    expect(smtp.sendMail).not.toHaveBeenCalled();
    expect(imap.connect).toHaveBeenCalledTimes(1);
  });

  it("AC-001.4: provedor que exige senha de app aponta a verificação em duas etapas", async () => {
    const exige = Object.assign(new Error("Command failed"), {
      authenticationFailed: true,
      responseText:
        "Application-specific password required. Learn more at https://support.google.com/accounts/answer/185833",
    });
    const { deps } = montar({ imap: exige });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);

    expect(r).toMatchObject({ ok: false, causa: "verificacao_em_duas_etapas" });
    if (!r.ok) expect(r.mensagem).toMatch(/verificação em duas etapas/i);
  });

  it("AC-001.4: servidor que não existe no DNS vira servidor não encontrado, sem abrir conexão", async () => {
    const { imap, deps } = montar({ dns: erroDeRede("ENOTFOUND") });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);

    expect(r).toMatchObject({ ok: false, causa: "servidor_nao_encontrado" });
    if (!r.ok) expect(r.mensagem).toMatch(/servidor/i);
    expect(imap.connect).not.toHaveBeenCalled();
  });

  it("AC-001.4: porta fechada (conexão recusada) é dita como porta, não como senha", async () => {
    const { deps } = montar({ imap: erroDeRede("ECONNREFUSED") });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);

    expect(r).toMatchObject({ ok: false, causa: "porta_fechada" });
    if (!r.ok) expect(r.mensagem).toMatch(/porta/i);
  });

  it("AC-001.4: servidor lento vira tempo esgotado", async () => {
    const { deps } = montar({ imap: erroDeRede("ETIMEDOUT") });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);
    expect(r).toMatchObject({ ok: false, causa: "tempo_esgotado" });
  });

  it("AC-001.4: certificado recusado é dito como certificado", async () => {
    const { deps } = montar({ imap: erroDeRede("DEPTH_ZERO_SELF_SIGNED_CERT") });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);
    expect(r).toMatchObject({ ok: false, causa: "certificado_recusado" });
  });

  it("AC-001.4: servidor que aponta para rede interna é recusado antes de qualquer conexão", async () => {
    const { imap, smtp, deps } = montar({ ip: "10.0.0.7" });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);

    expect(r).toMatchObject({ ok: false, causa: "destino_proibido", etapa: "leitura" });
    expect(imap.connect).not.toHaveBeenCalled();
    expect(smtp.verify).not.toHaveBeenCalled();
  });

  it("AC-001.4: porta que não é de e-mail é recusada antes de qualquer conexão", async () => {
    const { imap, deps } = montar();
    const cfg: ConfigDaCaixa = { ...CONFIG, imap: { host: "mail.exemplo.com", porta: 5432, seguranca: "ssl" } };
    const r = await verificarCaixa(cfg, { enviarTeste: true }, deps);

    expect(r).toMatchObject({ ok: false, causa: "porta_nao_permitida" });
    expect(imap.connect).not.toHaveBeenCalled();
  });

  it("AC-001.3: senha recusada só no envio é reportada na etapa de envio", async () => {
    const recusa = Object.assign(new Error("Invalid login: 535 Authentication failed"), {
      code: "EAUTH",
      responseCode: 535,
    });
    const { smtp, deps } = montar({ smtpVerify: recusa });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);

    expect(r).toMatchObject({ ok: false, causa: "senha_recusada", etapa: "envio" });
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it("AC-001.3: servidor que aceita o login mas recusa a mensagem de teste é envio recusado", async () => {
    const recusa = Object.assign(new Error("550 5.7.1 Message rejected"), { code: "EMESSAGE", responseCode: 550 });
    const { deps } = montar({ smtpEnvio: recusa });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);
    expect(r).toMatchObject({ ok: false, causa: "envio_recusado", etapa: "envio" });
  });

  it("AC-007.2: o resultado nunca carrega a senha, nem quando o servidor a ecoa no erro", async () => {
    const eco = Object.assign(new Error(`AUTH PLAIN ${SENHA} falhou`), {
      authenticationFailed: true,
      responseText: `bad password ${SENHA}`,
    });
    const { deps } = montar({ imap: eco });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);

    expect(JSON.stringify(r)).not.toContain(SENHA);
  });

  it("AC-001.4: erro que não sabemos classificar é dito como tal, sem inventar causa", async () => {
    const { deps } = montar({ imap: new Error("algo estranho") });
    const r = await verificarCaixa(CONFIG, { enviarTeste: true }, deps);
    expect(r).toMatchObject({ ok: false, causa: "desconhecida" });
  });

  it("AC-001.3: fecha as conexões mesmo quando a verificação falha", async () => {
    const { imap, smtp, deps } = montar({ smtpVerify: erroDeRede("ECONNREFUSED") });
    await verificarCaixa(CONFIG, { enviarTeste: true }, deps);
    expect(imap.logout).toHaveBeenCalled();
    expect(smtp.close).toHaveBeenCalled();
  });
});
