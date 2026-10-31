import { z } from "zod";

import {
  CardDeCobranca,
  type AssinaturaDoCard,
  type PlanoDoCard,
} from "@/components/admin/tenants/CardDeCobranca";
import { lerEscopoDoCadastro } from "@/lib/cobranca/cadastro";
import { provedorDaInstalacao } from "@/lib/cobranca/configuracao";
import { exigeDocumento, sugestaoDoCadastro } from "@/lib/cobranca/documento";
import type { ProvedorDeCobranca } from "@/lib/cobranca/vocabulario";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";

import { TenantOverviewClient } from "./_client";

interface TenantDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TenantDetailPage({ params }: TenantDetailPageProps) {
  const { id } = await params;
  const cobranca = await lerCobrancaDoTenant(id);
  return (
    <div className="space-y-6">
      <TenantOverviewClient id={id} cobrancaLigada={cobranca !== null} />
      {cobranca && <CardDeCobranca orgId={id} {...cobranca} />}
    </div>
  );
}

/**
 * O card Cobrança (spec da cobrança §9). `null` = a chave está desligada: a
 * página fica como sempre foi. Leitura que falha LANÇA: o card não mostra
 * "isenta" de uma empresa cuja assinatura ninguém leu. O platform admin é
 * conferido pelo layout desta rota.
 */
async function lerCobrancaDoTenant(orgId: string) {
  // Id que não é uuid daria 22P02 no PostgREST e esta página LANÇARIA (500);
  // sem card, o TenantOverviewClient já mostra "não foi possível carregar".
  if (!z.string().uuid().safeParse(orgId).success) return null;
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "cobranca"))) return null;
  const [planos, assinatura, org, daInstalacao] = await Promise.all([
    admin.from("cobranca_planos").select("id, nome, arquivado_em, brand_id").order("nome"),
    admin
      .from("cobranca_assinaturas")
      .select("plano_id, estado, trial_ate, prazo_extra_ate, provedor, plano_agendado_id, proximo_vencimento, provedor_cliente_id")
      .eq("organization_id", orgId)
      .maybeSingle(),
    admin.from("organizations").select("status, suspended_kind, settings, cnpj, brand_id").eq("id", orgId).maybeSingle(),
    provedorDaInstalacao(),
  ]);
  if (planos.error || assinatura.error || org.error) {
    throw new Error(`cobrança do tenant: leitura falhou (${planos.error?.code ?? assinatura.error?.code ?? org.error?.code})`);
  }
  // Os planos da empresa são os do escopo dela (instalação ou a marca que cobra), mais o que ela já usa.
  const escopo = await lerEscopoDoCadastro(admin, (org.data?.brand_id as string | null | undefined) ?? null);
  if (!escopo) throw new Error("cobrança do tenant: leitura da marca falhou");
  const planosDaEmpresa = ((planos.data ?? []) as Array<PlanoDoCard & { brand_id: string | null }>)
    .filter((p) => (p.brand_id ?? null) === escopo.brandId || p.id === assinatura.data?.plano_id)
    .map(({ id, nome, arquivado_em }): PlanoDoCard => ({ id, nome, arquivado_em }));
  const rotulo = (org.data?.settings as { plan?: unknown } | null)?.plan;
  // O id do cliente no provedor decide só se o documento é pedido; não vai ao componente de cliente.
  const { provedor_cliente_id: clienteNoProvedor, ...semIdDoProvedor } = assinatura.data ?? { provedor_cliente_id: null };
  return {
    planos: planosDaEmpresa,
    assinatura: (assinatura.data ? semIdDoProvedor : null) as AssinaturaDoCard | null,
    pedeDocumento: exigeDocumento(
      ((assinatura.data?.provedor ?? daInstalacao) as ProvedorDeCobranca | null),
      clienteNoProvedor !== null,
    ),
    documentoDoCadastro: sugestaoDoCadastro(org.data?.cnpj ?? null),
    suspensaPorCobranca: org.data?.status === "suspended" && org.data?.suspended_kind === "cobranca",
    rotuloAntigo: typeof rotulo === "string" && rotulo !== "" ? rotulo : null,
  };
}
