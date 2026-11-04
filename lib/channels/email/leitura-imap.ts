/**
 * Leitura da caixa de entrada por IMAP (mudança 005): a borda de rede da rodada.
 *
 * Só a caixa `INBOX`, só leitura (`readOnly`: nada é marcado como lido nem apagado), e o
 * destino passa por `validarDestino` com o IP fixado, exatamente como em `conexao.ts`.
 * Spam, lixeira e qualquer outra pasta nunca são abertas (AC-002.6).
 *
 * Conexão curta: abre, lê o lote, fecha. A senha vive só no argumento desta chamada. Falha
 * vira `FalhaDeLeitura` com a causa classificada, nunca com o texto do servidor (que às
 * vezes ecoa credencial).
 */
import { ImapFlow } from "imapflow";

import { causaDoErro, type CausaDaFalha, type ConfigDaCaixa } from "./conexao";
import { validarDestino, type ResolvedorDns } from "./destino-seguro";

export interface MensagemDaLista {
  uid: number;
  /** Tamanho em bytes, para a rodada recusar antes de baixar. */
  tamanho: number;
}

export interface LeitorDeCaixa {
  uidValidity: string;
  uidNext: number;
  /** As mensagens com UID >= `uid`, em ordem crescente, no máximo `limite`. */
  listarDesde(uid: number, limite: number): Promise<MensagemDaLista[]>;
  /** O MIME cru de uma mensagem, ou `null` se ela sumiu. */
  baixar(uid: number): Promise<Buffer | null>;
  fechar(): Promise<void>;
}

export type AbrirLeitor = (cfg: ConfigDaCaixa) => Promise<LeitorDeCaixa>;

export class FalhaDeLeitura extends Error {
  constructor(readonly causa: CausaDaFalha) {
    super(`email_leitura_${causa}`);
    this.name = "FalhaDeLeitura";
  }
}

const CAUSA_DO_DESTINO = {
  host_invalido: "servidor_invalido",
  porta_proibida: "porta_nao_permitida",
  nao_resolve: "servidor_nao_encontrado",
  ip_proibido: "destino_proibido",
} as const satisfies Record<string, CausaDaFalha>;

const PRAZO_DE_CONEXAO_MS = 15_000;
const PRAZO_DE_SOCKET_MS = 30_000;

export function criarAbridorDeLeitor(deps: { resolver?: ResolvedorDns } = {}): AbrirLeitor {
  return async (cfg) => {
    const destino = await validarDestino(cfg.imap.host, cfg.imap.porta, { resolver: deps.resolver });
    if (!destino.ok) throw new FalhaDeLeitura(CAUSA_DO_DESTINO[destino.motivo]);

    const cliente = new ImapFlow({
      host: destino.ip,
      port: destino.porta,
      secure: cfg.imap.seguranca === "ssl",
      ...(cfg.imap.seguranca === "starttls" ? { doSTARTTLS: true } : {}),
      servername: destino.servername,
      auth: { user: cfg.usuario, pass: cfg.senha },
      tls: { servername: destino.servername, rejectUnauthorized: true },
      logger: false,
      connectionTimeout: PRAZO_DE_CONEXAO_MS,
      greetingTimeout: PRAZO_DE_CONEXAO_MS,
      socketTimeout: PRAZO_DE_SOCKET_MS,
    });
    // Sem ouvinte, um erro de socket depois do connect derrubaria o processo.
    cliente.on("error", () => undefined);

    let caixa: { uidValidity: bigint; uidNext: number };
    try {
      await cliente.connect();
      caixa = await cliente.mailboxOpen("INBOX", { readOnly: true });
    } catch (erro) {
      try {
        cliente.close();
      } catch {
        // já fechada
      }
      throw new FalhaDeLeitura(causaDoErro(erro, "leitura"));
    }

    return {
      uidValidity: String(caixa.uidValidity),
      uidNext: caixa.uidNext,
      async listarDesde(uid, limite) {
        // `uid:*` devolve SEMPRE a última mensagem, mesmo com uid maior que ela: o filtro é nosso.
        const todas = await cliente.fetchAll(`${uid}:*`, { uid: true, size: true }, { uid: true });
        return todas
          .filter((m) => m.uid >= uid)
          .sort((a, b) => a.uid - b.uid)
          .slice(0, limite)
          .map((m) => ({ uid: m.uid, tamanho: m.size ?? 0 }));
      },
      async baixar(uid) {
        const m = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
        return m && m.source ? m.source : null;
      },
      async fechar() {
        try {
          await cliente.logout();
        } catch {
          try {
            cliente.close();
          } catch {
            // já fechada
          }
        }
      },
    };
  };
}

export const abrirLeitorImap: AbrirLeitor = (cfg) => criarAbridorDeLeitor()(cfg);
