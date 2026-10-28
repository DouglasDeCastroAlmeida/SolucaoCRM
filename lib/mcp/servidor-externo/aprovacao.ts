/**
 * Aprovação das ações de ESCRITA de um servidor MCP externo (mudança SDD 006,
 * Fatia 7; AC-007.3 e AC-007.4; ADR-005).
 *
 * ── A regra ─────────────────────────────────────────────────────────────────
 *
 * - LEITURA roda sempre (a ferramenta sai com `category: "read"` só quando o
 *   servidor anuncia `readOnlyHint` E o admin marcou leitura — `externo.ts`).
 * - ESCRITA (ou sem o aviso de leitura) no modo `assisted` NÃO executa: vira
 *   uma linha em `mcp_acoes_pendentes` e um item na Central. Quem aprova é uma
 *   pessoa, pela rota `/api/v1/mcp-acoes/[id]`.
 * - ESCRITA no `automatic` só roda sem aprovação se o admin marcou a
 *   ferramenta como "pode rodar sem aprovação"; sem a marca, pede aprovação.
 * - Modo desconhecido vale como `assisted`: na dúvida, uma pessoa decide.
 *
 * ── Os argumentos ───────────────────────────────────────────────────────────
 *
 * Guardados na linha e lidos SÓ por aqui, com service role e filtrando
 * `organization_id` (o papel `authenticated` não tem GRANT na coluna
 * `argumentos`: pode carregar dado do cliente). Aprovar executa com o que foi
 * GUARDADO — o corpo do pedido de aprovação não traz argumento nenhum, então
 * ninguém troca o que será feito no momento de aprovar. O texto da Central
 * nunca leva os argumentos.
 *
 * ── Uma única vez ───────────────────────────────────────────────────────────
 *
 * A decisão é uma troca atômica `pendente → aprovada|recusada` (UPDATE com
 * `estado = 'pendente'` no filtro): quem perde a corrida recebe `ja_decidida`
 * e não executa. `aprovada` é o estado de "executando"; termina em `executada`
 * ou `falhou`. Falha não se repete sozinha: uma nova tentativa exige uma nova
 * ação pendente (envio em dobro é pior que não-envio).
 */
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { chamarFerramentaRemota, type ResultadoRemoto } from "./chamada";
import type { ServidorMcpExterno } from "./registro";
import { obterServidorResolvido } from "./repositorio";
import {
  resumirArgumentosParaAuditoria,
  resumirResultadoParaAuditoria,
} from "./resultado-como-dado";

const TABELA = "mcp_acoes_pendentes";
const CENTRAL = "agent_inbox_items";
const KIND_DA_CENTRAL = "acao_mcp_pendente";

export type ModoDoAgente = "assisted" | "automatic";
export type ComoExecutar = "executar" | "pedir_aprovacao";

export function decidirComoExecutar(entrada: {
  ehLeitura: boolean;
  modo: ModoDoAgente | undefined;
  liberadaSemAprovacao: boolean;
}): ComoExecutar {
  if (entrada.ehLeitura) return "executar";
  if (entrada.modo === "automatic" && entrada.liberadaSemAprovacao) return "executar";
  return "pedir_aprovacao";
}

function ordenado(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenado);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, ordenado(v)]),
    );
  }
  return valor;
}

/** Hash estável dos argumentos (a ordem das chaves não conta). */
export function hashDosArgumentos(argumentos: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(ordenado(argumentos)) ?? "{}")
    .digest("hex");
}

/** O texto do item da Central: português simples, sem argumentos e sem código interno. */
export function textoDaAcaoPendente(servidorNome: string, ferramenta: string): { titulo: string; corpo: string } {
  return {
    titulo: "Uma ação em um sistema externo espera a sua aprovação",
    corpo:
      `O assistente quer usar "${ferramenta}" no sistema "${servidorNome}" e só vai fazer isso se uma pessoa aprovar. ` +
      "Confira o que será feito e aprove ou recuse.",
  };
}

export interface DadosDaAcao {
  agenteId?: string | null;
  conversaId?: string | null;
  servidorId: string;
  servidorNome: string;
  ferramenta: string;
  argumentos: Record<string, unknown>;
}

