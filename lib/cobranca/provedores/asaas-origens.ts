/**
 * As origens para onde o Asaas manda a pessoa pagar (o link do Checkout). Fonte única:
 * a CSP de `/cobranca/iniciar` (`form-action`) lê esta lista, porque o navegador aplica
 * `form-action` também ao redirecionamento 303 do POST. Trocar o host aqui sem mexer
 * em mais nada é seguro; trocá-lo no adaptador sem trocar aqui é barrado por teste.
 * Puro de propósito (sem env, sem logger).
 */
export const ASAAS_ORIGENS_DO_CHECKOUT = ["https://sandbox.asaas.com", "https://www.asaas.com"] as const;
