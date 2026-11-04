import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarBancoFalso, type BancoFalso } from "../../../tests/helpers/banco-falso-do-email";
import type { CaixaDeEmail } from "./caixa";
import { logger } from "@/lib/logger";
import { emailCanalLigado } from "./chave";
import { FalhaDeLeitura, type LeitorDeCaixa } from "./leitura-imap";
import { rodarCaixa, rodarRodada, type DependenciasDaRodada } from "./rodada";

const ORG = "org-a";
const AGORA = new Date("2026-11-04T12:00:00.000Z");
const CAIXA: CaixaDeEmail = {
  id: "caixa-1",
  endereco: "caixa@meunegocio.com",
  status: "WORKING",
  archivedAt: null,
  config: {
    usuario: "caixa@meunegocio.com",
    imap: { host: "imap.meunegocio.com", porta: 993, seguranca: "ssl" },
    smtp: { host: "smtp.meunegocio.com", porta: 465, seguranca: "ssl" },
    senha_ultimos4: "abcd",
    assinatura: null,
    teto_diario: 200,
    intervalo_segundos: 30,
  },
};

const mime = (id: string, extra: string[] = [], de = "joao@exemplo.com") =>
  Buffer.from(
    [`From: Joao <${de}>`, "To: caixa@meunegocio.com", `Subject: Assunto ${id}`, `Message-ID: <${id}@exemplo.com>`, ...extra, "", `Texto ${id}`, ""].join("\r\n"),
  );

interface Cena {
  uidValidity?: string;
  uidNext?: number;
  mensagens: Array<{ uid: number; cru: Buffer | null; tamanho?: number; quebra?: boolean }>;
}

function leitorSimulado(c: Cena) {
  const baixados: number[] = [];
  let fechado = false;
  const leitor: LeitorDeCaixa = {
    uidValidity: c.uidValidity ?? "10",
    uidNext: c.uidNext ?? Math.max(0, ...c.mensagens.map((m) => m.uid)) + 1,
    listarDesde: async (uid, limite) =>
      c.mensagens
        .filter((m) => m.uid >= uid)
        .slice(0, limite)
        .map((m) => ({ uid: m.uid, tamanho: m.tamanho ?? m.cru?.length ?? 0 })),
    baixar: async (uid) => {
      const m = c.mensagens.find((x) => x.uid === uid)!;
      if (m.quebra) throw new Error("ECONNRESET");
      baixados.push(uid);
      return m.cru;
    },
    fechar: async () => void (fechado = true),
  };
  return { leitor, baixados, foiFechado: () => fechado };
}

let banco: BancoFalso;
let avisar: ReturnType<typeof vi.fn>;
let abrir: ReturnType<typeof vi.fn>;
let deps: DependenciasDaRodada;

const estadoInicial = (extra: Record<string, unknown> = {}) => ({
  channel_session_id: CAIXA.id,
  organization_id: ORG,
  uidvalidity: 10,
  ultimo_uid: 5,
  ultima_rodada_em: null,
  travado_ate: null,
  falhas_seguidas: 0,
  pausa_motivo: null,
  ...extra,
});

function preparar(cena: Cena | Error, estado: Record<string, unknown> = {}) {
  banco = criarBancoFalso({ email_sync_estado: [estadoInicial(estado)] });
  avisar = vi.fn().mockResolvedValue({ central: true, emails: 1 });
  const sim = cena instanceof Error ? null : leitorSimulado(cena);
  abrir = vi.fn().mockImplementation(async () => {
    if (cena instanceof Error) throw cena;
    return sim!.leitor;
  });
  deps = {
    agora: () => AGORA,
    abrirLeitor: abrir as never,
    lerSenha: (async () => "senha-secreta-1234") as never,
    avisarSenhaRecusada: avisar as never,
    ingerir: undefined,
  };
  return sim;
}

const rodar = (prazo = new Date(AGORA.getTime() + 45_000)) => rodarCaixa(banco.client, ORG, CAIXA, prazo, deps);
const cursor = () => banco.tabelas.email_sync_estado![0]!.ultimo_uid;

