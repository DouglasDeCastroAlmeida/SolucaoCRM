/**
 * Abre o Checkout hospedado do trial com cartão (mudança 003, AC-003.2/3.3/3.7, AC-008.4).
 *
 * Quem chama (a rota `/cobranca/iniciar`) entrega a organização da SESSÃO e o host
 * da marca; a marca, o plano e o estado saem do banco, nunca do corpo. Três fases,
 * e nenhuma chamada ao provedor dentro de transação:
 *   1. reserva por compare-and-set na VERSÃO da linha (`updated_at`): dois cliques
 *      leem a mesma versão e só um grava; o outro vê `em_preparo`. Checkout vivo
 *      (guardado com a sessão) é devolvido de novo, sem abrir outro;
 *   2. fora de transação: assinatura que o Checkout já criou para a org (achada
 *      pela `externalReference`) vira `ja_assinou` em vez de um segundo checkout;
 *      documento (o do cadastro, ou o digitado na tela de antes; sem nenhum, a
 *      tela o pede) reserva o trial da marca; então o checkout, com `externalReference` = org;
 *   3. grava link, sessão, validade e o fim do teste (`trial_ate` = dia da 1ª
 *      cobrança). Falha na fase 2 libera a reserva e a org segue suspensa.
 *
 * Linha "confirmando" (a pessoa voltou do checkout com `ok` e a assinatura não foi achada;
 * ver `confirmar.ts`): url nula + sessão guardada. Por `PRAZO_CONFIRMANDO_MS` não se abre
 * outro checkout (duas assinaturas); passado o prazo, só com `tentarDeNovo` explícito.
 *
 * Não grava `provedor`/`provedor_cliente_id`: sem cliente conhecido, a linha com
 * provedor pela metade pararia a leitura da régua. Quem liga a assinatura à linha
 * é `confirmar`. O cartão não passa por aqui, só url, sessão e validade (AC-003.4).
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { lerEscopoDoCadastro, type EscopoDoCadastro } from "@/lib/cobranca/cadastro";
import { provedorDaInstalacao } from "@/lib/cobranca/configuracao";
import { documentoDoPagador } from "@/lib/cobranca/documento";
import { limiteDoProvedorPorOrg } from "@/lib/cobranca/falhas";
import { adaptador as adaptadorPadrao } from "@/lib/cobranca/provedores";
import { dataCivilEmSaoPaulo, fimDoDiaEmSaoPaulo } from "@/lib/cobranca/provedores/asaas";
import { ErroDoProvedor, type AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";
import { MENSAGEM_TRIAL_JA_USADO, reservarTrialDoDocumento } from "@/lib/cobranca/trial-documento";
import type { Intervalo, ProvedorDeCobranca } from "@/lib/cobranca/vocabulario";
import { urlDeRetorno } from "@/lib/billing-trial/retorno";
import { sessaoDaTentativa } from "@/lib/billing-trial/sessao";
import { logger } from "@/lib/logger";

const RESERVA_MS = 2 * 60_000;
const DIA_MS = 24 * 3_600_000;

export const MENSAGEM_ASAAS_FORA =
  "Não conseguimos abrir a página do cartão agora. Nada foi cobrado e sua conta continua como estava. Tente de novo em alguns minutos.";
export const MENSAGEM_MUITAS_TENTATIVAS = "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";

export interface DependenciasDoIniciar {
  adaptador?: (id: ProvedorDeCobranca) => AdaptadorDeCobranca;
  agora?: () => Date;
  provedor?: () => Promise<ProvedorDeCobranca | null>;
  escopo?: (admin: SupabaseClient, brandId: string | null) => Promise<EscopoDoCadastro | null>;
  reservarTrial?: typeof reservarTrialDoDocumento;
  limite?: (orgId: string) => Promise<boolean>;
}

export type ResultadoDoIniciar =
  /** Seguir para `url` (Checkout do Asaas). `reaproveitado` = o checkout vivo, sem abrir outro. */
  | { tipo: "redirecionar"; url: string; reaproveitado: boolean; primeiraCobrancaEm: Date }
  /** O Checkout já criou a assinatura desta org: quem chama confirma em vez de abrir outro. */
  | { tipo: "ja_assinou" }
  /** A org não está à espera do cartão do trial (ou a marca não cobra). */
  | { tipo: "nao_aplica" }
  /** Outro clique está abrindo o checkout agora. */
  | { tipo: "em_preparo" }
  /** A pessoa voltou do cartão e ainda não achamos a assinatura: não abre outro checkout. */
  | { tipo: "confirmando"; podeTentarDeNovo: boolean }
  | { tipo: "trial_ja_usado"; mensagem: string }
  /** A org ainda não tem CPF/CNPJ válido e nenhum foi informado (ou o informado não confere): a tela pede. */
  | { tipo: "pede_documento"; invalido: boolean }
  | { tipo: "muitas_tentativas"; mensagem: string }
  /** Provedor fora do ar, recusa ou configuração ausente: nada mudou, org segue suspensa. */
  | { tipo: "indisponivel"; mensagem: string };

