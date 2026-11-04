import { beforeEach, describe, expect, it } from "vitest";

import { criarBancoFalso, type BancoFalso } from "../../../tests/helpers/banco-falso-do-email";
import {
  avisarTetoAtingido,
  decidirAdmissao,
  diaNoFuso,
  fusoDaOrganizacao,
  inicioDoDiaSeguinte,
  registrarEnvioFeito,
  resolverAvisoTeto,
} from "./limite";

const ORG = "org-a";
const CAIXA = "caixa-1";
const SP = "America/Sao_Paulo";

const p = (agora: string, extra: Partial<Parameters<typeof decidirAdmissao>[1]> = {}) => ({
  organizationId: ORG,
  caixaId: CAIXA,
  tetoDiario: 2,
  intervaloSegundos: 30,
  fuso: SP,
  agora: new Date(agora),
  ...extra,
});

let banco: BancoFalso;
beforeEach(() => {
  banco = criarBancoFalso({
    organizations: [{ id: ORG, timezone: SP }],
  });
});

describe("fuso e virada do dia", () => {
  it("AC-005.3: o dia é o do fuso da organização, não o de UTC", () => {
    // 02:30 UTC ainda é 23:30 do dia anterior em São Paulo.
    expect(diaNoFuso(new Date("2026-11-04T02:30:00.000Z"), SP)).toBe("2026-11-03");
    expect(diaNoFuso(new Date("2026-11-04T03:00:00.000Z"), SP)).toBe("2026-11-04");
    expect(diaNoFuso(new Date("2026-11-04T02:30:00.000Z"), "Asia/Tokyo")).toBe("2026-11-04");
  });

  it("AC-005.1: a fila volta a sair à meia-noite do fuso da organização", () => {
    expect(inicioDoDiaSeguinte(new Date("2026-11-04T15:00:00.000Z"), SP).toISOString()).toBe("2026-11-05T03:00:00.000Z");
    expect(inicioDoDiaSeguinte(new Date("2026-11-04T10:00:00.000Z"), "Asia/Tokyo").toISOString()).toBe("2026-11-04T15:00:00.000Z");
  });

  it("o fuso da organização vem do banco, com padrão de São Paulo", async () => {
    expect(await fusoDaOrganizacao(banco.client, ORG)).toBe(SP);
    expect(await fusoDaOrganizacao(banco.client, "org-sem-fuso")).toBe(SP);
    banco = criarBancoFalso({ organizations: [{ id: ORG, timezone: "Fuso/Que_Nao_Existe" }] });
    expect(await fusoDaOrganizacao(banco.client, ORG)).toBe(SP);
  });
});

