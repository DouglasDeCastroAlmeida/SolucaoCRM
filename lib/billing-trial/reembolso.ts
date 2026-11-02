/**
 * O reembolso de arrependimento (mudança 003, AC-006.3 a AC-006.5).
 *
 * A regra: até 7 dias depois da 1ª cobrança PAGA (o provedor diz quando; fim do dia
 * civil de São Paulo, a favor de quem pede), UM pedido por cobrança. O pedido vira
 * uma linha em `cobranca_reembolsos` (única por organização + cobrança, o que torna
 * o segundo clique inofensivo), um item na Central da plataforma (`incidents`, onde o
 * dono da instalação devolve o dinheiro no painel do Asaas, à mão) e a conta é
 * cancelada. A janela é conferida NO SERVIDOR: a tela só decide se mostra o botão.
 *
 * Ordem de segurança: o pedido só vale com o item da Central aberto (se o item falha,
 * o pedido é desfeito e a pessoa tenta de novo); o cancelamento vem depois, e se ele
 * falha o pedido segue de pé e o clique seguinte (que responde "já pedido") tenta
 * cancelar de novo. Quem chama audita (o ator é de quem chama).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { adaptador as adaptadorPadrao } from "@/lib/cobranca/provedores";
import { ErroDoProvedor, type AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";
import { sincronizar as sincronizarPadrao } from "@/lib/cobranca/sincronizar";
import type { ProvedorDeCobranca } from "@/lib/cobranca/vocabulario";
import { logger } from "@/lib/logger";

export const JANELA_DO_REEMBOLSO_DIAS = 7;
export const TIPO_DO_ITEM_DE_REEMBOLSO = "cobranca.reembolso_pedido";
const DIA_MS = 24 * 3_600_000;

/**
 * Do INÍCIO do dia civil do pagamento até 7 dias depois do FIM desse dia (a favor de
 * quem pede). Comparar com o início impede o relógio torto (pagamento em dia futuro)
 * e, ao mesmo tempo, não faz a pessoa esperar a meia-noite para o botão abrir.
 */
export function dentroDaJanelaDeReembolso(pagoEm: Date, pagoAte: Date, agora: Date): boolean {
  return agora.getTime() >= pagoEm.getTime() && agora.getTime() <= pagoAte.getTime() + JANELA_DO_REEMBOLSO_DIAS * DIA_MS;
}

export interface DependenciasDoReembolso {
  adaptador?: (id: ProvedorDeCobranca) => AdaptadorDeCobranca;
  agora?: () => Date;
  sincronizar?: (admin: SupabaseClient, orgId: string) => Promise<unknown>;
}

export type ResultadoDoReembolso =
  /** `cancelou`: ESTA chamada cancelou a conta (num retry de `ja_pedido`, quem chama audita). */
  | { tipo: "criado" | "ja_pedido"; pagamentoRef: string; cancelou: boolean }
  | { tipo: "recusado"; status: number; code: string; message: string };

interface Linha {
  provedor: ProvedorDeCobranca | null;
  provedor_assinatura_id: string | null;
  cancela_no_fim: boolean;
}

const recusa = (status: number, code: string, message: string): ResultadoDoReembolso => ({ tipo: "recusado", status, code, message });

async function lerLinha(admin: SupabaseClient, orgId: string): Promise<Linha | null | "erro"> {
  const { data, error } = await admin
    .from("cobranca_assinaturas")
    .select("provedor, provedor_assinatura_id, cancela_no_fim")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return "erro";
  return (data as Linha | null) ?? null;
}

/** O botão "Pedir reembolso": só com a janela aberta e a conta ainda não cancelada. Nunca lança. */
export async function reembolsoDisponivel(
  admin: SupabaseClient,
  orgId: string,
  deps: DependenciasDoReembolso = {},
): Promise<{ disponivel: true; ate: Date } | { disponivel: false; ate: null }> {
  const fechado = { disponivel: false, ate: null } as const;
  try {
    const linha = await lerLinha(admin, orgId);
    if (!linha || linha === "erro" || !linha.provedor || !linha.provedor_assinatura_id || linha.cancela_no_fim) return fechado;
    const ad = (deps.adaptador ?? adaptadorPadrao)(linha.provedor);
    const pago = ad.lerPrimeiroPagamento ? await ad.lerPrimeiroPagamento(linha.provedor_assinatura_id) : null;
    if (!pago || !dentroDaJanelaDeReembolso(pago.pagoEm, pago.pagoAte, (deps.agora ?? (() => new Date()))())) return fechado;
    return { disponivel: true, ate: new Date(pago.pagoAte.getTime() + JANELA_DO_REEMBOLSO_DIAS * DIA_MS) };
  } catch (e) {
    logger.warn("cobranca.reembolso_botao_nao_lido", { organization_id: orgId, erro: e instanceof Error ? e.name : "desconhecido" });
    return fechado;
  }
}

