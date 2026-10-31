/**
 * Cobrança por marca (mudança 003): a chave `brands.cobranca_ligada` e os
 * planos cobráveis da marca, que moram em `cobranca_planos.brand_id` (ADR-002).
 *
 * Marca é dado GLOBAL; como `admin-repo.ts`, usa o cliente admin SEM
 * `organization_id`, e só é chamado por rotas `/api/v1/admin/**` que já
 * passaram por `requirePlatformAdmin*`. O `brand_id` vem do PATH da rota, e todo
 * plano lido ou escrito aqui leva `.eq("brand_id", ...)`: plano de outra marca
 * (ou da instalação, `brand_id` nulo) responde "não encontrado".
 *
 * Desligar a chave NUNCA toca em `cobranca_assinaturas`: quem já assina segue
 * assinando (AC-001.4).
 */
import { chaveDoProvedor, provedorDaInstalacao } from "@/lib/cobranca/configuracao";
import { adaptador } from "@/lib/cobranca/provedores";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { COLUNAS_DO_PLANO } from "@/lib/schemas/cobranca-plano";
import { createAdminClient } from "@/lib/supabase/admin";

import { editarMarca, ErroDeMarca } from "./admin-repo";

type Linha = Record<string, unknown>;

/** O que falta para a marca poder cobrar. O código é estável; a tela traduz. */
export const FALTAS_PARA_LIGAR = [
  "modulo",
  "plano",
  "plano_padrao",
  "provedor",
  "chave",
  "provedor_sem_trial",
] as const;
export type Falta = (typeof FALTAS_PARA_LIGAR)[number];

export const MENSAGEM_DA_FALTA: Record<Falta, string> = {
  modulo: "A cobrança da instalação está desligada. Ligue-a em Sistema antes.",
  plano: "Cadastre ao menos um plano com preço para esta marca.",
  plano_padrao: "Marque um dos planos como o plano do cadastro.",
  provedor: "Escolha o provedor de pagamento em Cobrança, no painel da instalação.",
  chave: "Cole a chave do provedor de pagamento em Cobrança, no painel da instalação.",
  provedor_sem_trial: "O provedor de pagamento escolhido não faz teste com cartão. Use o Asaas.",
};

export interface EntradaDasFaltas {
  moduloLigado: boolean;
  planos: Array<{ preco_cents: number; padrao_no_cadastro: boolean }>;
  provedor: string | null;
  temChave: boolean;
  provedorFazTrialComCartao: boolean;
}

/** Regra pura: o que impede ligar a cobrança. Vazio = pode ligar. */
export function faltasParaLigar(e: EntradaDasFaltas): Falta[] {
  const faltas: Falta[] = [];
  if (!e.moduloLigado) faltas.push("modulo");
  const comPreco = e.planos.filter((p) => p.preco_cents > 0);
  if (comPreco.length === 0) faltas.push("plano");
  else if (!comPreco.some((p) => p.padrao_no_cadastro)) faltas.push("plano_padrao");
  if (e.provedor === null) faltas.push("provedor");
  else {
    if (!e.temChave) faltas.push("chave");
    if (!e.provedorFazTrialComCartao) faltas.push("provedor_sem_trial");
  }
  return faltas;
}

export interface SituacaoDaCobranca {
  cobranca_ligada: boolean;
  faltam: Falta[];
}

async function lerMarca(brandId: string): Promise<{ id: string; cobranca_ligada: boolean }> {
  const { data, error } = await createAdminClient()
    .from("brands")
    .select("id, cobranca_ligada")
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw new Error(`ler marca: ${error.code ?? "erro"} ${error.message}`);
  if (!data) throw new ErroDeMarca("not_found", "Marca não encontrada.", 404);
  return data as { id: string; cobranca_ligada: boolean };
}

export async function situacaoDaCobranca(brandId: string): Promise<SituacaoDaCobranca> {
  const admin = createAdminClient();
  const marca = await lerMarca(brandId);
  const { data: planos, error } = await admin
    .from("cobranca_planos")
    .select("preco_cents, padrao_no_cadastro")
    .eq("brand_id", brandId)
    .is("arquivado_em", null);
  if (error) throw new Error(`ler planos da marca: ${error.code ?? "erro"} ${error.message}`);

  const provedor = await provedorDaInstalacao();
  const temChave = provedor === null ? false : (await chaveDoProvedor(provedor)) !== null;
  const fazTrial =
    provedor !== null &&
    typeof (adaptador(provedor) as { iniciarTrialComCartao?: unknown }).iniciarTrialComCartao === "function";
  return {
    cobranca_ligada: Boolean(marca.cobranca_ligada),
    faltam: faltasParaLigar({
      moduloLigado: await moduloLigado(admin, "cobranca"),
      planos: (planos ?? []) as EntradaDasFaltas["planos"],
      provedor,
      temChave,
      provedorFazTrialComCartao: fazTrial,
    }),
  };
}