describe("decidirAdmissao: teto diário e intervalo", () => {
  it("AC-005.1: abaixo do teto e sem envio recente, admite", async () => {
    expect(await decidirAdmissao(banco.client, p("2026-11-04T15:00:00.000Z"))).toEqual({ ok: true });
  });

  it("AC-005.1: no teto, adia para o início do dia seguinte", async () => {
    banco.tabelas.email_envios_dia = [{ channel_session_id: CAIXA, organization_id: ORG, dia: "2026-11-04", quantidade: 2 }];
    const r = await decidirAdmissao(banco.client, p("2026-11-04T15:00:00.000Z"));
    expect(r).toMatchObject({ ok: false, motivo: "teto_diario" });
    expect((r as { adiarAte: Date }).adiarAte.toISOString()).toBe("2026-11-05T03:00:00.000Z");
  });

  it("AC-005.1: o teto de outra caixa ou de outra organização não conta", async () => {
    banco.tabelas.email_envios_dia = [
      { channel_session_id: "outra-caixa", organization_id: ORG, dia: "2026-11-04", quantidade: 99 },
      { channel_session_id: CAIXA, organization_id: "org-b", dia: "2026-11-04", quantidade: 99 },
    ];
    expect(await decidirAdmissao(banco.client, p("2026-11-04T15:00:00.000Z"))).toEqual({ ok: true });
  });

  it("AC-005.3: na virada do dia no fuso da organização o contador zera", async () => {
    banco.tabelas.email_envios_dia = [{ channel_session_id: CAIXA, organization_id: ORG, dia: "2026-11-03", quantidade: 2 }];
    // 02:59 UTC = 23:59 de 03/11 em São Paulo: ainda no teto.
    expect(await decidirAdmissao(banco.client, p("2026-11-04T02:59:00.000Z"))).toMatchObject({ ok: false, motivo: "teto_diario" });
    // 03:00 UTC = 00:00 de 04/11: dia novo, contador zerado.
    expect(await decidirAdmissao(banco.client, p("2026-11-04T03:00:00.000Z"))).toEqual({ ok: true });
  });

  it("AC-005.2: dois envios seguidos respeitam o intervalo mínimo", async () => {
    banco.tabelas.messages = [
      { id: "m1", organization_id: ORG, channel_session_id: CAIXA, direction: "outbound", status: "sent", sent_at: "2026-11-04T14:59:50.000Z" },
    ];
    const r = await decidirAdmissao(banco.client, p("2026-11-04T15:00:00.000Z"));
    expect(r).toMatchObject({ ok: false, motivo: "intervalo" });
    expect((r as { adiarAte: Date }).adiarAte.toISOString()).toBe("2026-11-04T15:00:20.000Z");
    expect(await decidirAdmissao(banco.client, p("2026-11-04T15:00:20.000Z"))).toEqual({ ok: true });
  });

  it("AC-005.2: o intervalo zero desliga a espera", async () => {
    banco.tabelas.messages = [
      { id: "m1", organization_id: ORG, channel_session_id: CAIXA, direction: "outbound", status: "sent", sent_at: "2026-11-04T15:00:00.000Z" },
    ];
    expect(await decidirAdmissao(banco.client, p("2026-11-04T15:00:00.000Z", { intervaloSegundos: 0 }))).toEqual({ ok: true });
  });

  it("AC-005.2: mensagem de entrada ou ainda na fila não conta como envio", async () => {
    banco.tabelas.messages = [
      { id: "m1", organization_id: ORG, channel_session_id: CAIXA, direction: "inbound", status: "delivered", sent_at: "2026-11-04T14:59:59.000Z" },
      { id: "m2", organization_id: ORG, channel_session_id: CAIXA, direction: "outbound", status: "queued", sent_at: "2026-11-04T14:59:59.000Z" },
    ];
    expect(await decidirAdmissao(banco.client, p("2026-11-04T15:00:00.000Z"))).toEqual({ ok: true });
  });
});

describe("registrarEnvioFeito: o contador do dia", () => {
  it("AC-005.1: cada envio soma um no dia do fuso da organização", async () => {
    const agora = new Date("2026-11-04T15:00:00.000Z");
    await registrarEnvioFeito(banco.client, { organizationId: ORG, caixaId: CAIXA, fuso: SP, agora });
    await registrarEnvioFeito(banco.client, { organizationId: ORG, caixaId: CAIXA, fuso: SP, agora });
    expect(banco.tabelas.email_envios_dia).toHaveLength(1);
    expect(banco.tabelas.email_envios_dia![0]).toMatchObject({ organization_id: ORG, channel_session_id: CAIXA, dia: "2026-11-04", quantidade: 2 });
    expect(await decidirAdmissao(banco.client, p("2026-11-04T15:00:01.000Z", { intervaloSegundos: 0 }))).toMatchObject({ ok: false, motivo: "teto_diario" });
  });
});

describe("aviso do teto na Central", () => {
  const aviso = { organizationId: ORG, caixaId: CAIXA, endereco: "caixa@meunegocio.com" };

  it("AC-005.1: abre um aviso na Central, uma vez só enquanto estiver aberto", async () => {
    await avisarTetoAtingido(banco.client, aviso);
    await avisarTetoAtingido(banco.client, aviso);
    expect(banco.tabelas.agent_inbox_items).toHaveLength(1);
    expect(banco.tabelas.agent_inbox_items![0]).toMatchObject({
      organization_id: ORG,
      kind: "email_teto_atingido",
      ref_kind: "channel_session",
      ref_id: CAIXA,
    });
  });

  it("AC-005.3: quando o dia vira, o aviso é fechado e um novo teto abre outro", async () => {
    await avisarTetoAtingido(banco.client, aviso);
    await resolverAvisoTeto(banco.client, ORG, CAIXA);
    expect(banco.tabelas.agent_inbox_items![0]).toMatchObject({ status: "resolved" });
    await avisarTetoAtingido(banco.client, aviso);
    expect(banco.tabelas.agent_inbox_items).toHaveLength(2);
  });

  it("falha do banco no aviso não derruba o envio", async () => {
    banco.falharEm("agent_inbox_items", "insert", { message: "caiu" });
    await expect(avisarTetoAtingido(banco.client, aviso)).resolves.toBeUndefined();
  });
});
