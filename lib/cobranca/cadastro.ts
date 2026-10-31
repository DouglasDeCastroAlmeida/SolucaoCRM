/**
 * Os planos que o cadastro público enxerga, e a regra de quando ele exige um.
 *
 * É o espelho, no servidor, de `fn_trial_na_criacao_da_org` (migration 0679):
 * sem plano escolhido, a empresa nasce no plano padrão; sem padrão, o gatilho
 * recusa com `plano_obrigatorio` — EXCETO quando o revendedor não tem plano
 * NENHUM (nem padrão, nem oferecido): aí a empresa nasce isenta, como antes da
 * 0679 (decisão do dono, doc 146, opção B). Os dois lados têm de usar o mesmo
 * critério: se a tela deixasse passar o que o gatilho recusa, a conta nasceria
 * no GoTrue sem organização.
 *
 * Mudança 003 (migration 0725): o gatilho ganhou um ramo para a MARCA que cobra
 * (`brands.cobranca_ligada` E o módulo da instalação ligados). Ali os planos são
 * os da própria marca (`cobranca_planos.brand_id`), a empresa nasce suspensa à
 * espera do cartão e a marca sem plano nenhum recusa com `cobranca_marca_sem_plano`
 * em vez de nascer isenta. Fora desse ramo vale o de antes, e só enxerga plano
 * da instalação (`brand_id` nulo). Nunca se misturam.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { moduloLigado } from "@/lib/instalacao/modulos";

export interface PlanoDoCadastro {
  id: string;
  nome: string;
  preco_cents: number;
  intervalo: string;
  trial_dias: number;
}

export interface PlanosDoCadastro {
  padraoId: string | null;
  oferecidos: PlanoDoCadastro[];
}

/**
 * `null` quando a leitura falhou: quem decide uma AÇÃO trata como recusa.
 *
 * `brandId` é a marca que COBRA (vem de `lerEscopoDoCadastro`): lê os planos
 * dela e só deles. Ausente, lê os da instalação (`brand_id` nulo) e só eles.
 */
export async function lerPlanosDoCadastro(admin: SupabaseClient, brandId: string | null = null): Promise<PlanosDoCadastro | null> {
  const doEscopo = admin
    .from("cobranca_planos")
    .select("id, nome, preco_cents, intervalo, trial_dias")
    .is("arquivado_em", null)
    .eq("oferecido_ao_cliente", true);
  const padrao = admin.from("cobranca_planos").select("id").is("arquivado_em", null).eq("padrao_no_cadastro", true);
  const [oferecidos, padraoLido] = await Promise.all([
    (brandId ? doEscopo.eq("brand_id", brandId) : doEscopo.is("brand_id", null)).order("preco_cents"),
    (brandId ? padrao.eq("brand_id", brandId) : padrao.is("brand_id", null)).maybeSingle(),
  ]);
  if (oferecidos.error || padraoLido.error) return null;
  return {
    padraoId: padraoLido.data?.id ?? null,
    oferecidos: oferecidos.data ?? [],
  };
}

/** Quem cobra neste cadastro: a marca (com o id dela) ou a instalação (`brandId` nulo). */
export interface EscopoDoCadastro {
  cobra: boolean;
  brandId: string | null;
}

/**
 * Espelho de `fn_cobranca_da_marca_ligada` (0725): a marca cobra quando a chave
 * dela E o módulo da instalação estão ligados. `brandId` nulo = a marca padrão do
 * banco (as organizações de hoje apontam para ela). Marca inexistente não cobra.
 * `null` = a leitura falhou.
 */
export async function lerEscopoDoCadastro(admin: SupabaseClient, brandId: string | null): Promise<EscopoDoCadastro | null> {
  const consulta = admin.from("brands").select("id, cobranca_ligada");
  const { data, error } = await (brandId ? consulta.eq("id", brandId) : consulta.eq("is_default", true)).maybeSingle();
  if (error) return null;
  const marca = data as { id: string; cobranca_ligada?: boolean } | null;
  const nao: EscopoDoCadastro = { cobra: false, brandId: null };
  if (!marca?.cobranca_ligada) return nao;
  if (!(await moduloLigado(admin, "cobranca"))) return nao;
  return { cobra: true, brandId: marca.id };
}

