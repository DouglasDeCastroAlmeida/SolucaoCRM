/**
 * Repositório dos servidores MCP externos de uma organização (mudança SDD 006,
 * Fatia 7; tabela `mcp_servidores_externos`, migration 0724).
 *
 * ── O que decide aqui ───────────────────────────────────────────────────────
 *
 * - Cadastrar: valida o destino com o núcleo `lib/net/destino-seguro.ts`
 *   (https, nada de IP interno), TESTA a conexão listando as ferramentas e só
 *   então grava. A chave é cifrada pelo mesmo caminho do servidor legado
 *   (`segredo.ts`) e o que sai daqui é no máximo o final dela (`chave_last4`).
 * - Todas as ferramentas nascem DESLIGADAS. "Ligada" não é uma coluna: é a
 *   presença do id da ferramenta em `tool_ids` do agente. O agente só vê as
 *   ligadas, de qualquer servidor (`resolverFerramentasDoAgente`).
 * - A lista de ferramentas é guardada na linha e vale 10 minutos
 *   (`VALIDADE_DAS_FERRAMENTAS_MS`). A linha MIGRADA da 0724 nasce com
 *   `ferramentas = []` e `ferramentas_em = null`, então o primeiro uso a
 *   resolve (AC-007.9) sem ação do admin.
 *
 * ── Multi-tenant ────────────────────────────────────────────────────────────
 *
 * Quem chama usa service role: TODA consulta filtra `organization_id`, que vem
 * da sessão/token/run e nunca do corpo do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { resolverDestinoSeguro } from "@/lib/net/destino-seguro";

import { listarFerramentasDoServidor, type FerramentaRemota } from "./chamada";
import {
  ehSlugDeServidor,
  escolhasRemotas,
  nomeExpostoDaEscolha,
  servidorDaEscolha,
  type EscolhaRemota,
} from "./ids";
import { conferirEndpointSeguro, hostDoEndpoint, type ServidorMcpExterno } from "./registro";
import { abrirChaveMcpExterno, cifrarChaveMcpExterno } from "./segredo";

const TABELA = "mcp_servidores_externos";

const COLUNAS =
  "id, organization_id, slug, nome, endpoint, chave_encrypted, chave_iv, chave_tag, chave_last4, ferramentas, ferramentas_em, ativo, created_at";

/** Quanto tempo a lista guardada vale antes de ser refeita. */
export const VALIDADE_DAS_FERRAMENTAS_MS = 10 * 60 * 1000;

/** Códigos canônicos de erro (design: Contratos e interfaces). */
export type CodigoDeErroDeServidor =
  | "ai_destino_proibido"
  | "ai_http_nao_permitido"
  | "mcp_servidor_invalido";

/** Erro com mensagem segura para a tela: nunca carrega a chave. */
export class ErroDeServidorMcp extends Error {
  constructor(
    readonly codigo: CodigoDeErroDeServidor,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeServidorMcp";
  }
}

/** A linha como o banco a devolve, com as colunas cifradas. Não sai do servidor. */
export interface LinhaDeServidor {
  id: string;
  organization_id: string;
  slug: string;
  nome: string;
  endpoint: string;
  chave_encrypted: string | null;
  chave_iv: string | null;
  chave_tag: string | null;
  chave_last4: string | null;
  ferramentas: unknown;
  ferramentas_em: string | null;
  ativo: boolean;
  created_at: string;
}

/** O que a API e a tela podem ver: nada de chave além do final. */
export interface ServidorPublico {
  id: string;
  slug: string;
  nome: string;
  host: string;
  chave_last4: string | null;
  ativo: boolean;
  ferramentas_em: string | null;
  ferramentas: Array<{ nome: string; descricao?: string; somente_leitura: boolean; ligada: false }>;
}

/** Servidor pronto para chamar: chave aberta, só em memória. */
export interface ServidorResolvido extends ServidorMcpExterno {
  slug: string;
  id: string;
  nome: string;
}

/** Uma ferramenta ligada para o agente, de qualquer servidor. */
export interface FerramentaDoAgente {
  servidor: ServidorResolvido;
  ferramenta: FerramentaRemota;
  escolha: EscolhaRemota;
  /** `<servidor>__<nome>` no formato novo; o nome cru no antigo. */
  nomeExposto: string;
}

export interface DepsDoRepositorio {
  /** DNS do destino seguro. Default: DNS do sistema. */
  resolver?: (host: string) => Promise<string[]>;
  /** Lista as ferramentas do servidor (a rede). Default: cliente MCP com destino seguro. */
  listar?: (servidor: ServidorMcpExterno) => Promise<FerramentaRemota[]>;
  agora?: () => number;
  /** Linhas já lidas (evita segunda consulta quando quem chama já as tem). */
  linhas?: readonly LinhaDeServidor[];
}

export interface EntradaDeServidor {
  slug: string;
  nome: string;
  endpoint: string;
  chave: string;
}

