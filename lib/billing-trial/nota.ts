/**
 * A nota fiscal de serviço pelo Asaas (mudança 003, AC-007.1 a AC-007.3).
 *
 * Quem EMITE é o Asaas (a configuração fiscal é da conta dele). Aqui só duas coisas, as
 * duas MELHOR ESFORÇO e nenhuma delas pode travar o pagamento ou derrubar a tela:
 *   - `pedirNotaDaAssinatura`: pede a emissão na confirmação de cada pagamento, uma vez,
 *     quando a assinatura nasce. O corpo do pedido NÃO foi provado no sandbox (conta de
 *     pessoa física). Se o provedor recusar (conta sem dados fiscais, município que não
 *     aceita), a conta segue ativa e a plataforma recebe UM aviso aberto por empresa na
 *     Central (`incidents`, Admin › Incidentes), sem dado pessoal;
 *   - `lerLinkDaNota`: lê o link da NFS-e do pagamento mais recente, com cache curto em
 *     memória (reabrir a tela não bate no provedor a cada vez). Qualquer falha vira "sem link".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { adaptador as adaptadorPadrao } from "@/lib/cobranca/provedores";
import { ErroDoProvedor, type AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";
import type { ProvedorDeCobranca } from "@/lib/cobranca/vocabulario";
import { logger } from "@/lib/logger";

export const TIPO_DO_AVISO_DE_NOTA = "cobranca.nota_fiscal_falhou";
/** Nome do serviço que vai ao pedido de NFS-e; o código municipal é configurado na conta do provedor. */
export const DESCRICAO_DO_SERVICO_DA_NOTA = "Licenciamento de uso de software";
const CACHE_DO_LINK_MS = 5 * 60_000;

export interface DependenciasDaNota {
  adaptador?: (id: ProvedorDeCobranca) => AdaptadorDeCobranca;
  agora?: () => Date;
}

const cache = new Map<string, { link: string | null; ate: number }>();
/** Para os testes: o cache é do processo. */
export function limparCacheDaNota(): void {
  cache.clear();
}

export async function lerLinkDaNota(admin: SupabaseClient, orgId: string, deps: DependenciasDaNota = {}): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("cobranca_assinaturas")
      .select("provedor, provedor_assinatura_id")
      .eq("organization_id", orgId)
      .maybeSingle();
    const linha = data as { provedor: ProvedorDeCobranca | null; provedor_assinatura_id: string | null } | null;
    if (error || !linha?.provedor || !linha.provedor_assinatura_id) return null;
    const ad = (deps.adaptador ?? adaptadorPadrao)(linha.provedor);
    if (!ad.lerLinkDaNota) return null;

    const agora = (deps.agora ?? (() => new Date()))().getTime();
    const chave = `${orgId}:${linha.provedor_assinatura_id}`;
    const guardado = cache.get(chave);
    if (guardado && guardado.ate > agora) return guardado.link;
    const link = await ad.lerLinkDaNota(linha.provedor_assinatura_id);
    cache.set(chave, { link, ate: agora + CACHE_DO_LINK_MS });
    return link;
  } catch (e) {
    logger.warn("cobranca.nota_nao_lida", { organization_id: orgId, erro: e instanceof Error ? e.name : "desconhecido" });
    return null;
  }
}

/** Nunca lança. `nao_suportada` = o provedor não pede nota por aqui (não é falha). */
export async function pedirNotaDaAssinatura(
  admin: SupabaseClient,
  p: { orgId: string; provedor: ProvedorDeCobranca; assinaturaRef: string },
  deps: DependenciasDaNota = {},
): Promise<"pedida" | "nao_suportada" | "falhou"> {
  const ad = (deps.adaptador ?? adaptadorPadrao)(p.provedor);
  if (!ad.pedirNotaFiscal) return "nao_suportada";
  try {
    await ad.pedirNotaFiscal({ assinaturaRef: p.assinaturaRef, descricao: DESCRICAO_DO_SERVICO_DA_NOTA });
    return "pedida";
  } catch (e) {
    const codigo = e instanceof ErroDoProvedor ? e.codigo : "fora_do_adaptador";
    logger.warn("cobranca.nota_nao_pedida", { organization_id: p.orgId, codigo });
    await avisarAPlataforma(admin, p.orgId, codigo);
    return "falhou";
  }
}

/** Um aviso por empresa, em qualquer situação: resolvido o aviso, a falha seguinte não o reabre. */
async function avisarAPlataforma(admin: SupabaseClient, orgId: string, codigo: string): Promise<void> {
  try {
    const { data } = await admin.from("incidents").select("id").eq("organization_id", orgId).eq("type", TIPO_DO_AVISO_DE_NOTA).limit(1);
    if (Array.isArray(data) && data.length > 0) return;
    const { error } = await admin.from("incidents").insert({
      organization_id: orgId,
      type: TIPO_DO_AVISO_DE_NOTA,
      severity: "warning",
      payload: { acao: "conferir_dados_fiscais", codigo },
    });
    if (error) logger.warn("cobranca.aviso_de_nota_nao_gravado", { organization_id: orgId, codigo: error.code ?? null });
  } catch (e) {
    logger.warn("cobranca.aviso_de_nota_nao_gravado", { organization_id: orgId, erro: e instanceof Error ? e.name : "desconhecido" });
  }
}