describe("rodada: o que entra", () => {
  beforeEach(() => void 0);

  it("AC-002.1: o e-mail novo vira mensagem na conversa do remetente", async () => {
    preparar({ mensagens: [{ uid: 6, cru: mime("m6") }] });
    const r = await rodar();
    expect(r).toMatchObject({ desfecho: "lida", lidas: 1, ingeridas: 1 });
    expect(banco.tabelas.messages).toHaveLength(1);
    expect(banco.tabelas.messages![0]).toMatchObject({ external_id: "<m6@exemplo.com>", direction: "inbound" });
  });

  it("AC-002.6: le a partir do ultimo UID + 1, nunca o que ja passou", async () => {
    const sim = preparar({
      mensagens: [
        { uid: 4, cru: mime("m4") },
        { uid: 5, cru: mime("m5") },
        { uid: 6, cru: mime("m6") },
        { uid: 7, cru: mime("m7") },
      ],
    })!;
    await rodar();
    expect(sim.baixados).toEqual([6, 7]);
    expect(cursor()).toBe(7);
  });

  it("AC-002.6: a leitura so abre a caixa de entrada (spam e lixeira nunca sao lidos)", () => {
    const fonte = readFileSync(join(__dirname, "leitura-imap.ts"), "utf8");
    const aberturas = fonte.match(/mailboxOpen\(([^)]*)\)/g) ?? [];
    expect(aberturas).toHaveLength(1);
    expect(aberturas[0]).toContain('"INBOX"');
    expect(aberturas[0]).toContain("readOnly: true");
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/spam|junk|trash|lixeira/i);
  });

  it("AC-002.5: o mesmo e-mail visto duas vezes (cursor perdido) gera uma so mensagem", async () => {
    preparar({ mensagens: [{ uid: 6, cru: mime("m6") }] });
    await rodar();
    banco.tabelas.email_sync_estado![0]!.ultimo_uid = 5; // reconexao: o cursor voltou
    const r = await rodar();
    expect(r.duplicadas).toBe(1);
    expect(banco.tabelas.messages).toHaveLength(1);
  });

  it("AC-002.6: UIDVALIDITY mudou: nao reimporta o passado e recomeca do fim da caixa", async () => {
    const sim = preparar({ uidValidity: "99", uidNext: 4, mensagens: [{ uid: 1, cru: mime("a") }, { uid: 2, cru: mime("b") }, { uid: 3, cru: mime("c") }] })!;
    const r = await rodar();
    expect(r.ingeridas).toBe(0);
    expect(sim.baixados).toEqual([]);
    expect(banco.tabelas.email_sync_estado![0]).toMatchObject({ uidvalidity: "99", ultimo_uid: 3 });
  });

  it("AC-002.5: o cursor avanca mensagem a mensagem, ate a ultima tratada", async () => {
    preparar({ mensagens: [{ uid: 6, cru: mime("m6") }, { uid: 9, cru: mime("m9") }] });
    await rodar();
    expect(cursor()).toBe(9);
    expect(banco.tabelas.email_sync_estado![0]!.falhas_seguidas).toBe(0);
    expect(banco.tabelas.email_sync_estado![0]!.travado_ate).toBeNull();
  });

  it("AC-003.1: o e-mail de teste da conexao (Auto-Submitted, da propria caixa) e ignorado", async () => {
    preparar({ mensagens: [{ uid: 6, cru: mime("t", ["Auto-Submitted: auto-generated"], "caixa@meunegocio.com") }] });
    const r = await rodar();
    expect(r.ignoradas).toBe(1);
    expect(banco.tabelas.messages ?? []).toHaveLength(0);
    expect(banco.tabelas.email_ignorados![0]).toMatchObject({ motivo: "propria_caixa" });
  });
});