function ferramentasGuardadas(bruto: unknown): FerramentaRemota[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter(
    (f): f is FerramentaRemota =>
      typeof f === "object" && f !== null && typeof (f as { name?: unknown }).name === "string",
  );
}

function abrirChaveDaLinha(linha: LinhaDeServidor): string | null {
  return abrirChaveMcpExterno({
    mcp_externo_chave_encrypted: linha.chave_encrypted ?? undefined,
    mcp_externo_chave_iv: linha.chave_iv ?? undefined,
    mcp_externo_chave_tag: linha.chave_tag ?? undefined,
  });
}

export function paraPublico(linha: LinhaDeServidor): ServidorPublico {
  return {
    id: linha.id,
    slug: linha.slug,
    nome: linha.nome,
    host: hostDoEndpoint(linha.endpoint),
    chave_last4: linha.chave_last4,
    ativo: linha.ativo,
    ferramentas_em: linha.ferramentas_em,
    ferramentas: ferramentasGuardadas(linha.ferramentas).map((f) => ({
      nome: f.name,
      ...(f.description !== undefined ? { descricao: f.description } : {}),
      somente_leitura: f.somenteLeitura === true,
      ligada: false as const,
    })),
  };
}

/** Todos os servidores da organização (ativos ou não), mais antigos primeiro. */
export async function listarServidores(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<LinhaDeServidor[]> {
  const { data, error } = await supabase
    .from(TABELA)
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) {
    logger.warn("nao foi possivel listar os servidores MCP externos", {
      organization_id: organizationId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as unknown as LinhaDeServidor[];
}

export async function listarServidoresPublicos(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ServidorPublico[]> {
  return (await listarServidores(supabase, organizationId)).map(paraPublico);
}

function listarPadrao(servidor: ServidorMcpExterno): Promise<FerramentaRemota[]> {
  return listarFerramentasDoServidor(servidor);
}

/**
 * Cadastra um servidor: destino seguro, teste de conexão, lista de ferramentas
 * (todas desligadas) e gravação cifrada. Lança `ErroDeServidorMcp`.
 */
export async function cadastrarServidor(
  supabase: SupabaseClient,
  organizationId: string,
  entrada: EntradaDeServidor,
  deps: DepsDoRepositorio = {},
): Promise<ServidorPublico> {
  const slug = entrada.slug.trim();
  const nome = entrada.nome.trim();
  const endpoint = entrada.endpoint.trim();
  const chave = entrada.chave.trim();
  if (!ehSlugDeServidor(slug) || nome === "" || nome.length > 80 || chave === "") {
    throw new ErroDeServidorMcp("mcp_servidor_invalido", "Informe um identificador, um nome e uma chave válidos.");
  }

  // O destino primeiro: http e IP interno morrem aqui, antes de qualquer rede.
  const destino = await resolverDestinoSeguro(endpoint, deps.resolver ? { resolver: deps.resolver } : {});
  if (!destino.ok) {
    if (destino.motivo === "http") {
      throw new ErroDeServidorMcp("ai_http_nao_permitido", "O endereço do servidor precisa ser https.");
    }
    throw new ErroDeServidorMcp(
      "ai_destino_proibido",
      "Esse endereço não é um destino permitido. Use o endereço público do servidor.",
    );
  }
  try {
    // Sem usuário, senha, query ou fragmento no endereço (o segredo vai na chave).
    conferirEndpointSeguro(endpoint);
  } catch {
    throw new ErroDeServidorMcp("mcp_servidor_invalido", "Endereço inválido: não use usuário, senha nem parâmetros na URL.");
  }

  let ferramentas: FerramentaRemota[];
  try {
    ferramentas = await (deps.listar ?? listarPadrao)({ endpoint, chave });
  } catch (err) {
    logger.warn("teste de conexao do servidor MCP externo falhou", {
      organization_id: organizationId,
      endpoint: hostDoEndpoint(endpoint),
      error: err instanceof Error ? err.message.replaceAll(chave, "[chave]") : "erro",
    });
    throw new ErroDeServidorMcp(
      "mcp_servidor_invalido",
      "Não foi possível conectar ao servidor com essa chave. Confira o endereço e a chave.",
    );
  }

  const cifrada = cifrarChaveMcpExterno(chave);
  const agora = (deps.agora ?? Date.now)();
  const { data, error } = await supabase
    .from(TABELA)
    .insert({
      organization_id: organizationId,
      slug,
      nome,
      endpoint,
      chave_encrypted: cifrada.mcp_externo_chave_encrypted,
      chave_iv: cifrada.mcp_externo_chave_iv,
      chave_tag: cifrada.mcp_externo_chave_tag,
      chave_last4: cifrada.mcp_externo_chave_last4,
      ferramentas,
      ferramentas_em: new Date(agora).toISOString(),
    })
    .select(COLUNAS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      throw new ErroDeServidorMcp("mcp_servidor_invalido", "Já existe um servidor com esse identificador.");
    }
    logger.warn("nao foi possivel gravar o servidor MCP externo", {
      organization_id: organizationId,
      error: error?.message ?? "sem linha",
    });
    throw new ErroDeServidorMcp("mcp_servidor_invalido", "Não foi possível salvar o servidor agora.");
  }
  return paraPublico(data as unknown as LinhaDeServidor);
}

/**
 * As ferramentas do servidor: a lista guardada se tem menos de 10 minutos; senão
 * refaz pela rede e regrava. Servidor fora do ar devolve a lista guardada (pode
 * ser vazia) em vez de lançar — o turno segue sem travar.
 */
export async function obterFerramentasDoServidor(
  supabase: SupabaseClient,
  organizationId: string,
  linha: LinhaDeServidor,
  deps: DepsDoRepositorio = {},
): Promise<FerramentaRemota[]> {
  const guardadas = ferramentasGuardadas(linha.ferramentas);
  const agora = (deps.agora ?? Date.now)();
  const em = linha.ferramentas_em ? Date.parse(linha.ferramentas_em) : Number.NaN;
  if (Number.isFinite(em) && agora - em < VALIDADE_DAS_FERRAMENTAS_MS) return guardadas;

  const chave = abrirChaveDaLinha(linha);
  if (chave === null) return guardadas;
  try {
    const novas = await (deps.listar ?? listarPadrao)({ endpoint: linha.endpoint, chave });
    const { error } = await supabase
      .from(TABELA)
      .update({ ferramentas: novas, ferramentas_em: new Date(agora).toISOString() })
      .eq("id", linha.id)
      .eq("organization_id", organizationId);
    if (error) {
      logger.warn("nao foi possivel guardar a lista de ferramentas do servidor MCP", {
        organization_id: organizationId,
        servidor: linha.slug,
        error: error.message,
      });
    }
    return novas;
  } catch (err) {
    logger.warn("servidor MCP externo nao respondeu ao listar — usando a lista guardada", {
      organization_id: organizationId,
      servidor: linha.slug,
      endpoint: hostDoEndpoint(linha.endpoint),
      error: err instanceof Error ? err.message.replaceAll(chave, "[chave]") : "erro",
    });
    return guardadas;
  }
}

/**
 * O que o agente enxerga: só as ferramentas LIGADAS (presentes em `toolIds`), de
 * qualquer servidor ativo da organização. O id antigo aponta para o servidor
 * `padrao` migrado, cuja lista é resolvida no primeiro uso. Sem escolha remota,
 * nem banco nem rede.
 */
export async function resolverFerramentasDoAgente(
  supabase: SupabaseClient,
  organizationId: string,
  toolIds: readonly string[],
  deps: DepsDoRepositorio = {},
): Promise<FerramentaDoAgente[]> {
  const escolhas = escolhasRemotas(toolIds);
  if (escolhas.length === 0) return [];

  const porSlug = new Map(
    (deps.linhas ?? (await listarServidores(supabase, organizationId)))
      .filter((l) => l.ativo)
      .map((l) => [l.slug, l] as const),
  );
  const listas = new Map<string, Promise<FerramentaRemota[]>>();
  const resolvidos: FerramentaDoAgente[] = [];

  for (const escolha of escolhas) {
    const linha = porSlug.get(servidorDaEscolha(escolha));
    if (!linha) continue;
    if (!listas.has(linha.slug)) {
      listas.set(linha.slug, obterFerramentasDoServidor(supabase, organizationId, linha, deps));
    }
    const ferramenta = (await listas.get(linha.slug))!.find((f) => f.name === escolha.nome);
    if (!ferramenta) continue;
    const chave = abrirChaveDaLinha(linha);
    if (chave === null) continue;
    resolvidos.push({
      servidor: { id: linha.id, slug: linha.slug, nome: linha.nome, endpoint: linha.endpoint, chave },
      ferramenta,
      escolha,
      nomeExposto: nomeExpostoDaEscolha(escolha),
    });
  }
  return resolvidos;
}

/**
 * Um servidor ATIVO da organização, com a chave aberta (só em memória), pelo id.
 * `null` quando não existe, é de outra organização, está desativado ou a chave
 * não abre. Usado para executar uma ação aprovada: o servidor é o da AÇÃO, e a
 * organização é a da sessão de quem aprova.
 */
export async function obterServidorResolvido(
  supabase: SupabaseClient,
  organizationId: string,
  servidorId: string,
): Promise<ServidorResolvido | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("id", servidorId)
    .maybeSingle();
  if (error || !data) return null;
  const linha = data as unknown as LinhaDeServidor;
  if (!linha.ativo) return null;
  const chave = abrirChaveDaLinha(linha);
  if (chave === null) return null;
  return { id: linha.id, slug: linha.slug, nome: linha.nome, endpoint: linha.endpoint, chave };
}
