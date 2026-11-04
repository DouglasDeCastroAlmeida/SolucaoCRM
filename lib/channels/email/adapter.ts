/**
 * Adaptador do canal de e-mail (mudança 005).
 *
 * Tradutor de formato, como os irmãos: o endereço vem de `contacts.email`, o envio é SMTP
 * pela caixa da sessão (`envio.ts`) e o limite diário/intervalo é consultado por `admitir`
 * ANTES do envio, para o handler adiar em vez de falhar. Quem cobra a aprovação da IA é a
 * cadeia `before_send` (capacidade `iaSoComAprovacao`).
 *
 * Falha de envio chega ao handler como `Error` com a causa em português e SEM texto do
 * servidor, endereço de terceiro ou senha. Erro inesperado (banco, programação) vira uma
 * frase genérica: o detalhe fica no log do servidor, nunca na linha da mensagem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import type { ChannelAdapter, RecipientInput } from "../types";
import { acharCaixaPorEndereco } from "./caixa";
import { emailCanalLigado } from "./chave";
import { enviarEmailDaCaixa, FalhaDeEnvio, type DependenciasDoEnvio } from "./envio";
import { avisarTetoAtingido, decidirAdmissao, fusoDaOrganizacao } from "./limite";

export const EMAIL_NAO_CONFIGURADO = "email_not_configured";

/** Forma mínima de endereço: algo@dominio.tld, sem espaços. A validação real é do servidor de e-mail. */
const FORMA_DE_ENDERECO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FRASE_GENERICA = "Não foi possível enviar o e-mail agora. Tente de novo em instantes.";
/** Quando a consulta do limite falha: adia um pouco, nunca arrisca a conta do cliente. */
const ESPERA_SE_LIMITE_INDISPONIVEL_MS = 60_000;

export interface DependenciasDoAdaptador {
  admin?: () => SupabaseClient;
  canalLigado?: () => boolean;
  envio?: DependenciasDoEnvio;
}

export function criarEmailAdapter(deps: DependenciasDoAdaptador = {}): ChannelAdapter {
  const admin = deps.admin ?? (() => createAdminClient());
  const ligado = deps.canalLigado ?? (() => emailCanalLigado());

  return {
    provider: "email",

    resolveRecipient(input: RecipientInput): string | null {
      if (input.isGroup) return null;
      const endereco = (input.email ?? "").trim().toLowerCase();
      return FORMA_DE_ENDERECO.test(endereco) ? endereco : null;
    },

    // EMAIL_CANAL=desligado: o handler trata como canal não configurado e deixa a mensagem na fila.
    isConfigured(): boolean {
      return ligado();
    },

    async send(envelope): Promise<{ externalId: string | null }> {
      // O erro da conferência de autoridade (`beforeSend`) é do handler: passa intacto.
      let erroDeAutoridade: unknown;
      const antesDeEnviar = envelope.beforeSend
        ? async () => {
            try {
              await envelope.beforeSend!();
            } catch (erro) {
              erroDeAutoridade = erro;
              throw erro;
            }
          }
        : undefined;
      try {
        const r = await enviarEmailDaCaixa(
          admin(),
          {
            organizationId: envelope.organizationId,
            sessionRef: envelope.sessionRef,
            para: envelope.to,
            conversationId: envelope.conversationId,
            corpo: envelope.body ?? envelope.media?.caption ?? "",
            assunto: envelope.assunto,
            inReplyTo: envelope.inReplyTo,
            references: envelope.references,
            anexos: envelope.anexos,
            media: envelope.media
              ? { url: envelope.media.url, mime: envelope.media.mime, filename: envelope.media.filename ?? undefined }
              : undefined,
            antesDeEnviar,
          },
          deps.envio,
        );
        return { externalId: r.externalId };
      } catch (erro) {
        if (erro instanceof FalhaDeEnvio) throw erro;
        if (erroDeAutoridade !== undefined && erro === erroDeAutoridade) throw erro;
        logger.warn("[email.adapter] envio interrompido", {
          organizationId: envelope.organizationId,
          erro: erro instanceof Error ? erro.name : "desconhecido",
        });
        throw new Error(FRASE_GENERICA);
      }
    },

    async admitir({ organizationId, sessionRef, agora }) {
      try {
        const cliente = admin();
        const caixa = await acharCaixaPorEndereco(cliente, organizationId, sessionRef);
        // Sem caixa ativa não há o que limitar: o envio falha com a causa certa.
        if (!caixa || caixa.archivedAt) return { ok: true };
        const fuso = await fusoDaOrganizacao(cliente, organizationId);
        const r = await decidirAdmissao(cliente, {
          organizationId,
          caixaId: caixa.id,
          tetoDiario: caixa.config.teto_diario,
          intervaloSegundos: caixa.config.intervalo_segundos,
          fuso,
          agora,
        });
        if (!r.ok && r.motivo === "teto_diario") {
          await avisarTetoAtingido(cliente, { organizationId, caixaId: caixa.id, endereco: caixa.endereco });
        }
        return r;
      } catch {
        logger.warn("[email.adapter] não deu para consultar o limite; adiando", { organizationId });
        return { ok: false, adiarAte: new Date(agora.getTime() + ESPERA_SE_LIMITE_INDISPONIVEL_MS), motivo: "intervalo" };
      }
    },

    // Mínimo: o estado da caixa é lido pela rodada (pausa, falhas seguidas). `reachable: false`
    // quer dizer "não deu para perguntar" e NÃO sobrescreve o status da sessão.
    async checkHealth() {
      return { reachable: false, status: null, detail: "A verificação da caixa de e-mail é feita pela rodada de leitura." };
    },

    codes: {
      notConfigured: EMAIL_NAO_CONFIGURADO,
      sendFailed: "email_error",
      unknownError: "email_unknown",
    },
  };
}

export const emailAdapter: ChannelAdapter = criarEmailAdapter();
