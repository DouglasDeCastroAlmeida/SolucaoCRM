/**
 * Adaptador do canal de e-mail (mudança 005) — ainda MÍNIMO (Fatia 2).
 *
 * Existe para o provider `email` ser um canal de mensagem completo na matriz e no
 * `ADAPTERS`: o endereço do destinatário vem de `contacts.email`, e o envio SMTP
 * (Re:, In-Reply-To, References, anexos, assinatura) chega na Fatia 5. Até lá `send`
 * LANÇA `email_not_configured` — o handler traduz o prefixo para `queued`, em vez de
 * fingir um `sent` sem e-mail nenhum ter saído.
 *
 * Burro de propósito, como os irmãos: traduz formato e nada mais. Teto diário,
 * intervalo e aprovação da IA são da cadeia `before_send` e do `limite.ts`.
 */
import type { ChannelAdapter, RecipientInput } from "../types";

export const EMAIL_NAO_CONFIGURADO = "email_not_configured";

/** Forma mínima de endereço: algo@dominio.tld, sem espaços. A validação real é do servidor de e-mail. */
const FORMA_DE_ENDERECO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailAdapter: ChannelAdapter = {
  provider: "email",

  resolveRecipient(input: RecipientInput): string | null {
    if (input.isGroup) return null;
    const endereco = (input.email ?? "").trim().toLowerCase();
    return FORMA_DE_ENDERECO.test(endereco) ? endereco : null;
  },

  isConfigured(): boolean {
    return true;
  },

  async send(): Promise<{ externalId: string | null }> {
    throw new Error(`${EMAIL_NAO_CONFIGURADO}: o envio por e-mail ainda não está disponível.`);
  },

  // Mínimo da Fatia 2: sem conexão IMAP ainda (Fatia 4), não há o que perguntar. `reachable: false`
  // quer dizer "não deu para perguntar" e NÃO sobrescreve o status da sessão. Nenhuma caixa existe
  // antes das rotas da Fatia 3; a cerca de saúde exige o método para o canal não entrar mudo.
  async checkHealth() {
    return { reachable: false, status: null, detail: "A verificação da caixa de e-mail ainda não está disponível." };
  },

  codes: {
    notConfigured: EMAIL_NAO_CONFIGURADO,
    sendFailed: "email_error",
    unknownError: "email_unknown",
  },
};
