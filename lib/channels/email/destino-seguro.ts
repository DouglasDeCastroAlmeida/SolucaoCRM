/**
 * Destino seguro do servidor de e-mail (mudança 005, ADR-003).
 *
 * Host e porta vêm de quem conecta a caixa. Sem guarda, "conectar e-mail" vira "o
 * servidor fala com qualquer coisa da rede dele" (metadata de nuvem, Postgres interno).
 *
 * Mais estrita que `lib/external-db/guardas.ts`: aqui NÃO existe caso legítimo de rede
 * local (o e-mail de um autônomo é de um provedor público), então tudo que não for
 * unicast público é recusado, RFC1918 inclusive. E o IP resolvido é DEVOLVIDO para quem
 * conecta fixá-lo, com o nome original só como `servername` do TLS: resolver aqui e
 * deixar a biblioteca resolver de novo abriria a janela de DNS rebinding.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import ipaddr from "ipaddr.js";

/** IMAP 143/993 e SMTP 465/587. Nenhuma outra porta é e-mail, e as demais são outros serviços. */
export const PORTAS_PERMITIDAS: readonly number[] = [143, 993, 465, 587];

export type MotivoDeDestinoRecusado = "host_invalido" | "porta_proibida" | "nao_resolve" | "ip_proibido";

export type ResultadoDoDestino =
  | { ok: true; ip: string; servername: string; porta: number }
  | { ok: false; motivo: MotivoDeDestinoRecusado };

export type ResolvedorDns = (host: string) => Promise<Array<{ address: string; family: number }>>;

const resolverPadrao: ResolvedorDns = (host) => lookup(host, { all: true });

/** Rótulos de DNS (letras, dígitos e hífen) separados por ponto, até 253 caracteres. */
const FORMA_DE_HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/** `true` só para endereço unicast público; qualquer outra faixa nomeada (ou não parseável) é recusada. */
export function ipEhPublico(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let endereco = ipaddr.parse(ip);
  if (endereco.kind() === "ipv6" && (endereco as ipaddr.IPv6).isIPv4MappedAddress()) {
    endereco = (endereco as ipaddr.IPv6).toIPv4Address();
  }
  // IPv6 "compatível com IPv4" (96 bits iniciais zero, ex.: ::7f00:1) sai do ipaddr.js como unicast; recusar.
  if (endereco.kind() === "ipv6" && (endereco as ipaddr.IPv6).parts.slice(0, 6).every((p) => p === 0)) return false;
  return endereco.range() === "unicast";
}

export async function validarDestino(
  host: string,
  porta: number,
  deps: { resolver?: ResolvedorDns } = {},
): Promise<ResultadoDoDestino> {
  const nome = host.trim().toLowerCase();
  if (!Number.isInteger(porta) || !PORTAS_PERMITIDAS.includes(porta)) {
    return { ok: false, motivo: "porta_proibida" };
  }
  const ehIp = isIP(nome) !== 0;
  if (!ehIp && !FORMA_DE_HOST.test(nome)) return { ok: false, motivo: "host_invalido" };

  if (ehIp) {
    return ipEhPublico(nome)
      ? { ok: true, ip: nome, servername: nome, porta }
      : { ok: false, motivo: "ip_proibido" };
  }

  let respostas: Array<{ address: string; family: number }>;
  try {
    respostas = await (deps.resolver ?? resolverPadrao)(nome);
  } catch {
    return { ok: false, motivo: "nao_resolve" };
  }
  const primeira = respostas[0];
  if (!primeira) return { ok: false, motivo: "nao_resolve" };
  // Todas as respostas valem: uma só especial entre várias já é o rebinding.
  if (!respostas.every((r) => ipEhPublico(r.address))) return { ok: false, motivo: "ip_proibido" };
  return { ok: true, ip: primeira.address, servername: nome, porta };
}