/** Cadastro SEM plano escolhido é recusado? O mesmo critério do gatilho. */
export function cadastroExigeEscolhaDePlano(planos: PlanosDoCadastro, marcaCobra = false): boolean {
  return planos.padraoId === null && (planos.oferecidos.length > 0 || marcaCobra);
}

export type DecisaoDoPlano =
  | { tipo: "plano"; id: string }
  | { tipo: "isento" }
  | { tipo: "erro"; erro: "plano_obrigatorio" | "cobranca_marca_sem_plano" };

/**
 * O espelho de `fn_trial_na_criacao_da_org` para o plano da empresa nova: a
 * escolha vale se está entre os oferecidos do escopo; senão cai no padrão do
 * escopo (plano de OUTRA marca nunca está entre os oferecidos); sem padrão e com
 * plano oferecido, recusa; sem plano nenhum a instalação segue isenta e a marca
 * que cobra recusa com `cobranca_marca_sem_plano`.
 */
export function decidirPlanoDoCadastro(planos: PlanosDoCadastro, escolhidoId: string | null | undefined, marcaCobra: boolean): DecisaoDoPlano {
  if (escolhidoId && planos.oferecidos.some((p) => p.id === escolhidoId)) return { tipo: "plano", id: escolhidoId };
  if (planos.padraoId) return { tipo: "plano", id: planos.padraoId };
  if (planos.oferecidos.length > 0) return { tipo: "erro", erro: "plano_obrigatorio" };
  return marcaCobra ? { tipo: "erro", erro: "cobranca_marca_sem_plano" } : { tipo: "isento" };
}

/**
 * O plano que o provisionamento repassa ao gatilho para uma marca REAL. `null`
 * quando a marca não cobra (ou a leitura falhou): aí nada muda e o gatilho do
 * banco segue como autoridade.
 */
export async function decidirPlanoDaMarca(
  admin: SupabaseClient,
  brandId: string,
  escolhidoId: string | null | undefined,
): Promise<DecisaoDoPlano | null> {
  const escopo = await lerEscopoDoCadastro(admin, brandId);
  if (!escopo?.cobra) return null;
  const planos = await lerPlanosDoCadastro(admin, escopo.brandId);
  if (!planos) return null;
  return decidirPlanoDoCadastro(planos, escolhidoId, true);
}

export interface CadastroNaTela {
  oferecidos: PlanoDoCadastro[];
  padraoId: string | null;
  /** O cadastro sem escolha seria recusado: o Google some e o seletor é obrigatório. */
  exigeEscolha: boolean;
}

/**
 * O que as telas de cadastro (`/signup`, `/get-started`) mostram. Cobrança
 * desligada, ou leitura que falha: nada — a tela não esconde nem exige coisa
 * alguma, e quem recusa é a action (e, por baixo dela, o gatilho).
 */
export async function lerCadastroNaTela(admin: SupabaseClient, brandId: string | null = null): Promise<CadastroNaTela> {
  const nada: CadastroNaTela = { oferecidos: [], padraoId: null, exigeEscolha: false };
  if (!(await moduloLigado(admin, "cobranca"))) return nada;
  const escopo = await lerEscopoDoCadastro(admin, brandId);
  if (!escopo) return nada;
  const lidos = await lerPlanosDoCadastro(admin, escopo.brandId);
  if (!lidos) return nada;
  return { ...lidos, exigeEscolha: cadastroExigeEscolhaDePlano(lidos, escopo.cobra) };
}

/** O plano que o seletor já traz marcado: o padrão, quando ele está entre os oferecidos. */
export function planoInicialDoSeletor(oferecidos: readonly PlanoDoCadastro[], padraoId: string | null): string | undefined {
  return oferecidos.find((p) => p.id === padraoId)?.id ?? oferecidos[0]?.id;
}
