/**
 * Pedaços compartilhados pelas rotas da caixa de e-mail (mudança 005): a resposta de
 * falha da conexão e a barreira de tentativas.
 */
import type { NextResponse } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";

import type { ResultadoDaVerificacao } from "./conexao";

type Falha = Extract<ResultadoDaVerificacao, { ok: false }>;

const CAUSAS_DE_DESTINO = new Set(["destino_proibido", "porta_nao_permitida", "servidor_invalido"]);

/** 422 com a causa em português (já traduzida por quem chama) e a classificação em `details`. */
export function respostaDaFalhaDeConexao(
  falha: Falha,
  traduzir: (texto: string) => string,
  requestId: string,
): NextResponse {
  return fail(
    CAUSAS_DE_DESTINO.has(falha.causa) ? "email_destino_proibido" : "email_conexao_recusada",
    traduzir(falha.mensagem),
    422,
    { requestId, details: { causa: falha.causa, etapa: falha.etapa } },
  );
}

/**
 * Cada teste ou conexão faz login no servidor de e-mail de alguém. Sem teto, a rota seria um
 * jeito de martelar senhas e de bloquear a conta do cliente. 10 por minuto por organização.
 */
export async function tentativasEsgotadas(
  organizationId: string,
  requestId: string,
  traduzirTexto: (texto: string) => string,
): Promise<NextResponse | null> {
  const limite = await checkRateLimit(`email-conexao:${organizationId}`, 10, 60);
  if (limite.allowed) return null;
  return fail("rate_limited", traduzirTexto("Aguarde um minuto antes de tentar de novo."), 429, {
    requestId,
    headers: { "Retry-After": "60" },
  });
}

/** Tira o segredo de um texto antes de ele ir para o log. */
export function semSegredo(texto: string, segredo: string): string {
  return segredo ? texto.split(segredo).join("[redigido]") : texto;
}
