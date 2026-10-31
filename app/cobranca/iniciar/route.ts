import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { requireRole } from "@/lib/auth/require-role";
import { confirmarTrialDoCheckout } from "@/lib/billing-trial/confirmar";
import { diaDaPrimeiraCobranca, iniciarTrialComCartao, lerPreviaDoTrial, MENSAGEM_MUITAS_TENTATIVAS } from "@/lib/billing-trial/iniciar";
import { paginaDeAviso, type IdiomaDaPagina } from "@/lib/billing-trial/pagina";
import { AVISO_TENTAR_DE_NOVO, FRASE_CONFIRMANDO, TITULO_CONFIRMANDO, textoDaPagina } from "@/lib/billing-trial/textos";
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

const CORPO = z.object({
  documento: z.string().trim().max(30).optional(),
  acao: z.enum(["verificar", "tentar_de_novo"]).optional(),
});

const ACAO = "/cobranca/iniciar";

/** "Estamos confirmando o seu pagamento": a pessoa voltou do cartão e a assinatura ainda não apareceu. */
async function paginaConfirmando(orgId: string, idioma: IdiomaDaPagina, podeTentarDeNovo: boolean, status = 200): Promise<Response> {
  const t = (texto: string) => textoDaPagina(texto, idioma);
  return paginaDeAviso({
    marca: await marcaDaSaida(orgId),
    idioma,
    titulo: t(TITULO_CONFIRMANDO),
    paragrafos: [t(FRASE_CONFIRMANDO)],
    enviar: { texto: t("Verificar agora"), acao: ACAO, campos: { acao: "verificar" } },
    enviarOutro: podeTentarDeNovo
      ? { texto: t("Tentar de novo"), acao: ACAO, aviso: t(AVISO_TENTAR_DE_NOVO), campos: { acao: "tentar_de_novo" } }
      : undefined,
    voltar: { texto: t("Voltar"), href: HUB },
    status,
  });
}

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "cobranca_assinaturas", permiteOrgSuspensa: true });
  if (!authz.ok) return authz.response;
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "cobranca"))) return para(req, "/app");

  const previa = await lerPreviaDoTrial(admin, authz.org.orgId);
  if (previa === null) return para(req, HUB);
  if (previa.confirmando) return paginaConfirmando(authz.org.orgId, authz.user.idioma, previa.confirmando.podeTentarDeNovo);
  const marca = await marcaDaSaida(authz.org.orgId);
  const idioma = authz.user.idioma;
  const t = (texto: string, valores?: Record<string, string>) => textoDaPagina(texto, idioma, valores);
  const preco = (previa.precoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = diaDaPrimeiraCobranca(previa.primeiraCobrancaEm);
  return paginaDeAviso({
    marca,
    idioma,
    titulo: t("Cadastre o cartão do seu teste grátis"),
    paragrafos: [
      t("Você só será cobrado em {dia}. Hoje não sai nada do seu cartão.", { dia }),
      t("Plano {plano}: {preco} {periodo}, a partir de {dia}. Cancele antes disso e não paga nada.", {
        plano: previa.planoNome,
        preco,
        periodo: t(previa.intervalo === "ano" ? "por ano" : "por mês"),
        dia,
      }),
      t(
        "Na próxima página, a de pagamento do Asaas pode mostrar \"Pagar\" e \"Pagamento confirmado\". Isso é só o cadastro do cartão: a cobrança é em {dia}.",
        { dia },
      ),
    ],
    documento: previa.precisaDeDocumento
      ? { rotulo: t("CPF ou CNPJ"), ajuda: t("Usamos o documento só para liberar o teste grátis uma vez por pessoa ou empresa.") }
      : undefined,
    enviar: { texto: t("Continuar para o cartão"), acao: ACAO },
    voltar: { texto: t("Voltar"), href: HUB },
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
  const idioma = authz.user.idioma;
  const t = (texto: string, valores?: Record<string, string>) => textoDaPagina(texto, idioma, valores);

  // O documento vem do formulário (CPF/CNPJ), conferido de novo em `iniciarTrialComCartao`; a org é a da sessão.
  const formulario = await req.formData().catch(() => null);
  const lido = CORPO.safeParse({ documento: formulario?.get("documento") ?? undefined, acao: formulario?.get("acao") ?? undefined });
  const documento = lido.success ? (lido.data.documento ?? null) : null;
  const acao = lido.success ? lido.data.acao : undefined;

  if (acao === "verificar") {
    // "Verificar agora": relê o Asaas pela mesma porta da volta e com a MESMA cota dela.
    const taxa = await checkRateLimit(`cobranca-volta:${orgId}`, 6, 60);
    if (!taxa.allowed) {
      return paginaDeAviso({
        marca: await marcaDaSaida(orgId),
        idioma,
        titulo: t("Não foi possível abrir o cartão"),
        paragrafos: [t(MENSAGEM_MUITAS_TENTATIVAS)],
        voltar: { texto: t("Voltar"), href: HUB },
        status: 429,
      });
    }
    const c = await confirmarTrialDoCheckout(admin, { orgId, resultado: "ok" }).catch(() => null);
    if (c?.tipo === "confirmada") return para(req, `${HUB}?voltou=1`);
    if (c?.tipo === "nao_aplica") return para(req, HUB);
    const previa = await lerPreviaDoTrial(admin, orgId).catch(() => null);
    return paginaConfirmando(orgId, idioma, previa?.confirmando?.podeTentarDeNovo ?? false);
  }

  const r = await iniciarTrialComCartao(admin, {
    orgId,
    baseUrl: baseDaMarca(req),
    actorUserId: authz.user.id,
    requestId,
    documento,
    tentarDeNovo: acao === "tentar_de_novo",
  });
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
    case "confirmando":
      return paginaConfirmando(orgId, idioma, r.podeTentarDeNovo);
    case "pede_documento": {
      const marca = await marcaDaSaida(orgId);
      return paginaDeAviso({
        marca,
        idioma,
        titulo: t("Informe seu CPF ou CNPJ"),
        paragrafos: [t("Usamos o documento só para liberar o teste grátis uma vez por pessoa ou empresa.")],
        documento: {
          rotulo: t("CPF ou CNPJ"),
          ajuda: t("Usamos o documento só para liberar o teste grátis uma vez por pessoa ou empresa."),
          erro: r.invalido ? t("Esse CPF ou CNPJ não confere. Confira os números e tente de novo.") : undefined,
        },
        enviar: { texto: t("Continuar para o cartão"), acao: ACAO },
        voltar: { texto: t("Voltar"), href: HUB },
        status: r.invalido ? 422 : 200,
      });
    }
    default: {
      const marca = await marcaDaSaida(orgId);
      const mensagem = t(
        r.tipo === "em_preparo" ? "Já estamos abrindo a página do cartão. Aguarde alguns segundos e tente de novo." : r.mensagem,
      );
      return paginaDeAviso({
        marca,
        idioma,
        titulo: t(r.tipo === "trial_ja_usado" ? "O teste grátis já foi usado" : "Não foi possível abrir o cartão"),
        paragrafos: [mensagem],
        voltar: { texto: t("Voltar"), href: HUB },
        status: r.tipo === "trial_ja_usado" ? 409 : r.tipo === "muitas_tentativas" ? 429 : r.tipo === "em_preparo" ? 409 : 503,
      });
    }
  }
}
