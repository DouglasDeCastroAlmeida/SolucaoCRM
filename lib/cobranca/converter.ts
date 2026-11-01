/**
 * Cortesia -> cobrada (mudança 003, AC-002.3, ADR-003).
 *
 * "Cortesia" não é coluna: é a organização SEM linha em `cobranca_assinaturas`,
 * que o módulo já trata como isenta de régua, aviso e suspensão (AC-002.2).
 * Converter é, portanto, criar a assinatura do fluxo da marca — a mesma que
 * `fn_trial_na_criacao_da_org` cria no cadastro: trial com cartão, entrada
 * pendente, organização suspensa à espera do cartão. A marca vem da própria
 * organização no banco, nunca de quem chama.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerEscopoDoCadastro, lerPlanosDoCadastro } from "@/lib/cobranca/cadastro";
import { ehOperante } from "@/lib/organizacao/operante";
import type { EstadoDaAssinatura } from "@/lib/cobranca/vocabulario";

const DIA_MS = 24 * 3_600_000;

export type ResultadoDaConversao =
  | { tipo: "convertida"; marcaId: string; planoId: string; suspensa: boolean }
  | { tipo: "org_inexistente" }
  | { tipo: "ja_cobrada" }
  | { tipo: "marca_nao_cobra" }
  | { tipo: "marca_sem_plano" };

export interface DependenciasDaConversao {
  agora?: () => Date;
  /** Quem converteu (admin da plataforma), registrado na suspensão. */
  ator: string;
}

/** Estado que o painel de contas mostra: sem assinatura é "cortesia" (derivado, ADR-003). */
export function estadoNoPainelDeContas(assinatura: { estado: EstadoDaAssinatura } | null): EstadoDaAssinatura | "cortesia" {
  return assinatura ? assinatura.estado : "cortesia";
}

export async function converterCortesia(admin: SupabaseClient, orgId: string, deps: DependenciasDaConversao): Promise<ResultadoDaConversao> {
  const agora = (deps.agora ?? (() => new Date()))();

  const { data: org, error: erroDaOrg } = await admin.from("organizations").select("id, brand_id, status").eq("id", orgId).maybeSingle();
  if (erroDaOrg) throw new Error(`cobranca: leitura da empresa falhou (${erroDaOrg.code ?? "sem_codigo"})`);
  if (!org) return { tipo: "org_inexistente" };

  const { data: linha, error: erroDaLinha } = await admin
    .from("cobranca_assinaturas")
    .select("organization_id, plano_id, pagamento_inicial_pendente, trial_com_cartao")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (erroDaLinha) throw new Error(`cobranca: leitura da assinatura falhou (${erroDaLinha.code ?? "sem_codigo"})`);
  if (linha) {
    // Conversão interrompida: assinatura do fluxo da marca ainda à espera do cartão e org operante.
    // Repete só a suspensão (retomável); qualquer outra linha é cobrança de verdade.
    const l = linha as { plano_id: string; pagamento_inicial_pendente: boolean; trial_com_cartao: boolean };
    const brandId = (org as { brand_id: string | null }).brand_id;
    if (l.pagamento_inicial_pendente && l.trial_com_cartao && ehOperante((org as { status: string }).status) && brandId) {
      const suspensa = await suspender(admin, orgId, deps.ator);
      return { tipo: "convertida", marcaId: brandId, planoId: l.plano_id, suspensa };
    }
    return { tipo: "ja_cobrada" };
  }

  const escopo = await lerEscopoDoCadastro(admin, (org as { brand_id: string | null }).brand_id);
  if (!escopo) throw new Error("cobranca: leitura da marca falhou");
  if (!escopo.cobra || !escopo.brandId) return { tipo: "marca_nao_cobra" };

  const planos = await lerPlanosDoCadastro(admin, escopo.brandId);
  if (!planos) throw new Error("cobranca: leitura dos planos falhou");
  if (!planos.padraoId) return { tipo: "marca_sem_plano" };

  const { data: plano, error: erroDoPlano } = await admin
    .from("cobranca_planos")
    .select("trial_dias")
    .eq("id", planos.padraoId)
    .maybeSingle();
  if (erroDoPlano || !plano) throw new Error("cobranca: leitura do plano falhou");

  const { error: erroDaInsercao } = await admin.from("cobranca_assinaturas").insert({
    organization_id: orgId,
    plano_id: planos.padraoId,
    estado: "trial",
    trial_ate: new Date(agora.getTime() + (plano as { trial_dias: number }).trial_dias * DIA_MS).toISOString(),
    pagamento_inicial_pendente: true,
    trial_com_cartao: true,
  });
  if (erroDaInsercao) {
    if (erroDaInsercao.code === "23505") return { tipo: "ja_cobrada" };
    throw new Error(`cobranca: criação da assinatura falhou (${erroDaInsercao.code ?? "sem_codigo"})`);
  }

  let suspensa: boolean;
  try {
    suspensa = await suspender(admin, orgId, deps.ator);
  } catch (e) {
    // Compensa: sem a suspensão a org ficaria ativa sem pagar e a repetição devolveria ja_cobrada.
    await admin
      .from("cobranca_assinaturas")
      .delete()
      .eq("organization_id", orgId)
      .eq("plano_id", planos.padraoId)
      .eq("trial_com_cartao", true)
      .eq("pagamento_inicial_pendente", true);
    throw e;
  }

  return { tipo: "convertida", marcaId: escopo.brandId, planoId: planos.padraoId, suspensa };
}

async function suspender(admin: SupabaseClient, orgId: string, ator: string): Promise<boolean> {
  const { data, error } = await admin.rpc("fn_suspender_organizacao", {
    p_org: orgId,
    p_kind: "cobranca",
    p_motivo: "Aguardando o primeiro pagamento",
    p_ator: ator,
  });
  if (error) throw new Error(`cobranca: suspensão à espera do cartão falhou (${error.code ?? "sem_codigo"})`);
  return (data as { changed?: boolean } | null)?.changed !== false;
}
