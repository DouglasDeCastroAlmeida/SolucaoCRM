import { describe, expect, it } from "vitest";

import { PORTAS_PERMITIDAS, validarDestino, type ResolvedorDns } from "./destino-seguro";

/** DNS simulado: devolve o que o teste manda, sem tocar a rede. */
const dns = (...enderecos: string[]): ResolvedorDns => async () =>
  enderecos.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

describe("destino seguro do servidor de e-mail", () => {
  it.each([
    ["loopback", "127.0.0.1"],
    ["loopback fora do .1", "127.8.9.10"],
    ["link-local", "169.254.1.1"],
    ["metadata de nuvem", "169.254.169.254"],
    ["RFC1918 10/8", "10.0.0.5"],
    ["RFC1918 172.16/12", "172.20.1.1"],
    ["RFC1918 192.168/16", "192.168.0.10"],
    ["CGNAT", "100.64.0.1"],
    ["multicast", "224.0.0.1"],
    ["este host", "0.0.0.0"],
    ["IPv6 loopback", "::1"],
    ["IPv6 compatível com IPv4 (::7f00:1)", "::7f00:1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv6 ULA", "fd00::1"],
    ["IPv6 mapeado de loopback", "::ffff:127.0.0.1"],
    ["IPv6 mapeado de RFC1918", "::ffff:10.0.0.1"],
  ])("AC-001.4: recusa %s (%s) escrito como IP", async (_nome, ip) => {
    const r = await validarDestino(ip, 993, { resolver: dns() });
    expect(r).toMatchObject({ ok: false, motivo: "ip_proibido" });
  });

  it("AC-001.4: DNS que resolve para IP especial é recusado, mesmo com nome público", async () => {
    const r = await validarDestino("imap.exemplo.com", 993, { resolver: dns("169.254.169.254") });
    expect(r).toMatchObject({ ok: false, motivo: "ip_proibido" });
  });

  it("AC-001.4: recusa se QUALQUER resposta do DNS for especial (rebinding por resposta mista)", async () => {
    const r = await validarDestino("imap.exemplo.com", 993, { resolver: dns("203.0.113.9", "10.0.0.1") });
    expect(r).toMatchObject({ ok: false, motivo: "ip_proibido" });
  });

  it.each([143, 993, 465, 587])("AC-001.4: aceita a porta %i", async (porta) => {
    const r = await validarDestino("mail.exemplo.com", porta, { resolver: dns("93.184.216.34") });
    expect(r.ok).toBe(true);
  });

  it.each([22, 25, 80, 3306, 5432, 6379, 0, 65535])("AC-001.4: recusa a porta %i", async (porta) => {
    const r = await validarDestino("mail.exemplo.com", porta, { resolver: dns("93.184.216.34") });
    expect(r).toMatchObject({ ok: false, motivo: "porta_proibida" });
  });

  it("AC-001.4: as portas permitidas são exatamente 143, 993, 465 e 587", () => {
    expect([...PORTAS_PERMITIDAS].sort((a, b) => a - b)).toEqual([143, 465, 587, 993]);
  });

  it("AC-001.4: fixa o IP resolvido e mantém o nome original como servername do TLS", async () => {
    const r = await validarDestino("Mail.Exemplo.com", 993, { resolver: dns("93.184.216.34") });
    expect(r).toEqual({ ok: true, ip: "93.184.216.34", servername: "mail.exemplo.com", porta: 993 });
  });

  it("AC-001.4: com host que já é IP público, o servername é o próprio IP", async () => {
    const r = await validarDestino("93.184.216.34", 465, { resolver: dns() });
    expect(r).toEqual({ ok: true, ip: "93.184.216.34", servername: "93.184.216.34", porta: 465 });
  });

  it.each(["", "  ", "com espaço.com", "host/caminho", "http://x.com", "a@b.com", "x".repeat(300)])(
    "AC-001.4: recusa host malformado %j",
    async (host) => {
      const r = await validarDestino(host, 993, { resolver: dns("93.184.216.34") });
      expect(r).toMatchObject({ ok: false, motivo: "host_invalido" });
    },
  );

  it("AC-001.4: nome que não resolve é 'nao_resolve'", async () => {
    const falha: ResolvedorDns = async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" });
    };
    const r = await validarDestino("naoexiste.exemplo.com", 993, { resolver: falha });
    expect(r).toMatchObject({ ok: false, motivo: "nao_resolve" });
  });

  it("AC-001.4: resposta vazia do DNS é 'nao_resolve'", async () => {
    const r = await validarDestino("vazio.exemplo.com", 993, { resolver: dns() });
    expect(r).toMatchObject({ ok: false, motivo: "nao_resolve" });
  });
});
