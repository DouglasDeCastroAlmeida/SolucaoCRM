/**
 * Leitura de marcas por host, com o cliente admin.
 *
 * Marca é dado GLOBAL (não pertence a organização): este repositório consulta
 * `brand_domains`/`brands` sem `organization_id`, e isso é a exceção justificada
 * à regra de filtrar organização (ADR-006). O host vem do cabeçalho que o
 * `proxy.ts` normaliza, nunca do corpo de uma requisição.
 *
 * LANÇA em erro de banco: quem degrada para a marca padrão é o resolvedor
 * (`lib/branding/marca-do-host.ts`), que registra o motivo.
 */
import { createAdminClient } from "@/lib/supabase/admin";

import { MarcaSchema, type Brand, type TipoDeDominio } from "./tipos";

export type MarcaDoDominio = { brand: Brand; domainKind: TipoDeDominio };

/** A marca padrão da instalação (`is_default`). Lança se não houver. */
export async function buscarMarcaPadrao(): Promise<Brand> {
  const { data, error } = await createAdminClient()
    .from("brands")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw new Error(`marca padrão: ${error.code ?? "erro"} ${error.message}`);
  if (!data) throw new Error("marca padrão: nenhuma linha is_default");
  return MarcaSchema.parse(data);
}

/**
 * host → marca. Domínio ausente, não ativo ou de marca inativa devolve a marca
 * padrão com `domainKind: "padrao"`; erro de banco lança.
 */
export async function buscarMarcaDoHost(host: string): Promise<MarcaDoDominio> {
  const { data, error } = await createAdminClient()
    .from("brand_domains")
    .select("kind, status, brands(*)")
    .eq("host", host)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`marca do host: ${error.code ?? "erro"} ${error.message}`);

  const marcaBruta = data ? (Array.isArray(data.brands) ? data.brands[0] : data.brands) : null;
  if (data && marcaBruta) {
    const marca = MarcaSchema.parse(marcaBruta);
    if (marca.status === "active") {
      return { brand: marca, domainKind: data.kind === "proprio" ? "proprio" : "subdominio" };
    }
  }
  return { brand: await buscarMarcaPadrao(), domainKind: "padrao" };
}
