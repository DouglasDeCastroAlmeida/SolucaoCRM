import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { modeloPodeErrarFerramentas } from "@/lib/ai/modelo-fraco";
import { validateProviderKey } from "@/lib/ai/provider-validators";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ai/credentials/test — A CONECTIVIDADE, ANTES DE SALVAR (#1642).
 *
 * O provedor personalizado é o único em que o ENDEREÇO é escolha do operador,
 * então há algo a provar antes de gravar que os nativos não têm: a tela testa
 * `GET {base}/models` (timeout 10s) e mostra sucesso ou erro na hora; a
 * gravação só acontece depois. É a MESMA função que a validação em segundo
 * plano roda sobre a linha gravada — mesmo endereço, mesma chave, mesma
 * resposta —, então o que a tela aprova é o que o runtime vai usar.
 *
 * A chave entra no corpo e sai daqui sem log, sem audit e sem eco na resposta:
 * o retorno é `{ ok, models, error }` e `error` é um CÓDIGO, nunca o corpo que
 * o provedor devolveu (que poderia repetir a credencial).
 */
const testSchema = z.object({
  base_url: z.string().trim().min(1).max(500),
  api_key: z.string().trim().min(8).max(2048),
  /** Opcional: com o modelo informado, a resposta diz se ele pode errar ferramentas (AC-001.6). */
  modelo: z.string().trim().min(1).max(200).optional(),
});

/** `ai_models` é catálogo global (sem organização). Falha de leitura = sem catálogo = avisa. */
async function catalogoDoProvedor(provider: string) {
  const { data } = await createAdminClient()
    .from("ai_models")
    .select("model_id, supports_tools")
    .eq("provider", provider)
    .is("deprecated_at", null);
  return (data ?? []) as Array<{ model_id: string; supports_tools: boolean | null }>;
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_credentials" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }

  const parsed = testSchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const resultado = await validateProviderKey("custom", parsed.data.api_key, parsed.data.base_url);

  // Aviso, nunca bloqueio: modelo fraco só é dito, o uso segue livre.
  const aviso = resultado.ok
    ? modeloPodeErrarFerramentas(parsed.data.modelo, await catalogoDoProvedor("custom"))
    : false;

  return ok(
    resultado.ok
      ? { ok: true, models: resultado.models, error: null, aviso_modelo_fraco: aviso }
      : { ok: false, models: [], error: resultado.error, aviso_modelo_fraco: false },
    { requestId },
  );
}
