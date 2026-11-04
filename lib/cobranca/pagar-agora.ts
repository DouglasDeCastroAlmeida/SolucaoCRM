import type { EstadoDaAssinatura, ProvedorDeCobranca } from "@/lib/cobranca/vocabulario";

export interface EntradaPagarAgora {
  provedor: ProvedorDeCobranca | null;
  estado: EstadoDaAssinatura;
  temProvedor: boolean;
  assinaturasVivas: number;
  temLink: boolean;
}

/**
 * "Pagar agora" no painel do plano. Some só no teste grátis com cartão no Asaas, com a
 * 1ª cobrança agendada e em dia: o botão ali contradiz "você só será cobrado em DD/MM".
 * Nos demais casos vale o comportamento de sempre: link presente = mostra.
 * Avisos da Central e e-mails não passam por aqui e mantêm o botão.
 */
export function mostrarPagarAgora(e: EntradaPagarAgora): boolean {
  if (!e.temLink) return false;
  const cobrancaAgendadaEmDia = e.provedor === "asaas" && e.estado === "trial" && e.temProvedor && e.assinaturasVivas > 0;
  return !cobrancaAgendadaEmDia;
}