export async function pedirReembolso(admin: SupabaseClient, orgId: string, deps: DependenciasDoReembolso = {}): Promise<ResultadoDoReembolso> {
  const agora = (deps.agora ?? (() => new Date()))();
  const linha = await lerLinha(admin, orgId);
  if (linha === "erro") return recusa(500, "internal_error", "Não foi possível ler a assinatura.");
  if (!linha || !linha.provedor || !linha.provedor_assinatura_id) {
    return recusa(409, "state_conflict", "Não há cobrança paga para reembolsar.");
  }
  const ad = (deps.adaptador ?? adaptadorPadrao)(linha.provedor);
  if (!ad.lerPrimeiroPagamento) return recusa(409, "state_conflict", "O provedor de pagamento não permite pedir reembolso por aqui.");

  let pago: { pagamentoRef: string; pagoEm: Date; pagoAte: Date } | null;
  try {
    pago = await ad.lerPrimeiroPagamento(linha.provedor_assinatura_id);
  } catch (e) {
    if (!(e instanceof ErroDoProvedor)) throw e;
    return recusa(503, "provedor_indisponivel", "O provedor de pagamento não respondeu. Nada mudou; tente de novo.");
  }
  if (!pago || !dentroDaJanelaDeReembolso(pago.pagoEm, pago.pagoAte, agora)) {
    return recusa(422, "reembolso_fora_da_janela", "O prazo de 7 dias depois do primeiro pagamento já passou.");
  }

  const { error: erroDoPedido } = await admin.from("cobranca_reembolsos").insert({ organization_id: orgId, pagamento_ref: pago.pagamentoRef });
  const repetido = erroDoPedido?.code === "23505";
  if (erroDoPedido && !repetido) return recusa(500, "internal_error", "Não foi possível registrar o pedido.");

  if (repetido) {
    // O outro pedido pode estar sendo desfeito (item da Central que falhou): só vale se a linha segue de pé.
    const { data: viva } = await admin
      .from("cobranca_reembolsos")
      .select("id")
      .eq("organization_id", orgId)
      .eq("pagamento_ref", pago.pagamentoRef)
      .maybeSingle();
    if (!viva) return recusa(409, "state_conflict", "O pedido anterior não foi concluído. Tente de novo.");
  } else {
    // Só ids: o item da Central não carrega dado pessoal (o nome da empresa vem da relação, só para o admin da plataforma).
    const { error: erroDoItem } = await admin.from("incidents").insert({
      organization_id: orgId,
      type: TIPO_DO_ITEM_DE_REEMBOLSO,
      severity: "warning",
      payload: { acao: "devolver_no_asaas", pagamento_ref: pago.pagamentoRef },
    });
    if (erroDoItem) {
      await admin.from("cobranca_reembolsos").delete().eq("organization_id", orgId).eq("pagamento_ref", pago.pagamentoRef);
      logger.error("cobranca.reembolso_item_nao_aberto", { organization_id: orgId, codigo: erroDoItem.code ?? null });
      return recusa(500, "internal_error", "Não foi possível registrar o pedido. Tente de novo.");
    }
  }

  let cancelou = false;
  if (!linha.cancela_no_fim) {
    try {
      await ad.cancelarNoFim(linha.provedor_assinatura_id);
    } catch (e) {
      if (!(e instanceof ErroDoProvedor)) throw e;
      return recusa(503, "provedor_indisponivel", "O pedido foi registrado, mas não conseguimos cancelar agora. Clique de novo para concluir.");
    }
    cancelou = true;
    const { error } = await admin
      .from("cobranca_assinaturas")
      .update({ cancela_no_fim: true, updated_at: agora.toISOString() })
      .eq("organization_id", orgId);
    if (error) logger.error("cobranca.reembolso_cancelamento_nao_gravado", { organization_id: orgId, codigo: error.code ?? null });
    // Melhor esforço: o webhook e o cron horário reconciliam o estado.
    await (deps.sincronizar ?? sincronizarPadrao)(admin, orgId).catch((e: unknown) =>
      logger.error("cobranca.reembolso_releitura_falhou", { organization_id: orgId, erro: e instanceof Error ? e.name : "desconhecido" }),
    );
  }
  return { tipo: repetido ? "ja_pedido" : "criado", pagamentoRef: pago.pagamentoRef, cancelou };
}
