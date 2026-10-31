/**
 * A volta do Checkout (mudança 003, AC-003.2, AC-003.3, AC-003.7, AC-005.1, AC-005.4).
 *
 * Retorno e webhook só ACORDAM a leitura: a verdade é a assinatura que o Asaas
 * tem para a organização, achada pela `externalReference` (= org), nunca pelo
 * cliente (a página do Checkout cria o dela). Três desfechos:
 *   - a assinatura existe: a linha ganha provedor, cliente e assinatura por
 *     compare-and-set em `pagamento_inicial_pendente` (dois retornos concorrentes:
 *     um grava, o outro só relê) e `sincronizar` aplica o estado e reativa a org
 *     suspensa por cobrança — a única porta que suspende e reativa;
 *   - não existe (fechou a página, cartão recusado): a org continua suspensa e o
 *     checkout em aberto, no cancelamento ou na expiração, é descartado para a
 *     pessoa refazer o cartão sem perder o cadastro;
 *   - o provedor não respondeu: nada muda, e o cron horário reconcilia.
 * O 1º pagamento (dia 8) e as demais mudanças não passam por aqui: são do
 * `sincronizar`, sempre pelo mesmo caminho, o que mantém AC-005.1 e AC-005.4.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResultadoDeRetorno } from "@/lib/billing-trial/retorno";
import { provedorDaInstalacao } from "@/lib/cobranca/configuracao";
import { adaptador as adaptadorPadrao, modoDoProvedor } from "@/lib/cobranca/provedores";
import { ErroDoProvedor, type AdaptadorDeCobranca, type Modo } from "@/lib/cobranca/provedores/contrato";
import { sincronizar, type ResultadoDaSincronizacao } from "@/lib/cobranca/sincronizar";
import type { ProvedorDeCobranca } from "@/lib/cobranca/vocabulario";
import { logger } from "@/lib/logger";

export interface DependenciasDoConfirmar {
  adaptador?: (id: ProvedorDeCobranca) => AdaptadorDeCobranca;
  provedor?: () => Promise<ProvedorDeCobranca | null>;
  modo?: (id: ProvedorDeCobranca) => Promise<Modo | null>;
  sincronizar?: (admin: SupabaseClient, orgId: string) => Promise<ResultadoDaSincronizacao>;
}

export type ResultadoDoConfirmar =
  /** A assinatura existe e a linha aponta para ela. `reativada` = a org suspensa por cobrança voltou agora. */
  | { tipo: "confirmada"; reativada: boolean; primeiraVez: boolean }
  /** Nada de assinatura no Asaas: a org segue suspensa e pode refazer o cartão. */
  | { tipo: "pendente"; checkoutDescartado: boolean }
  /** A org não é um trial com cartão (ou não existe linha): nada a fazer. */
  | { tipo: "nao_aplica" }
  /** O provedor não respondeu: nada mudou. */
  | { tipo: "provedor_fora" };

interface Linha {
  trial_com_cartao: boolean;
  pagamento_inicial_pendente: boolean;
  provedor: ProvedorDeCobranca | null;
  provedor_cliente_id: string | null;
  checkout_sessao_id: string | null;
}

const reativou = (r: ResultadoDaSincronizacao) => r.tipo === "aplicada" && r.acao === "reativar";

export async function confirmarTrialDoCheckout(
  admin: SupabaseClient,
  p: { orgId: string; resultado: ResultadoDeRetorno },
  deps: DependenciasDoConfirmar = {},
): Promise<ResultadoDoConfirmar> {
  const { orgId } = p;
  const sincroniza = deps.sincronizar ?? ((a, o) => sincronizar(a, o));

  const lida = await admin
    .from("cobranca_assinaturas")
    .select("trial_com_cartao, pagamento_inicial_pendente, provedor, provedor_cliente_id, checkout_sessao_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (lida.error) throw new Error(`cobranca: leitura da assinatura falhou (${lida.error.code ?? "sem_codigo"})`);
  const linha = lida.data as Linha | null;
  if (!linha?.trial_com_cartao) return { tipo: "nao_aplica" };

  // Segundo retorno (ou webhook depois do retorno): a linha já aponta para a assinatura. Só relê.
  if (!linha.pagamento_inicial_pendente && linha.provedor !== null && linha.provedor_cliente_id !== null) {
    const r = await sincroniza(admin, orgId).catch(() => null);
    return { tipo: "confirmada", reativada: r !== null && reativou(r), primeiraVez: false };
  }

  const provedor = await (deps.provedor ?? provedorDaInstalacao)();
  const ad = provedor === null ? null : (deps.adaptador ?? adaptadorPadrao)(provedor);
  if (provedor === null || ad === null || !ad.acharAssinaturaDoCheckout) return { tipo: "provedor_fora" };

  let achada: { clienteRef: string; assinaturaRef: string } | null;
  try {
    achada = await ad.acharAssinaturaDoCheckout({ orgId });
  } catch (e) {
    logger.warn("cobranca.trial_confirmar_leitura_falhou", { organization_id: orgId, codigo: e instanceof ErroDoProvedor ? e.codigo : "fora_do_adaptador" });
    return { tipo: "provedor_fora" };
  }

  if (achada === null) {
    // Cancelou ou expirou: o link velho não serve mais. Ok sem assinatura ainda (atraso do Asaas): mantém.
    if (p.resultado === "ok") return { tipo: "pendente", checkoutDescartado: false };
    const { error } = await admin
      .from("cobranca_assinaturas")
      .update({ checkout_url: null, checkout_expira_em: null, checkout_sessao_id: null })
      .eq("organization_id", orgId)
      .eq("pagamento_inicial_pendente", true);
    if (error) throw new Error(`cobranca: checkout do trial não descartado (${error.code ?? "sem_codigo"})`);
    return { tipo: "pendente", checkoutDescartado: true };
  }

  // O compare-and-set é a idempotência: só quem ainda encontra a entrada pendente grava (AC-003.7).
  const modo = await (deps.modo ?? modoDoProvedor)(provedor);
  const gravada = await admin
    .from("cobranca_assinaturas")
    .update({
      provedor,
      modo,
      provedor_cliente_id: achada.clienteRef,
      provedor_assinatura_id: achada.assinaturaRef,
      pagamento_inicial_pendente: false,
      checkout_url: null,
      checkout_expira_em: null,
      checkout_sessao_id: null,
    })
    .eq("organization_id", orgId)
    .eq("pagamento_inicial_pendente", true)
    .select("organization_id")
    .maybeSingle();
  if (gravada.error) throw new Error(`cobranca: confirmação do trial não gravada (${gravada.error.code ?? "sem_codigo"})`);

  // `sincronizar` aplica o estado do provedor e reativa a org (única porta). Se falhar, o cron horário reconcilia.
  let reativada = false;
  try {
    reativada = reativou(await sincroniza(admin, orgId));
  } catch (e) {
    logger.warn("cobranca.trial_confirmar_sincronizar_falhou", { organization_id: orgId, erro: e instanceof Error ? e.name : "desconhecido" });
  }
  return { tipo: "confirmada", reativada, primeiraVez: gravada.data !== null };
}
