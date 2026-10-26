/**
 * O lado banco do gancho de e-mail. Marca é dado GLOBAL (sem `organization_id`):
 * a exceção justificada à regra de filtrar organização, igual a
 * `lib/brands/repositorio.ts`. As chaves vêm do payload ASSINADO do GoTrue.
 */
import { buscarMarcaAtivaPorId, buscarMarcaPadrao } from "@/lib/brands/repositorio";
import { createAdminClient } from "@/lib/supabase/admin";

import type { RepositorioDoGancho } from "./processar";

export const repositorioDoGancho: RepositorioDoGancho = {
  async registrarEntrega(webhookId) {
    const { error } = await createAdminClient().from("auth_hook_deliveries").insert({ webhook_id: webhookId });
    if (!error) return "nova";
    if (error.code === "23505") return "repetida";
    throw new Error(`auth_hook_deliveries: ${error.code ?? "erro"}`);
  },

  async apagarEntrega(webhookId) {
    await createAdminClient().from("auth_hook_deliveries").delete().eq("webhook_id", webhookId);
  },

  async marcaDoContexto(email, acao) {
    const { data, error } = await createAdminClient()
      .from("brand_email_context")
      .select("brand_id")
      .eq("email", email)
      .eq("action", acao)
      .maybeSingle();
    if (error || !data?.brand_id) return null;
    return buscarMarcaAtivaPorId(data.brand_id);
  },

  marcaPadrao: buscarMarcaPadrao,

  async hostsDaMarca(brandId) {
    const { data } = await createAdminClient()
      .from("brand_domains")
      .select("host")
      .eq("brand_id", brandId)
      .eq("status", "active")
      .order("kind", { ascending: false });
    return (data ?? []).map((l) => String(l.host));
  },
};
