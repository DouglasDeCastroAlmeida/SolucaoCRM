/**
 * Ajudantes das rotas `/api/v1/admin/brands|vertical-packs|organizations`.
 * A autorização (`requirePlatformAdmin*`) e a guarda de suporte
 * (`requireSupportWrite(`) ficam EXPLÍCITAS em cada handler, porque as cercas
 * do repositório leem o texto do handler.
 */
import type { NextRequest } from "next/server";
import type { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { ErroDeMarca } from "./admin-repo";

export async function lerCorpo<S extends z.ZodTypeAny>(
  req: NextRequest,
  schema: S,
  requestId: string,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: ReturnType<typeof fail> }> {
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return { ok: false, res: fail("validation_failed", "Corpo inválido.", 400, { requestId }) };
  }
  const r = schema.safeParse(bruto);
  if (!r.success) {
    return {
      ok: false,
      res: fail("validation_failed", r.error.issues[0]?.message ?? "Dados inválidos.", 400, {
        requestId,
        details: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }),
    };
  }
  return { ok: true, data: r.data };
}

/** Erro esperado do repositório vira resposta; o resto vira 500 sem detalhes. */
export function respostaDeErro(err: unknown, requestId: string) {
  if (err instanceof ErroDeMarca) return fail(err.code, err.message, err.status, { requestId });
  return fail("internal_error", "Não foi possível concluir a operação.", 500, { requestId });
}
