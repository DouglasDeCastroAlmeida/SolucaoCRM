/**
 * Faixas de IP que um webhook de saída nunca deve alcançar, e o guard que
 * RESOLVE o hostname antes de decidir.
 *
 * O guard textual (`assertSafeOutboundUrl`) declarava a própria dívida: um
 * hostname público que resolve para IP privado no momento do fetch passava
 * batido. Numa VPS de self-host isso alcança o que mora na rede do compose —
 * o cache e o gateway de mensageria sem autenticação de rede, o Postgres, e o serviço de
 * metadados da nuvem em 169.254.169.254, que entrega credencial de instância.
 *
 * Quem cadastra a URL precisa ser `manager+`, então o atacante já é alguém de
 * dentro do tenant; o que se impede aqui é a escalada de "posso configurar um
 * webhook" para "posso varrer e falar com a rede interna do servidor".
 */
import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

/** Converte IPv4 pontuado em inteiro de 32 bits. */
function ipv4ParaInt(ip: string): number | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  let total = 0;
  for (const parte of partes) {
    const n = Number(parte);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    total = total * 256 + n;
  }
  return total;
}

/** [base, prefixo] das faixas IPv4 que não podem ser destino. */
const FAIXAS_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "este host"
  ["10.0.0.0", 8], // privada
  ["100.64.0.0", 10], // CGNAT — ausente do guard textual
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — inclui o metadata de nuvem
  ["172.16.0.0", 12], // privada (a rede default do Docker mora aqui)
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // privada
  ["198.18.0.0", 15], // benchmark
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservada (inclui 255.255.255.255)
];

/** IPv6 em 8 grupos de 16 bits, ou null se não parseia. */
function ipv6EmGrupos(ip: string): number[] | null {
  let texto = ip.toLowerCase().split("%")[0]!;
  // Cauda em IPv4 pontuado (::ffff:1.2.3.4) vira dois grupos hex.
  const cauda = /(\d+\.\d+\.\d+\.\d+)$/.exec(texto);
  if (cauda) {
    const n = ipv4ParaInt(cauda[1]!);
    if (n === null) return null;
    texto = texto.slice(0, cauda.index) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const partes = texto.split("::");
  if (partes.length > 2) return null;
  const lado = (t: string) => (t === "" ? [] : t.split(":"));
  const esq = lado(partes[0]!);
  const dir = partes.length === 2 ? lado(partes[1]!) : [];
  const falta = 8 - esq.length - dir.length;
  if (partes.length === 1 ? falta !== 0 : falta < 1) return null;
  const todos = [...esq, ...Array<string>(partes.length === 2 ? falta : 0).fill("0"), ...dir];
  const grupos = todos.map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));
  return grupos.length === 8 && grupos.every((x) => !Number.isNaN(x)) ? grupos : null;
}

export function ipEhEspecial(ip: string): boolean {
  if (isIPv4(ip)) {
    const alvo = ipv4ParaInt(ip);
    if (alvo === null) return true; // não parseou: trata como perigoso
    for (const [base, prefixo] of FAIXAS_IPV4) {
      const baseInt = ipv4ParaInt(base);
      if (baseInt === null) continue;
      const mascara = prefixo === 0 ? 0 : (0xffffffff << (32 - prefixo)) >>> 0;
      if ((alvo & mascara) >>> 0 === (baseInt & mascara) >>> 0) return true;
    }
    return false;
  }

  if (isIPv6(ip)) {
    const g = ipv6EmGrupos(ip);
    if (g === null) return true; // não parseou: trata como perigoso
    const embutido = `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
    const zeros = (ate: number) => g.slice(0, ate).every((x) => x === 0);
    // "::" e "::1"
    if (zeros(7) && (g[7] === 0 || g[7] === 1)) return true;
    // IPv4-mapeado (::ffff:x:y), com ou sem zeros extras (::ffff:0:x:y):
    // decide pelo IPv4 dos dois últimos grupos.
    if (zeros(5) && g[5] === 0xffff) return ipEhEspecial(embutido);
    if (zeros(4) && g[4] === 0xffff && g[5] === 0) return ipEhEspecial(embutido);
    // IPv4-compatível (::x:y)
    if (zeros(6)) return ipEhEspecial(embutido);
    // NAT64 64:ff9b::/96 alcança o IPv4 embutido; trata como especial sempre.
    if (g[0] === 0x64 && g[1] === 0xff9b) return true;
    const topo = g[0]!;
    if ((topo & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((topo & 0xffc0) === 0xfec0) return true; // site-local fec0::/10
    if ((topo & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
    if ((topo & 0xff00) === 0xff00) return true; // multicast
    if (topo === 0x2001 && g[1] === 0x0db8) return true; // documentação
    if (topo === 0x2002) return true; // 6to4: embute IPv4 arbitrário
    return false;
  }

  return true; // nem IPv4 nem IPv6: não é destino que se saiba julgar
}

/**
 * Resolve o hostname e devolve os endereços, recusando se QUALQUER um cair em
 * faixa especial.
 *
 * Recusar quando *qualquer* endereço é especial (e não "quando todos são") é
 * deliberado: um domínio que devolve dois registros, um público e um privado,
 * é a assinatura do rebinding — o `fetch` pode escolher o privado, e não temos
 * como saber qual ele pegou.
 *
 * Isto REDUZ muito a janela do rebinding, mas não a fecha por completo: entre
 * esta resolução e a do `fetch` existe um intervalo em que o DNS pode mudar de
 * resposta. Fechar de vez exige fixar o IP na conexão (agente com `lookup`
 * próprio), o que muda o SNI/Host e quebra TLS com vários destinos legítimos.
 * A janela residual está declarada aqui de propósito, para o próximo leitor não
 * precisar descobrir sozinho — que foi exatamente como este arquivo nasceu.
 */
export async function assertDestinoResolvidoSeguro(hostname: string): Promise<void> {
  // Literal de IP não passa por DNS: julga direto.
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (ipEhEspecial(hostname)) throw new Error("unsafe_url:private_ip");
    return;
  }

  let enderecos: Array<{ address: string }>;
  try {
    enderecos = await lookup(hostname, { all: true });
  } catch {
    // Não resolveu: recusa. Falhar fechado aqui custa uma entrega de webhook;
    // falhar aberto custa a rede interna.
    throw new Error("unsafe_url:dns_failed");
  }

  if (enderecos.length === 0) throw new Error("unsafe_url:dns_empty");
  for (const { address } of enderecos) {
    if (ipEhEspecial(address)) throw new Error("unsafe_url:private_ip");
  }
}
