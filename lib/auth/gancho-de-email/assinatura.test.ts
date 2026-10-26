import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { assinaturaValida, segredoDoGancho } from "./assinatura";

const CHAVE = Buffer.from("segredo-de-teste-com-bytes-suficientes").toString("base64");
const SEGREDO = `v1,whsec_${CHAVE}`;
const AGORA = 1_800_000_000; // segundos
const CORPO = '{"user":{"email":"a@b.co"}}';

function assinar(id: string, ts: number, corpo: string): string {
  const mac = createHmac("sha256", Buffer.from(CHAVE, "base64")).update(`${id}.${ts}.${corpo}`).digest("base64");
  return `v1,${mac}`;
}

describe("assinatura do gancho (Standard Webhooks)", () => {
  it("AC-006.2: aceita a assinatura calculada com o segredo, com ou sem o prefixo v1,", () => {
    const sig = assinar("msg_1", AGORA, CORPO);
    const base = { id: "msg_1", timestamp: String(AGORA), assinatura: sig, corpo: CORPO, agoraSeg: AGORA };
    expect(assinaturaValida({ ...base, segredo: SEGREDO })).toBe(true);
    expect(assinaturaValida({ ...base, segredo: `whsec_${CHAVE}` })).toBe(true);
  });

  it("AC-006.2: recusa corpo adulterado", () => {
    const sig = assinar("msg_1", AGORA, CORPO);
    expect(
      assinaturaValida({ id: "msg_1", timestamp: String(AGORA), assinatura: sig, corpo: CORPO + " ", segredo: SEGREDO, agoraSeg: AGORA }),
    ).toBe(false);
  });

  it("AC-006.2: recusa assinatura de outro segredo", () => {
    const outra = `v1,${createHmac("sha256", "outra").update(`msg_1.${AGORA}.${CORPO}`).digest("base64")}`;
    expect(
      assinaturaValida({ id: "msg_1", timestamp: String(AGORA), assinatura: outra, corpo: CORPO, segredo: SEGREDO, agoraSeg: AGORA }),
    ).toBe(false);
  });

  it("AC-006.2: recusa timestamp fora da tolerância de 5 minutos (replay)", () => {
    const velho = AGORA - 301;
    const sig = assinar("msg_1", velho, CORPO);
    expect(
      assinaturaValida({ id: "msg_1", timestamp: String(velho), assinatura: sig, corpo: CORPO, segredo: SEGREDO, agoraSeg: AGORA }),
    ).toBe(false);
  });

  it("AC-006.2: recusa quando o segredo está vazio ou faltam cabeçalhos", () => {
    const sig = assinar("msg_1", AGORA, CORPO);
    expect(assinaturaValida({ id: "msg_1", timestamp: String(AGORA), assinatura: sig, corpo: CORPO, segredo: "", agoraSeg: AGORA })).toBe(false);
    expect(assinaturaValida({ id: "", timestamp: String(AGORA), assinatura: sig, corpo: CORPO, segredo: SEGREDO, agoraSeg: AGORA })).toBe(false);
    expect(assinaturaValida({ id: "msg_1", timestamp: "abc", assinatura: sig, corpo: CORPO, segredo: SEGREDO, agoraSeg: AGORA })).toBe(false);
  });

  it("AC-006.2: aceita quando uma entre várias assinaturas separadas por espaço confere", () => {
    const sig = assinar("msg_1", AGORA, CORPO);
    expect(
      assinaturaValida({ id: "msg_1", timestamp: String(AGORA), assinatura: `v1,AAAA ${sig}`, corpo: CORPO, segredo: SEGREDO, agoraSeg: AGORA }),
    ).toBe(true);
  });

  it("segredoDoGancho tira os prefixos v1, e whsec_", () => {
    expect(segredoDoGancho(SEGREDO)?.toString("base64")).toBe(CHAVE);
    expect(segredoDoGancho("")).toBeNull();
  });
});