/**
 * Grava a chave. A rota já recusou o "ligar" que tem falta. Só mexe em
 * `brands` (via `editarMarca`, que também derruba o cache do host da marca).
 */
export async function definirCobranca(brandId: string, ligada: boolean): Promise<{ anterior: boolean }> {
  const marca = await lerMarca(brandId);
  const anterior = Boolean(marca.cobranca_ligada);
  if (anterior !== ligada) await editarMarca(brandId, { cobranca_ligada: ligada });
  return { anterior };
}

// ── planos cobráveis da marca ────────────────────────────────────────────────

export async function listarPlanosCobraveis(brandId: string): Promise<Linha[]> {
  await lerMarca(brandId);
  const { data, error } = await createAdminClient()
    .from("cobranca_planos")
    .select(COLUNAS_DO_PLANO)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listar planos cobráveis: ${error.code ?? "erro"} ${error.message}`);
  return (data ?? []) as Linha[];
}

export async function criarPlanoCobravel(brandId: string, campos: Linha, autorId: string): Promise<Linha> {
  await lerMarca(brandId);
  const { data, error } = await createAdminClient()
    .from("cobranca_planos")
    .insert({ ...campos, brand_id: brandId, updated_by: autorId })
    .select(COLUNAS_DO_PLANO)
    .single();
  if (error?.code === "23505") {
    throw new ErroDeMarca("state_conflict", "Esta marca já tem um plano do cadastro. Desmarque o outro antes.", 409);
  }
  if (error || !data) throw new Error(`criar plano cobrável: ${error?.code ?? "erro"} ${error?.message ?? ""}`);
  return data as Linha;
}

export async function editarPlanoCobravel(
  brandId: string,
  planoId: string,
  campos: Linha & { arquivado?: boolean },
  autorId: string,
): Promise<Linha> {
  const admin = createAdminClient();
  const { data: lido, error: e1 } = await admin
    .from("cobranca_planos")
    .select("id, preco_cents, intervalo, arquivado_em, padrao_no_cadastro")
    .eq("id", planoId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (e1) throw new Error(`ler plano cobrável: ${e1.code ?? "erro"} ${e1.message}`);
  if (!lido) throw new ErroDeMarca("not_found", "Plano não encontrado.", 404);
  const atual = lido as { preco_cents: number; intervalo: string; arquivado_em: string | null; padrao_no_cadastro: boolean };

  const { arquivado, ...resto } = campos;
  // Arquivar OU desmarcar o plano do cadastro de uma marca que COBRA deixaria todo cadastro
  // novo sem plano (cobranca_marca_sem_plano): a saída é marcar outro plano como o do
  // cadastro, ou desligar a cobrança, antes.
  const arquivando = arquivado === true && atual.arquivado_em === null;
  const desmarcando = resto.padrao_no_cadastro === false;
  if ((arquivando || desmarcando) && atual.padrao_no_cadastro && atual.arquivado_em === null) {
    const marca = await lerMarca(brandId);
    if (marca.cobranca_ligada) {
      throw new ErroDeMarca(
        "state_conflict",
        arquivando
          ? "Este é o plano do cadastro e a cobrança da marca está ligada. Marque outro plano como o do cadastro, ou desligue a cobrança, antes de arquivar."
          : "Este é o plano do cadastro e a cobrança da marca está ligada. Marque outro plano como o do cadastro, ou desligue a cobrança, antes de desmarcar este.",
        409,
      );
    }
  }
  const mudaACobranca =
    (resto.preco_cents !== undefined && resto.preco_cents !== Number(atual.preco_cents)) ||
    (resto.intervalo !== undefined && resto.intervalo !== atual.intervalo);
  if (mudaACobranca) {
    const { count, error } = await admin
      .from("cobranca_assinaturas")
      .select("organization_id", { count: "exact", head: true })
      .or(`plano_id.eq.${planoId},plano_agendado_id.eq.${planoId}`);
    if (error) throw new Error(`conferir assinantes: ${error.code ?? "erro"} ${error.message}`);
    if ((count ?? 0) > 0) {
      throw new ErroDeMarca(
        "plano_com_assinantes",
        "Este plano tem assinantes: o preço e o intervalo não mudam mais. Arquive-o e crie outro.",
        409,
      );
    }
  }

  const agora = new Date().toISOString();
  const arquivadoEm = arquivado === undefined ? {} : { arquivado_em: arquivado ? (atual.arquivado_em ?? agora) : null };
  const { data, error } = await admin
    .from("cobranca_planos")
    .update({ ...resto, ...arquivadoEm, updated_at: agora, updated_by: autorId })
    .eq("id", planoId)
    .eq("brand_id", brandId)
    .select(COLUNAS_DO_PLANO)
    .single();
  if (error?.code === "23505") {
    throw new ErroDeMarca("state_conflict", "Esta marca já tem um plano do cadastro. Desmarque o outro antes.", 409);
  }
  if (error || !data) throw new Error(`editar plano cobrável: ${error?.code ?? "erro"} ${error?.message ?? ""}`);
  return data as Linha;
}
