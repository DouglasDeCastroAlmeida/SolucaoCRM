/**
 * Um trial por documento por marca (mudança 003, AC-003.5 e AC-003.6, ADR-006).
 *
 * A memória de "este CPF/CNPJ já teve o teste grátis" mora em
 * `cobranca_trial_documentos`: chave primária (marca, hash). Só o HMAC entra
 * (`hashDoDocumentoDoServidor`); o documento em claro não é gravado, não é
 * logado e não volta na resposta. Marca diferente, linha diferente: a mesma
 * pessoa ganha o teste em cada marca (a regra é por marca).
 *
 * A tabela é exclusiva do servidor (RLS sem policy, só `service_role`): o
 * `brandId` e a `organizationId` vêm de fonte confiável do chamador, nunca do corpo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { hashDoDocumentoDoServidor } from "@/lib/billing-trial/documento-hash";

/** Texto da recusa (código canônico `trial_ja_usado`): diz a saída, sem jargão. */
export const MENSAGEM_TRIAL_JA_USADO =
  "Este CPF ou CNPJ já usou o teste grátis aqui. Você pode assinar agora: a cobrança começa hoje.";

export type ResultadoDoTrial =
  | { ok: true }
  | { ok: false; motivo: "trial_ja_usado" | "documento_invalido" | "indisponivel" };

/**
 * Reserva o teste grátis do documento nesta marca para esta empresa.
 *
 * Idempotente por empresa: repetir a reserva da MESMA empresa (retorno duplicado
 * do checkout) devolve `ok` sem criar outra linha. Reserva de OUTRA empresa para
 * o mesmo (marca, documento) é recusada. Falha do banco nunca vira concessão.
 */
export async function reservarTrialDoDocumento(
  admin: SupabaseClient,
  p: { brandId: string; documento: string; organizationId: string },
): Promise<ResultadoDoTrial> {
  let hash: string;
  try {
    hash = hashDoDocumentoDoServidor(p.documento);
  } catch {
    return { ok: false, motivo: "documento_invalido" };
  }

  const { error } = await admin
    .from("cobranca_trial_documentos")
    .insert({ brand_id: p.brandId, documento_hash: hash, organization_id: p.organizationId });
  if (!error) return { ok: true };
  if (error.code !== "23505") return { ok: false, motivo: "indisponivel" };

  const { data, error: erroDeLeitura } = await admin
    .from("cobranca_trial_documentos")
    .select("organization_id")
    .eq("brand_id", p.brandId)
    .eq("documento_hash", hash)
    .maybeSingle();
  if (erroDeLeitura) return { ok: false, motivo: "indisponivel" };
  return data?.organization_id === p.organizationId ? { ok: true } : { ok: false, motivo: "trial_ja_usado" };
}
