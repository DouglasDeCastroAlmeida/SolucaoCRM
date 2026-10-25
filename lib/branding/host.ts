/**
 * Normalização do host que escolhe a marca. Pura e sem imports: o `proxy.ts`
 * (Edge) a usa para gravar o cabeçalho, e o resolvedor (Node) a usa na chave
 * do cache. As duas pontas têm de concordar, por isso uma função só.
 */
export const CABECALHO_BRAND_HOST = "x-brand-host";

const HOST_VALIDO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** Minúsculo, sem porta, sem ponto final. Vazio quando não é um host. */
export function normalizarHost(bruto: string | null | undefined): string {
  if (typeof bruto !== "string") return "";
  // `x-forwarded-host` pode trazer lista; vale o primeiro.
  const primeiro = bruto.split(",")[0] ?? "";
  const semPorta = primeiro.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.+$/, "");
  if (semPorta.length === 0 || semPorta.length > 253) return "";
  return HOST_VALIDO.test(semPorta) ? semPorta : "";
}