/**
 * Grava a ação pendente e abre o item da Central. Repetir o mesmo pedido na
 * mesma conversa devolve a pendência que já existe (`nova: false`), sem
 * segundo item. `null` quando não foi possível gravar — quem chama NÃO executa.
 */
export async function registrarAcaoPendente(
  supabase: SupabaseClient,
  organizationId: string,
  dados: DadosDaAcao,
): Promise<{ id: string; nova: boolean } | null> {
  const hash = hashDosArgumentos(dados.argumentos);
  const { data, error } = await supabase
    .from(TABELA)
    .insert({
      organization_id: organizationId,
      agente_id: dados.agenteId ?? null,
      conversa_id: dados.conversaId ?? null,
      servidor_id: dados.servidorId,
      ferramenta: dados.ferramenta,
      argumentos: dados.argumentos,
      argumentos_hash: hash,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: existente } = await supabase
      .from(TABELA)
      .select("id")
      .eq("organization_id", organizationId)
      .eq("conversa_id", dados.conversaId ?? "")
      .eq("ferramenta", dados.ferramenta)
      .eq("argumentos_hash", hash)
      .eq("estado", "pendente")
      .maybeSingle();
    const id = (existente as { id?: string } | null)?.id;
    return id ? { id, nova: false } : null;
  }
  const id = (data as { id?: string } | null)?.id;
  if (error || !id) {
    logger.warn("nao foi possivel gravar a acao pendente do servidor MCP externo", {
      organization_id: organizationId,
      error: error?.message ?? "sem linha",
    });
    return null;
  }

  const { titulo, corpo } = textoDaAcaoPendente(dados.servidorNome, dados.ferramenta);
  const { error: erroDoItem } = await supabase.from(CENTRAL).insert({
    organization_id: organizationId,
    kind: KIND_DA_CENTRAL,
    severity: "warn",
    title: titulo,
    body: corpo,
    ref_kind: dados.conversaId ? "conversation" : null,
    ref_id: dados.conversaId ?? null,
  });
  if (erroDoItem) {
    // A ação continua pendente e visível pela API; o aviso é informação.
    logger.warn("item da Central da acao pendente nao foi aberto", {
      organization_id: organizationId,
      error: erroDoItem.message,
    });
  }
  return { id, nova: true };
}

export type ResultadoDaDecisao =
  | { tipo: "nao_encontrada" }
  | { tipo: "ja_decidida"; estado: string }
  | { tipo: "recusada"; servidor: string | null; ferramenta: string }
  | {
      tipo: "executada";
      servidor: string;
      ferramenta: string;
      resumo: {
        servidor: string;
        ferramenta: string;
        argumentos: Record<string, unknown>;
        resultado: string;
      };
    }
  | { tipo: "falhou"; servidor: string | null; ferramenta: string; motivo: string };

export interface DepsDaDecisao {
  chamar?: (
    servidor: ServidorMcpExterno,
    nome: string,
    argumentos: Record<string, unknown>,
  ) => Promise<ResultadoRemoto>;
  agora?: () => number;
}

interface LinhaDaAcao {
  id: string;
  conversa_id: string | null;
  servidor_id: string;
  ferramenta: string;
  argumentos: unknown;
}

/** Fecha o item da Central quando não sobra outra ação pendente da mesma conversa. */
async function fecharItemDaCentral(
  supabase: SupabaseClient,
  organizationId: string,
  conversaId: string | null,
): Promise<void> {
  let restantes = supabase
    .from(TABELA)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("estado", "pendente");
  restantes = conversaId ? restantes.eq("conversa_id", conversaId) : restantes.is("conversa_id", null);
  const { data } = await restantes;
  if (Array.isArray(data) && data.length > 0) return;

  let itens = supabase
    .from(CENTRAL)
    .update({ status: "resolved" })
    .eq("organization_id", organizationId)
    .eq("kind", KIND_DA_CENTRAL)
    .in("status", ["open", "ack"]);
  itens = conversaId ? itens.eq("ref_id", conversaId) : itens.is("ref_id", null);
  const { error } = await itens;
  if (error) {
    logger.warn("item da Central da acao pendente nao foi fechado", {
      organization_id: organizationId,
      error: error.message,
    });
  }
}