interface Linha {
  plano_id: string;
  trial_com_cartao: boolean;
  pagamento_inicial_pendente: boolean;
  trial_ate: string | null;
  provedor_cliente_id: string | null;
  checkout_url: string | null;
  checkout_expira_em: string | null;
  checkout_sessao_id: string | null;
  updated_at: string;
}

const COLUNAS =
  "plano_id, trial_com_cartao, pagamento_inicial_pendente, trial_ate, provedor_cliente_id, checkout_url, checkout_expira_em, checkout_sessao_id, updated_at";

/** A data da 1ª cobrança de quem abrir o checkout agora: hoje + dias do teste (a data civil de São Paulo vem do adaptador). */
export function primeiraCobrancaDe(agora: Date, trialDias: number): Date {
  return new Date(agora.getTime() + trialDias * DIA_MS);
}

/** "07/11" no fuso do Asaas: a data que o Checkout vai cobrar e que a nossa tela diz ANTES de ir. */
export function diaDaPrimeiraCobranca(primeiraCobrancaEm: Date): string {
  const [, mes, dia] = dataCivilEmSaoPaulo(primeiraCobrancaEm).split("-");
  return `${dia}/${mes}`;
}

export interface PreviaDoTrial {
  planoNome: string;
  precoCents: number;
  intervalo: Intervalo;
  /** Dia da 1ª cobrança: o do checkout vivo, ou o de um checkout aberto agora. */
  primeiraCobrancaEm: Date;
  /** A organização ainda não tem um CPF/CNPJ válido: a tela pede antes de abrir o cartão. */
  precisaDeDocumento: boolean;
  /** Voltou do cartão e a assinatura ainda não apareceu: a tela confirma em vez de pedir o cartão de novo. */
  confirmando: { podeTentarDeNovo: boolean } | null;
}

/** Url nula + sessão guardada = voltou com ok e a assinatura não foi achada (a reserva de um clique tem sessão nula). */
function estadoConfirmando(l: Pick<Linha, "checkout_url" | "checkout_sessao_id" | "checkout_expira_em">, agora: Date): { podeTentarDeNovo: boolean } | null {
  if (l.checkout_url !== null || l.checkout_sessao_id === null) return null;
  const dentroDoPrazo = l.checkout_expira_em !== null && Date.parse(l.checkout_expira_em) > agora.getTime();
  return { podeTentarDeNovo: !dentroDoPrazo };
}

/** Só leitura, para a tela de antes: "Você só será cobrado em DD/MM". `null` = a org não está nesse passo. */
export async function lerPreviaDoTrial(
  admin: SupabaseClient,
  orgId: string,
  deps: Pick<DependenciasDoIniciar, "agora"> = {},
): Promise<PreviaDoTrial | null> {
  const agora = (deps.agora ?? (() => new Date()))();
  const { data, error } = await admin.from("cobranca_assinaturas").select(COLUNAS).eq("organization_id", orgId).maybeSingle();
  const linha = data as Linha | null;
  if (error || !linha?.trial_com_cartao || !linha.pagamento_inicial_pendente) return null;
  const plano = await admin.from("cobranca_planos").select("id, nome, preco_cents, intervalo, trial_dias").eq("id", linha.plano_id).maybeSingle();
  const p = plano.data as { nome: string; preco_cents: number; intervalo: Intervalo; trial_dias: number } | null;
  if (plano.error || !p) return null;
  const orgLida = await admin.from("organizations").select("cnpj").eq("id", orgId).maybeSingle();
  if (orgLida.error) return null;
  const cnpj = (orgLida.data as { cnpj: string | null } | null)?.cnpj ?? null;
  const confirmando = estadoConfirmando(linha, agora);
  const vivo = linha.checkout_url !== null && linha.checkout_expira_em !== null && Date.parse(linha.checkout_expira_em) > agora.getTime();
  return {
    planoNome: p.nome,
    precoCents: p.preco_cents,
    intervalo: p.intervalo,
    primeiraCobrancaEm: vivo && linha.trial_ate ? new Date(linha.trial_ate) : primeiraCobrancaDe(agora, p.trial_dias),
    // Checkout vivo já passou pela reserva do documento: não pede de novo.
    confirmando,
    precisaDeDocumento: !vivo && confirmando === null && (cnpj === null || documentoDoPagador(cnpj) === null),
  };
}

