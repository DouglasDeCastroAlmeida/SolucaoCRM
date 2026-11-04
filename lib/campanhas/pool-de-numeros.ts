/**
 * Gravar e ler o POOL de números de uma campanha (migration 0377).
 *
 * Fica fora das rotas porque criar e editar fazem a mesma coisa com ele, e
 * porque a regra de "o principal não entra na tabela de vínculo" é fácil de
 * esquecer num dos dois lados — e esquecer significa o principal contando duas
 * vezes no rodízio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { aceitaEnvioEmLote } from "@/lib/channels/capabilities";

/** Os números EXTRAS gravados para a campanha (sem o principal). */
export async function lerPoolExtra(
  admin: SupabaseClient,
  organizationId: string,
  campanhaId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("campaign_channel_sessions")
    .select("channel_session_id")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campanhaId);
  if (error) throw new Error(`pool de números: leitura — ${error.message}`);
  return (data ?? []).map((l) => (l as { channel_session_id: string }).channel_session_id);
}

export interface ResultadoDoPool {
  ok: boolean;
  /** Ids recusados por não serem conexões desta organização. */
  recusados: string[];
  gravados: string[];
}

/**
 * Regrava o pool extra: apaga o que não está mais na lista e insere o que
 * falta. Idempotente, e nunca deixa a campanha sem número — o principal existe
 * independentemente desta tabela.
 *
 * O principal é REMOVIDO da lista antes de gravar: ele já é do pool por
 * definição, e uma linha para ele o faria pesar dobrado na escolha.
 */
export async function gravarPool(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    campanhaId: string;
    principal: string;
    extras: readonly string[];
  },
): Promise<ResultadoDoPool> {
  const desejados = [...new Set(entrada.extras)].filter((id) => id !== entrada.principal);

  // Todo id é conferido CONTRA A ORGANIZAÇÃO. A FK composta da 0377 recusaria
  // no banco, mas a recusa chegaria como erro genérico — e o operador merece
  // saber qual número foi rejeitado.
  let validos: string[] = [];
  if (desejados.length > 0) {
    const { data, error } = await admin
      .from("channel_sessions")
      .select("id, provider")
      .eq("organization_id", entrada.organizationId)
      .in("id", desejados);
    if (error) throw new Error(`pool de números: conexões — ${error.message}`);
    // Canal que só responde (capacidade `envioEmLote` falsa) não entra no pool: recusado como
    // qualquer id que não seja uma conexão utilizável desta organização.
    validos = (data ?? [])
      .filter((l) => aceitaEnvioEmLote((l as { provider: string | null }).provider))
      .map((l) => (l as { id: string }).id);
  }
  const recusados = desejados.filter((id) => !validos.includes(id));

  const atuais = await lerPoolExtra(admin, entrada.organizationId, entrada.campanhaId);
  const remover = atuais.filter((id) => !validos.includes(id));
  const inserir = validos.filter((id) => !atuais.includes(id));

  if (remover.length > 0) {
    const { error } = await admin
      .from("campaign_channel_sessions")
      .delete()
      .eq("organization_id", entrada.organizationId)
      .eq("campaign_id", entrada.campanhaId)
      .in("channel_session_id", remover);
    if (error) throw new Error(`pool de números: remoção — ${error.message}`);
  }
  if (inserir.length > 0) {
    const { error } = await admin.from("campaign_channel_sessions").insert(
      inserir.map((channel_session_id) => ({
        organization_id: entrada.organizationId,
        campaign_id: entrada.campanhaId,
        channel_session_id,
      })),
    );
    if (error) throw new Error(`pool de números: gravação — ${error.message}`);
  }

  return { ok: recusados.length === 0, recusados, gravados: validos };
}

/**
 * A conexão PRINCIPAL da campanha serve para envio em lote? `so_responde` = canal que só
 * responde a quem escreveu (capacidade `envioEmLote` falsa); `nao_encontrada` = não é uma
 * conexão desta organização. Sempre conferida contra a organização (client de service role).
 */
export async function conexaoAceitaCampanha(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<"ok" | "nao_encontrada" | "so_responde"> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, provider")
    .eq("organization_id", organizationId)
    .eq("id", channelSessionId)
    .maybeSingle();
  if (error) throw new Error(`conexão da campanha: ${error.message}`);
  if (!data) return "nao_encontrada";
  return aceitaEnvioEmLote((data as { provider: string | null }).provider) ? "ok" : "so_responde";
}