describe("rodada: falhas sem estrago", () => {
  it("AC-006.1: senha recusada pausa a caixa, avisa e nao tenta de novo", async () => {
    preparar(new FalhaDeLeitura("senha_recusada"));
    const r = await rodar();
    expect(r.desfecho).toBe("senha_recusada");
    expect(banco.tabelas.email_sync_estado![0]!.pausa_motivo).toBe("senha_recusada");
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar.mock.calls[0]![1]).toMatchObject({ organizationId: ORG, caixaId: CAIXA.id });

    const de_novo = await rodar();
    expect(de_novo.desfecho).toBe("pausada");
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it("AC-006.1: provedor que pede senha de app tambem pausa", async () => {
    preparar(new FalhaDeLeitura("verificacao_em_duas_etapas"));
    expect((await rodar()).desfecho).toBe("senha_recusada");
  });

  it("AC-006.1: caixa pausada nao entra na rodada geral e nao abre conexao", async () => {
    preparar({ mensagens: [] }, { pausa_motivo: "senha_recusada" });
    banco.tabelas.organizations = [{ id: ORG, status: "active" }];
    const r = await rodarRodada(banco.client, deps);
    expect(r.caixas).toEqual([]);
    expect(abrir).not.toHaveBeenCalled();
  });

  it("AC-006.2: falha de rede no meio retoma de onde parou, sem perder nem repetir", async () => {
    const cena: Cena = {
      mensagens: [
        { uid: 6, cru: mime("m6") },
        { uid: 7, cru: mime("m7"), quebra: true },
        { uid: 8, cru: mime("m8") },
      ],
    };
    preparar(cena);
    const primeira = await rodar();
    expect(primeira.desfecho).toBe("falha");
    expect(cursor()).toBe(6);
    expect(banco.tabelas.email_sync_estado![0]).toMatchObject({ falhas_seguidas: 1, travado_ate: null });

    cena.mensagens[1]!.quebra = false; // a rede voltou
    deps.agora = () => new Date(AGORA.getTime() + 10 * 60_000); // passou o recuo
    const segunda = await rodar(new Date(AGORA.getTime() + 11 * 60_000));
    expect(segunda.desfecho).toBe("lida");
    expect(banco.tabelas.messages!.map((m) => m.external_id)).toEqual(["<m6@exemplo.com>", "<m7@exemplo.com>", "<m8@exemplo.com>"]);
    expect(cursor()).toBe(8);
    expect(banco.tabelas.email_sync_estado![0]!.falhas_seguidas).toBe(0);
  });

  it("AC-006.2: servidor fora do ar conta uma falha, nao pausa e respeita o recuo", async () => {
    preparar(new FalhaDeLeitura("servidor_inalcancavel"));
    expect((await rodar()).desfecho).toBe("falha");
    expect(banco.tabelas.email_sync_estado![0]).toMatchObject({ falhas_seguidas: 1, pausa_motivo: null });
    expect((await rodar()).desfecho).toBe("em_recuo");
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("AC-006.3: e-mail malformado ou grande demais e pulado com motivo e o resto segue", async () => {
    preparar({
      mensagens: [
        { uid: 6, cru: Buffer.from("Subject: sem remetente\r\n\r\ncorpo\r\n") },
        { uid: 7, cru: mime("grande"), tamanho: 999_999_999 },
        { uid: 8, cru: mime("bom") },
      ],
    });
    const r = await rodar();
    expect(r).toMatchObject({ desfecho: "lida", puladas: 2, ingeridas: 1 });
    expect(banco.tabelas.email_ignorados!.map((i) => i.motivo).sort()).toEqual(["grande_demais", "malformado"]);
    expect(banco.tabelas.messages).toHaveLength(1);
    expect(cursor()).toBe(8);
  });

  it("AC-006.4: o prazo encerra a rodada e a seguinte continua do mesmo ponto", async () => {
    let relogio = AGORA.getTime();
    const sim = preparar({ mensagens: [{ uid: 6, cru: mime("m6") }, { uid: 7, cru: mime("m7") }, { uid: 8, cru: mime("m8") }] })!;
    sim.leitor.baixar = vi.fn(async (uid: number) => {
      relogio += 30_000; // cada download "demora" 30 s
      return mime(`m${uid}`);
    });
    deps.agora = () => new Date(relogio);
    const r = await rodar(new Date(AGORA.getTime() + 45_000));
    expect(r.prazoEsgotado).toBe(true);
    expect(r.ingeridas).toBe(2); // aos 60 s o prazo de 45 s ja passou: a terceira fica para a seguinte
    expect(cursor()).toBe(7);
    expect(banco.tabelas.email_sync_estado![0]!.travado_ate).toBeNull();
  });

  it("AC-006.2: duas rodadas sobrepostas nao leem a mesma caixa", async () => {
    preparar({ mensagens: [{ uid: 6, cru: mime("m6") }] }, { travado_ate: new Date(AGORA.getTime() + 20_000).toISOString() });
    const r = await rodar();
    expect(r.desfecho).toBe("ocupada");
    expect(abrir).not.toHaveBeenCalled();
  });

  it("AC-006.2: trava vencida (rodada que morreu) e retomada", async () => {
    preparar({ mensagens: [{ uid: 6, cru: mime("m6") }] }, { travado_ate: new Date(AGORA.getTime() - 1000).toISOString() });
    expect((await rodar()).desfecho).toBe("lida");
  });
});

describe("rodada: a chave EMAIL_CANAL", () => {
  it("AC-008.3: desligado nao le, nao abre conexao e nao toca o banco", async () => {
    preparar({ mensagens: [{ uid: 6, cru: mime("m6") }] });
    const from = vi.spyOn(banco.client, "from");
    const r = await rodarRodada(banco.client, { ...deps, canalLigado: () => false });
    expect(r).toEqual({ desligado: true, caixas: [] });
    expect(abrir).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("AC-008.3: so o texto 'desligado' desliga; vazio e ausente deixam ligado", () => {
    expect(emailCanalLigado("desligado")).toBe(false);
    expect(emailCanalLigado("  Desligado ")).toBe(false);
    expect(emailCanalLigado("")).toBe(true);
    expect(emailCanalLigado(undefined)).toBe(true);
    expect(emailCanalLigado("ligado")).toBe(true);
  });

  it("AC-008.3: ligado, a rodada geral le a caixa de uma organizacao operante", async () => {
    preparar({ mensagens: [{ uid: 6, cru: mime("m6") }] });
    banco.tabelas.organizations = [{ id: ORG, status: "active" }];
    banco.tabelas.channel_sessions = [
      { id: CAIXA.id, organization_id: ORG, provider: "email", email_address: CAIXA.endereco, email_config: CAIXA.config, status: "WORKING", archived_at: null, metadata: {} },
    ];
    const r = await rodarRodada(banco.client, { ...deps, canalLigado: () => true });
    expect(r.caixas).toHaveLength(1);
    expect(r.caixas[0]).toMatchObject({ desfecho: "lida", ingeridas: 1 });
  });

  it("AC-008.2: caixa desativada pela equipe e organizacao parada ficam de fora", async () => {
    preparar({ mensagens: [{ uid: 6, cru: mime("m6") }] });
    banco.tabelas.organizations = [{ id: ORG, status: "active" }];
    banco.tabelas.channel_sessions = [
      { id: CAIXA.id, organization_id: ORG, provider: "email", email_address: CAIXA.endereco, email_config: CAIXA.config, status: "WORKING", archived_at: null, metadata: { disabled: true } },
    ];
    expect((await rodarRodada(banco.client, deps)).caixas).toEqual([]);
    banco.tabelas.channel_sessions![0]!.metadata = {};
    banco.tabelas.organizations![0]!.status = "suspended";
    expect((await rodarRodada(banco.client, deps)).caixas).toEqual([]);
    expect(abrir).not.toHaveBeenCalled();
  });

  it("AC-008.2: caixas puladas (organizacao parada) sao carimbadas e nao tomam a vaga das demais", async () => {
    preparar({ mensagens: [] });
    banco.tabelas.organizations = [{ id: ORG, status: "suspended" }];
    await rodarRodada(banco.client, deps);
    expect(banco.tabelas.email_sync_estado![0]!.ultima_rodada_em).toBe(AGORA.toISOString());
    expect(banco.tabelas.email_sync_estado![0]!.falhas_seguidas).toBe(0);
  });

  it("log da falha de mensagem registra so o code, nunca a mensagem do banco", async () => {
    const aviso = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    preparar({ mensagens: [{ uid: 6, cru: mime("m6") }] });
    deps.ingerir = (async () => {
      throw Object.assign(new Error("duplicate key joao@exemplo.com"), { code: "23505" });
    }) as never;
    await rodar();
    const log = JSON.stringify(aviso.mock.calls);
    expect(log).toContain("23505");
    expect(log).not.toContain("joao@exemplo.com");
    aviso.mockRestore();
  });
});