export async function iniciarTrialComCartao(
  admin: SupabaseClient,
  p: {
    /** Da SESSÃO. Nunca do corpo ou da query. */
    orgId: string;
    /** Host da marca em https (o Asaas devolve a pessoa a ele). */
    baseUrl: string;
    actorUserId: string;
    requestId: string;
    /** O que a pessoa digitou na tela (CPF/CNPJ, com ou sem máscara). Só vale quando o cadastro da org não tem documento válido. */
    documento?: string | null;
    /** "Tentar de novo" explícito, depois do prazo do "confirmando". */
    tentarDeNovo?: boolean;
  },
  deps: DependenciasDoIniciar = {},
): Promise<ResultadoDoIniciar> {
  const { orgId } = p;
  const agora = (deps.agora ?? (() => new Date()))();
  const indisponivel: ResultadoDoIniciar = { tipo: "indisponivel", mensagem: MENSAGEM_ASAAS_FORA };

  const org = await admin.from("organizations").select("id, brand_id, cnpj").eq("id", orgId).maybeSingle();
  if (org.error) return indisponivel;
  const dono = org.data as { id: string; brand_id: string | null; cnpj: string | null } | null;
  if (!dono) return { tipo: "nao_aplica" };

  const escopo = await (deps.escopo ?? lerEscopoDoCadastro)(admin, dono.brand_id);
  if (escopo === null) return indisponivel;
  if (!escopo.cobra || escopo.brandId === null) return { tipo: "nao_aplica" };

  const lida = await admin.from("cobranca_assinaturas").select(COLUNAS).eq("organization_id", orgId).maybeSingle();
  if (lida.error) return indisponivel;
  const linha = lida.data as Linha | null;
  if (!linha?.trial_com_cartao || !linha.pagamento_inicial_pendente) return { tipo: "nao_aplica" };

  const confirmando = estadoConfirmando(linha, agora);
  if (confirmando && !(confirmando.podeTentarDeNovo && p.tentarDeNovo)) return { tipo: "confirmando", podeTentarDeNovo: confirmando.podeTentarDeNovo };

  const expira = linha.checkout_expira_em === null ? null : Date.parse(linha.checkout_expira_em);
  const reservaOuLinkVivo = expira !== null && expira > agora.getTime();
  if (reservaOuLinkVivo && linha.checkout_url !== null && linha.checkout_sessao_id !== null) {
    return {
      tipo: "redirecionar",
      url: linha.checkout_url,
      reaproveitado: true,
      primeiraCobrancaEm: linha.trial_ate ? new Date(linha.trial_ate) : agora,
    };
  }
  if (reservaOuLinkVivo) return { tipo: "em_preparo" };

  // O trial é de um documento por marca (AC-003.5/3.6): a página do Asaas é a única outra
  // chance de a pessoa digitá-lo, e nós não a vemos. Por isso pedimos AQUI, antes de reservar
  // o checkout e antes de gastar a cota de tentativas. O do cadastro vence o digitado.
  const doCadastro = dono.cnpj === null ? null : documentoDoPagador(dono.cnpj);
  const digitado = p.documento ? documentoDoPagador(p.documento) : null;
  const documento = doCadastro ?? digitado;
  if (documento === null) return { tipo: "pede_documento", invalido: Boolean(p.documento && p.documento.trim() !== "") };

  const provedor = await (deps.provedor ?? provedorDaInstalacao)();
  const ad = provedor === null ? null : (deps.adaptador ?? adaptadorPadrao)(provedor);
  if (provedor === null || ad === null || !ad.iniciarTrialComCartao) return indisponivel;

  if (!(await (deps.limite ?? limiteDoProvedorPorOrg)(orgId))) {
    return { tipo: "muitas_tentativas", mensagem: MENSAGEM_MUITAS_TENTATIVAS };
  }

  // Fase 1. A VERSÃO da linha é a posse: quem chegar junto leu a mesma e perde o CAS. (Sem filtrar `checkout_url`: link VENCIDO ainda está na linha e esta escrita o apaga.)
  const reserva = new Date(agora.getTime() + RESERVA_MS).toISOString();
  const reservada = await admin
    .from("cobranca_assinaturas")
    .update({ checkout_url: null, checkout_sessao_id: null, checkout_expira_em: reserva })
    .eq("organization_id", orgId)
    .eq("updated_at", linha.updated_at)
    .select("organization_id")
    .maybeSingle();
  if (reservada.error) return indisponivel;
  if (!reservada.data) return { tipo: "em_preparo" };

  const liberar = async () => {
    const { error } = await admin
      .from("cobranca_assinaturas")
      .update({ checkout_expira_em: null })
      .eq("organization_id", orgId)
      .eq("checkout_expira_em", reserva)
      .is("checkout_url", null);
    if (error) logger.error("cobranca: reserva do trial não liberada", { organizationId: orgId, codigo: error.code ?? null });
  };

  const tentativa = randomUUID();
  try {
    // Fase 2. A pessoa já pode ter concluído (aba velha, retorno perdido): confirmar, não abrir outro.
    if (ad.acharAssinaturaDoCheckout && (await ad.acharAssinaturaDoCheckout({ orgId }))) {
      await liberar();
      return { tipo: "ja_assinou" };
    }

    const reservou = await (deps.reservarTrial ?? reservarTrialDoDocumento)(admin, {
      brandId: escopo.brandId,
      documento,
      organizationId: orgId,
    });
    if (!reservou.ok) {
      await liberar();
      return reservou.motivo === "trial_ja_usado" ? { tipo: "trial_ja_usado", mensagem: MENSAGEM_TRIAL_JA_USADO } : indisponivel;
    }
    // Digitado agora: guarda no cadastro (mesma coluna e forma do resto do produto) para não pedir de novo.
    // Melhor esforço e sem o documento no log: CNPJ é único na instalação, e conflito não derruba o cartão.
    if (doCadastro === null) {
      const gravou = await admin.from("organizations").update({ cnpj: documento }).eq("id", orgId).is("cnpj", null);
      if (gravou.error && gravou.error.code !== "23505") {
        logger.warn("cobranca: documento do trial não gravado no cadastro", { organizationId: orgId, codigo: gravou.error.code ?? null });
      }
    }

    const planoLido = await admin.from("cobranca_planos").select("id, nome, preco_cents, intervalo, trial_dias").eq("id", linha.plano_id).maybeSingle();
    const plano = planoLido.data as { id: string; nome: string; preco_cents: number; intervalo: Intervalo; trial_dias: number } | null;
    if (planoLido.error || !plano) throw new Error("cobranca: plano do trial ilegível");

    const primeiraCobrancaEm = primeiraCobrancaDe(agora, plano.trial_dias);
    const checkout = await ad.iniciarTrialComCartao({
      clienteRef: linha.provedor_cliente_id ?? "",
      orgId,
      plano: { id: plano.id, nome: plano.nome, precoCents: plano.preco_cents, intervalo: plano.intervalo },
      primeiraCobrancaEm,
      urlDeSucesso: urlDeRetorno(p.baseUrl, orgId, "ok", tentativa),
      urlDeCancelamento: urlDeRetorno(p.baseUrl, orgId, "cancelado", tentativa),
      urlDeExpirado: urlDeRetorno(p.baseUrl, orgId, "expirado", tentativa),
      chaveIdempotencia: `trial:${orgId}:${reserva}`,
    });

    // Fase 3. O fim do teste é o fim do dia da 1ª cobrança, como o resto da régua o lê.
    const fimDoTeste = fimDoDiaEmSaoPaulo(dataCivilEmSaoPaulo(primeiraCobrancaEm));
    const gravada = await admin
      .from("cobranca_assinaturas")
      .update({
        checkout_url: checkout.url,
        checkout_sessao_id: sessaoDaTentativa(tentativa, checkout.sessaoId),
        checkout_expira_em: (checkout.expiraEm ?? new Date(agora.getTime() + 60 * 60_000)).toISOString(),
        trial_ate: fimDoTeste.toISOString(),
      })
      .eq("organization_id", orgId)
      .eq("checkout_expira_em", reserva)
      .is("checkout_url", null)
      .select("organization_id")
      .maybeSingle();
    if (gravada.error || !gravada.data) throw new Error(`cobranca: checkout do trial não gravado (${gravada.error?.code ?? "reserva_perdida"})`);

    void audit({
      action: "cobranca.checkout_iniciado",
      actorUserId: p.actorUserId,
      organizationId: orgId,
      resourceType: "cobranca_assinatura",
      resourceId: orgId,
      requestId: p.requestId,
      metadata: { provedor, modo_de_cobranca: "trial_com_cartao", plano_id: plano.id },
    });
    return { tipo: "redirecionar", url: checkout.url, reaproveitado: false, primeiraCobrancaEm };
  } catch (e) {
    await liberar();
    if (e instanceof ErroDoProvedor) {
      // Assinatura já existe: a pessoa concluiu em outra aba entre o achar e o criar.
      if (e.codigo === "assinatura_ja_existe") return { tipo: "ja_assinou" };
      logger.warn("cobranca.trial_checkout_falhou", { organization_id: orgId, status: e.status, codigo: e.codigo });
      return indisponivel;
    }
    logger.error("cobranca: iniciar do trial falhou fora do provedor", {
      requestId: p.requestId,
      organizationId: orgId,
      erro: e instanceof Error ? e.name : "desconhecido",
      motivo: e instanceof Error && e.message.startsWith("cobranca:") ? e.message : null,
    });
    return indisponivel;
  }
}
