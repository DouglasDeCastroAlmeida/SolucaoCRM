/**
 * Cobrança de cada conta no painel de contas (mudança 003, AC-009.2 e AC-009.3).
 * Puro: junta organização, assinatura e plano já lidos pela rota admin. Só
 * devolve o necessário (estado, plano, datas, link): nada de e-mail, documento
 * ou ids do provedor.
 */
import { estadoNoPainelDeContas } from "@/lib/cobranca/converter";
import { ASAAS_ORIGENS_DO_CHECKOUT } from "@/lib/cobranca/provedores/asaas-origens";
import type { EstadoDaAssinatura } from "@/lib/cobranca/vocabulario";

export type EstadoDaContaNoPainel = EstadoDaAssinatura | "cortesia" | "suspensa";

export interface OrgParaOPainel {
  id: string;
  status: string;
  suspended_kind: string | null;
  [k: string]: unknown;
}
export interface AssinaturaParaOPainel {
  organization_id: string;
  estado: EstadoDaAssinatura;
  plano_id: string | null;
  trial_ate: string | null;
  proximo_vencimento: string | null;
  link_de_pagamento: string | null;
}
export interface CobrancaDaConta {
  estado: EstadoDaContaNoPainel;
  plano: string | null;
  trial_ate: string | null;
  proximo_vencimento: string | null;
  link_asaas: string | null;
}

/** "Suspensa" não é estado da assinatura: vem de organizations.status + suspended_kind (design §estados). */
export function estadoDaContaNoPainel(
  assinatura: { estado: EstadoDaAssinatura } | null,
  org: { status: string; suspended_kind: string | null },
): EstadoDaContaNoPainel {
  const base = estadoNoPainelDeContas(assinatura);
  if (assinatura && base !== "cancelada" && org.status === "suspended" && org.suspended_kind === "cobranca") return "suspensa";
  return base;
}

/** Só https e só origem do Asaas: o painel nunca emite href vindo do banco sem checar. */
export function linkSeguroDoAsaas(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return (ASAAS_ORIGENS_DO_CHECKOUT as readonly string[]).includes(u.origin) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function anexarCobrancaAsContas<T extends OrgParaOPainel>(
  orgs: T[],
  assinaturas: AssinaturaParaOPainel[],
  planos: Array<{ id: string; nome: string }>,
): Array<T & { cobranca: CobrancaDaConta }> {
  const porOrg = new Map(assinaturas.map((a) => [a.organization_id, a]));
  const nomeDoPlano = new Map(planos.map((p) => [p.id, p.nome]));
  return orgs.map((o) => {
    const a = porOrg.get(o.id) ?? null;
    return {
      ...o,
      cobranca: {
        estado: estadoDaContaNoPainel(a, o),
        plano: a?.plano_id ? (nomeDoPlano.get(a.plano_id) ?? null) : null,
        trial_ate: a?.trial_ate ?? null,
        proximo_vencimento: a?.proximo_vencimento ?? null,
        link_asaas: linkSeguroDoAsaas(a?.link_de_pagamento),
      },
    };
  });
}
