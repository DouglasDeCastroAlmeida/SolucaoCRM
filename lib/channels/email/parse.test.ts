import { describe, expect, it } from "vitest";

import { lerEmail } from "./parse";

const CRLF = (linhas: string[]) => Buffer.from(linhas.join("\r\n"), "utf8");

const simples = CRLF([
  "From: =?UTF-8?B?Sm/Do28gU2lsdmE=?= <Joao@Exemplo.com>",
  "To: caixa@meunegocio.com",
  "Subject: =?UTF-8?Q?Or=C3=A7amento_do_site?=",
  "Message-ID: <abc123@exemplo.com>",
  "In-Reply-To: <anterior@meunegocio.com>",
  "References: <primeiro@meunegocio.com> <anterior@meunegocio.com>",
  "Date: Tue, 03 Nov 2026 10:00:00 +0000",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Quanto custa o site?",
  "",
]);

describe("lerEmail", () => {
  it("AC-002.1: le assunto, texto, remetente, data e Message-ID", async () => {
    const r = await lerEmail(simples);
    if (!r.ok) throw new Error("deveria ler");
    expect(r.email.assunto).toBe("Orçamento do site");
    expect(r.email.texto.trim()).toBe("Quanto custa o site?");
    expect(r.email.remetente).toEqual({ endereco: "joao@exemplo.com", nome: "João Silva" });
    expect(r.email.messageId).toBe("<abc123@exemplo.com>");
    expect(r.email.data?.toISOString()).toBe("2026-11-03T10:00:00.000Z");
  });

  it("AC-002.4: le In-Reply-To e References para o encadeamento", async () => {
    const r = await lerEmail(simples);
    if (!r.ok) throw new Error("deveria ler");
    expect(r.email.inReplyTo).toBe("<anterior@meunegocio.com>");
    expect(r.email.references).toEqual(["<primeiro@meunegocio.com>", "<anterior@meunegocio.com>"]);
  });

  it("AC-002.1: anexo pequeno vem com conteudo e anexo acima do limite vem so descrito", async () => {
    const fonte = CRLF([
      "From: ana@exemplo.com",
      "To: caixa@meunegocio.com",
      "Subject: Arquivos",
      "Message-ID: <m2@exemplo.com>",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="B"',
      "",
      "--B",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Seguem.",
      "--B",
      'Content-Type: text/plain; name="pequeno.txt"',
      'Content-Disposition: attachment; filename="pequeno.txt"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("oi").toString("base64"),
      "--B",
      'Content-Type: application/pdf; name="grande.pdf"',
      'Content-Disposition: attachment; filename="grande.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.alloc(3000, 1).toString("base64"),
      "--B--",
      "",
    ]);
    const r = await lerEmail(fonte, { limiteDoAnexoBytes: 1000 });
    if (!r.ok) throw new Error("deveria ler");
    expect(r.email.anexos).toHaveLength(1);
    expect(r.email.anexos[0]).toMatchObject({ nome: "pequeno.txt", tipo: "text/plain", tamanho: 2 });
    expect(r.email.anexos[0]!.conteudo.toString()).toBe("oi");
    expect(r.email.anexosOmitidos).toEqual([{ nome: "grande.pdf", tipo: "application/pdf", tamanho: 3000 }]);
  });

  it("AC-007.3: o HTML sai higienizado e o texto vem do HTML quando nao ha parte de texto", async () => {
    const fonte = CRLF([
      "From: ana@exemplo.com",
      "Subject: Html",
      "Message-ID: <m3@exemplo.com>",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<p>Oi <b>voce</b></p><script>alert(1)</script><img src="http://rastreio.com/x.gif">',
      "",
    ]);
    const r = await lerEmail(fonte);
    if (!r.ok) throw new Error("deveria ler");
    expect(r.email.html).toBe("<p>Oi <b>voce</b></p>");
    expect(r.email.texto).toContain("Oi voce");
    expect(r.email.texto).not.toContain("alert");
  });

  it("AC-006.3: sem remetente legivel o e-mail e malformado", async () => {
    const r = await lerEmail(CRLF(["Subject: sem remetente", "", "corpo", ""]));
    expect(r).toEqual({ ok: false, motivo: "sem_remetente" });
  });

  it("AC-006.3: sem Message-ID o identificador e derivado do conteudo, sempre o mesmo para o mesmo e-mail", async () => {
    const fonte = CRLF(["From: ana@exemplo.com", "Subject: x", "", "corpo", ""]);
    const a = await lerEmail(fonte);
    const b = await lerEmail(fonte);
    if (!a.ok || !b.ok) throw new Error("deveria ler");
    expect(a.email.messageId).toMatch(/^<sem-id-[0-9a-f]{40}@canal-email\.local>$/);
    expect(a.email.messageId).toBe(b.email.messageId);
  });

  it("AC-003.1: expoe os cabecalhos que a regra de automatico le", async () => {
    const fonte = CRLF([
      "From: loja@exemplo.com",
      "Subject: Promo",
      "Message-ID: <p@exemplo.com>",
      "List-Unsubscribe: <mailto:sair@exemplo.com>",
      "Precedence: bulk",
      "Auto-Submitted: auto-generated",
      "Content-Type: multipart/report; report-type=delivery-status; boundary=zz",
      "",
      "--zz",
      "Content-Type: text/plain",
      "",
      "x",
      "--zz--",
      "",
    ]);
    const r = await lerEmail(fonte);
    if (!r.ok) throw new Error("deveria ler");
    expect(r.email.cabecalhos["list-unsubscribe"]).toBeDefined();
    expect(r.email.cabecalhos.precedence).toBe("bulk");
    expect(r.email.cabecalhos["auto-submitted"]).toBe("auto-generated");
    expect(r.email.cabecalhos["content-type"]).toContain("report-type=delivery-status");
  });
});
