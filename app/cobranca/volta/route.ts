import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { respostaDePonte } from "@/lib/auth/ponte-de-volta";
import { confirmarTrialDoCheckout } from "@/lib/billing-trial/confirmar";
import { lerRetorno } from "@/lib/billing-trial/retorno";
import { marcaDaSaida } from "@/lib/branding/saida";
import { destinoDaVolta } from "@/lib/cobranca/url";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A volta do provedor de pagamento (checkout, cancelamento do checkout, portal
 * de "Gerenciar pagamento"). Quem chega aqui é o NAVEGADOR que o provedor
 * devolveu — navegação vinda de outro site, onde o cookie de sessão
 * (`sameSite: "strict"`) não viaja. Mandar o provedor direto para
 * /app/settings/billing levava quem acabou de pagar à tela de login, logado
 * (e2e da primeira cobrança: `/login?next=%2Fapp%2Fsettings%2Fbilling%3Fvoltou%3D1`).
 *
 * Mesmo remédio da volta do Google e das redes sociais (issue #1646): um
 * documento nosso dispara a navegação seguinte, e aí o cookie viaja. Nada da
 * query é refletido: só a PRESENÇA de `voltou` e o valor exato `hub` escolhem
 * entre destinos fixos.
 *
 * Mudança 003: a volta do Checkout do trial com cartão traz `ok`, `cancelado`
 * ou `expirado`, a organização (`o`) e um selo HMAC dos dois (`s`,
 * `lib/billing-trial/retorno.ts`). Com selo válido, e só então, a volta relê o
 * provedor (`confirmarTrialDoCheckout`) ANTES de entregar a ponte, para a conta
 * já aparecer em teste quando a pessoa chegar. O selo não concede nada: o
 * estado vem do provedor. Sem selo, selo errado ou limite estourado, a volta é
 * a de sempre, sem efeito. Falha ao confirmar nunca derruba a volta: o cron
 * horário reconcilia e o "Já paguei" do hub relê.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const retorno = lerRetorno(params);
  if (retorno) {
    try {
      const taxa = await checkRateLimit(`cobranca-volta:${retorno.orgId}`, 6, 60);
      if (taxa.allowed) {
        await confirmarTrialDoCheckout(createAdminClient(), retorno);
      }
    } catch (e) {
      logger.warn("cobranca.volta_do_trial_falhou", { organization_id: retorno.orgId, erro: e instanceof Error ? e.name : "desconhecido" });
    }
  }
  const destino = destinoDaVolta(params);
  const marca = await marcaDaSaida(null);
  return respostaDePonte(destino, marca.nome, "Voltando para o seu plano…");
}
