import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { confirmarTrialDoCheckout } from "@/lib/billing-trial/confirmar";
import { diaDaPrimeiraCobranca, iniciarTrialComCartao, lerPreviaDoTrial } from "@/lib/billing-trial/iniciar";
import { paginaDeAviso } from "@/lib/billing-trial/pagina";
import { marcaDaSaida } from "@/lib/branding/saida";
import { CABECALHO_BRAND_HOST, normalizarHost } from "@/lib/branding/host";
import { env } from "@/lib/env";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * /cobranca/iniciar — o passo entre o cadastro e o cartão (mudança 003, AC-003.2/3.3/3.7).
 *
 * Quem chega é a pessoa de dentro do nosso site (o hub da conta suspensa), então o cookie
 * de sessão viaja. A organização é SEMPRE a da sessão; nada vem da query.
 *   GET  = só mostra, sem efeito: o texto que o Asaas não diz ("você só será cobrado em
 *          DD/MM"). Um GET com efeito seria disparado por pré-carregamento de link.
 *   POST = abre (ou reaproveita) o Checkout e responde 303 para ele. Clique duplo e
 *          checkout vivo: ver `lib/billing-trial/iniciar.ts`.
 * Desvio do design (que dizia GET com redirecionamento): o efeito mudou para POST.
 */
const HUB = "/account-suspended";

/** O host da marca por onde a pessoa chegou (`x-brand-host`, gravado pelo proxy); senão a URL do app. */
function baseDaMarca(req: NextRequest): string {
  const host = normalizarHost(req.headers.get(CABECALHO_BRAND_HOST));
  return host === "" ? (env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "") : `https://${host}`;
}

function para(req: NextRequest, caminho: string, status = 303): NextResponse {
  return NextResponse.redirect(new URL(caminho, baseDaMarca(req)), status);
}

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "cobranca_assinaturas", permiteOrgSuspensa: true });
  if (!authz.ok) return authz.response;
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "cobranca"))) return para(req, "/app");

  const previa = await lerPreviaDoTrial(admin, authz.org.orgId);
  if (previa === null) return para(req, HUB);
  const marca = await marcaDaSaida(authz.org.orgId);
  const preco = (previa.precoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = diaDaPrimeiraCobranca(previa.primeiraCobrancaEm);
  return paginaDeAviso({
    nomeDaMarca: marca.nome,
    titulo: "Cadastre o cartão do seu teste grátis",
    paragrafos: [
      `Você só será cobrado em ${dia}. Hoje não sai nada do seu cartão.`,
      `Plano ${previa.planoNome}: ${preco} ${previa.intervalo === "ano" ? "por ano" : "por mês"}, a partir de ${dia}. Cancele antes disso e não paga nada.`,
      `Na próxima página, a de pagamento do Asaas pode mostrar "Pagar" e "Pagamento confirmado". Isso é só o cadastro do cartão: a cobrança é em ${dia}.`,
    ],
    enviar: { texto: "Continuar para o cartão", acao: "/cobranca/iniciar" },
    voltar: { texto: "Voltar", href: HUB },
  });
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "cobranca_assinaturas", permiteOrgSuspensa: true });
  if (!authz.ok) return authz.response;
  const suporte = await requireSupportWrite();
  if (suporte) return suporte;
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "cobranca"))) return para(req, "/app");
  const orgId = authz.org.orgId;

  const r = await iniciarTrialComCartao(admin, { orgId, baseUrl: baseDaMarca(req), actorUserId: authz.user.id, requestId });
  switch (r.tipo) {
    case "redirecionar":
      return NextResponse.redirect(r.url, 303);
    case "ja_assinou": {
      // A pessoa já concluiu o cartão: relê o provedor em vez de abrir outro checkout.
      await confirmarTrialDoCheckout(admin, { orgId, resultado: "ok" }).catch(() => null);
      return para(req, `${HUB}?voltou=1`);
    }
    case "nao_aplica":
      return para(req, HUB);
    default: {
      const marca = await marcaDaSaida(orgId);
      const mensagem =
        r.tipo === "em_preparo" ? "Já estamos abrindo a página do cartão. Aguarde alguns segundos e tente de novo." : r.mensagem;
      return paginaDeAviso({
        nomeDaMarca: marca.nome,
        titulo: r.tipo === "trial_ja_usado" ? "O teste grátis já foi usado" : "Não foi possível abrir o cartão",
        paragrafos: [mensagem],
        voltar: { texto: "Voltar", href: HUB },
        status: r.tipo === "trial_ja_usado" ? 409 : r.tipo === "muitas_tentativas" ? 429 : r.tipo === "em_preparo" ? 409 : 503,
      });
    }
  }
}