function semChave(texto: string, chave: string): string {
  return chave.length >= 4 ? texto.replaceAll(chave, "[chave]") : texto;
}

/**
 * Aprova ou recusa uma ação pendente da organização. A organização vem da
 * sessão (nunca do corpo); ação de outra organização é `nao_encontrada`.
 */
export async function decidirAcaoPendente(
  supabase: SupabaseClient,
  organizationId: string,
  pedido: { acaoId: string; decisao: "aprovar" | "recusar"; usuarioId: string },
  deps: DepsDaDecisao = {},
): Promise<ResultadoDaDecisao> {
  const agora = new Date((deps.agora ?? Date.now)()).toISOString();
  const { data: reclamada, error } = await supabase
    .from(TABELA)
    .update({
      estado: pedido.decisao === "aprovar" ? "aprovada" : "recusada",
      decidido_por: pedido.usuarioId,
      decidido_em: agora,
    })
    .eq("id", pedido.acaoId)
    .eq("organization_id", organizationId)
    .eq("estado", "pendente")
    .select("id, conversa_id, servidor_id, ferramenta, argumentos")
    .maybeSingle();

  if (error) {
    logger.warn("nao foi possivel decidir a acao pendente do servidor MCP externo", {
      organization_id: organizationId,
      error: error.message,
    });
    return { tipo: "nao_encontrada" };
  }
  if (!reclamada) {
    const { data: atual } = await supabase
      .from(TABELA)
      .select("estado")
      .eq("id", pedido.acaoId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const estado = (atual as { estado?: string } | null)?.estado;
    return estado ? { tipo: "ja_decidida", estado } : { tipo: "nao_encontrada" };
  }

  const acao = reclamada as unknown as LinhaDaAcao;
  const servidor = await obterServidorResolvido(supabase, organizationId, acao.servidor_id);

  if (pedido.decisao === "recusar") {
    await fecharItemDaCentral(supabase, organizationId, acao.conversa_id);
    return { tipo: "recusada", servidor: servidor?.slug ?? null, ferramenta: acao.ferramenta };
  }

  const terminar = async (estado: "executada" | "falhou") => {
    await supabase
      .from(TABELA)
      .update({ estado })
      .eq("id", acao.id)
      .eq("organization_id", organizationId)
      .eq("estado", "aprovada");
    await fecharItemDaCentral(supabase, organizationId, acao.conversa_id);
  };

  if (!servidor) {
    await terminar("falhou");
    return {
      tipo: "falhou",
      servidor: null,
      ferramenta: acao.ferramenta,
      motivo: "O sistema externo não está disponível. A ação não foi feita.",
    };
  }

  const argumentos =
    acao.argumentos !== null && typeof acao.argumentos === "object" && !Array.isArray(acao.argumentos)
      ? (acao.argumentos as Record<string, unknown>)
      : {};
  const chamar = deps.chamar ?? ((s, n, a) => chamarFerramentaRemota(s, n, a));
  try {
    const resultado = await chamar({ endpoint: servidor.endpoint, chave: servidor.chave }, acao.ferramenta, argumentos);
    await terminar("executada");
    return {
      tipo: "executada",
      servidor: servidor.slug,
      ferramenta: acao.ferramenta,
      resumo: {
        servidor: servidor.slug,
        ferramenta: acao.ferramenta,
        argumentos: resumirArgumentosParaAuditoria(argumentos, { chave: servidor.chave }),
        resultado: resumirResultadoParaAuditoria(resultado, { chave: servidor.chave }),
      },
    };
  } catch (err) {
    await terminar("falhou");
    const detalhe = semChave(err instanceof Error ? err.message : "erro", servidor.chave).slice(0, 200);
    logger.warn("acao aprovada do servidor MCP externo falhou", {
      organization_id: organizationId,
      servidor: servidor.slug,
      ferramenta: acao.ferramenta,
      error: detalhe,
    });
    return {
      tipo: "falhou",
      servidor: servidor.slug,
      ferramenta: acao.ferramenta,
      motivo: `O sistema externo não concluiu a ação: ${detalhe}`,
    };
  }
}
