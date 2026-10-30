/**
 * Escrita e leitura administrativas de marcas, domínios, planos e pacotes.
 *
 * Marca é dado GLOBAL (não pertence a organização): como `repositorio.ts`, usa
 * o cliente admin SEM `organization_id` (ADR-006). Só é chamado por rotas
 * `/api/v1/admin/**` que já passaram por `requirePlatformAdmin*`.
 *
 * Erros esperados viram `ErroDeMarca` com código estável; o resto propaga.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidarMarcaDoHost } from "@/lib/branding/marca-do-host";

export class ErroDeMarca extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "brand_domain_exists"
      | "brand_slug_exists"
      | "brand_default_protected"
      | "pack_slug_exists"
      | "state_conflict"
      | "plano_com_assinantes",
    message: string,
    public readonly status: 404 | 409,
  ) {
    super(message);
  }
}

type Linha = Record<string, unknown>;
type ErroPg = { code?: string; message: string } | null;

function lancar(error: ErroPg, contexto: string): never {
  throw new Error(`${contexto}: ${error?.code ?? "erro"} ${error?.message ?? ""}`);
}

export async function listarMarcas(): Promise<Linha[]> {
  const { data, error } = await createAdminClient()
    .from("brands")
    .select("*, brand_domains(id, host, kind, status)")
    .order("created_at", { ascending: true });
  if (error) lancar(error, "listar marcas");
  return (data ?? []) as Linha[];
}

async function parceiroPadrao(): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("partners")
    .select("id")
    .eq("slug", "plataforma")
    .maybeSingle();
  if (error) lancar(error, "parceiro padrão");
  if (!data) throw new Error("parceiro padrão ausente");
  return (data as { id: string }).id;
}

async function exigirPacote(packId: unknown): Promise<void> {
  if (typeof packId !== "string") return;
  const { data, error } = await createAdminClient()
    .from("vertical_packs")
    .select("id")
    .eq("id", packId)
    .maybeSingle();
  if (error) lancar(error, "ler pacote");
  if (!data) throw new ErroDeMarca("not_found", "Pacote padrão não encontrado.", 404);
}

export async function criarMarca(entrada: Linha): Promise<Linha> {
  await exigirPacote(entrada.default_pack_id);
  const partner_id = (entrada.partner_id as string | undefined) ?? (await parceiroPadrao());
  const { data, error } = await createAdminClient()
    .from("brands")
    .insert({ ...entrada, partner_id, is_default: false })
    .select("*")
    .single();
  if (error?.code === "23505") {
    throw new ErroDeMarca("brand_slug_exists", "Já existe uma marca com este identificador.", 409);
  }
  if (error || !data) lancar(error, "criar marca");
  return data as Linha;
}

export async function editarMarca(id: string, campos: Linha): Promise<Linha> {
  await exigirPacote(campos.default_pack_id);
  const { data, error } = await createAdminClient()
    .from("brands")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) lancar(error, "editar marca");
  if (!data) throw new ErroDeMarca("not_found", "Marca não encontrada.", 404);
  await invalidarDominiosDaMarca(id);
  return data as Linha;
}

/** "Remover" marca = desativar. A marca padrão não pode ser desativada. */
export async function desativarMarca(id: string): Promise<Linha> {
  const admin = createAdminClient();
  const { data: atual, error: e1 } = await admin
    .from("brands")
    .select("id, is_default")
    .eq("id", id)
    .maybeSingle();
  if (e1) lancar(e1, "ler marca");
  if (!atual) throw new ErroDeMarca("not_found", "Marca não encontrada.", 404);
  if ((atual as { is_default: boolean }).is_default) {
    throw new ErroDeMarca("brand_default_protected", "A marca padrão não pode ser desativada.", 409);
  }
  const { data, error } = await admin
    .from("brands")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) lancar(error, "desativar marca");
  await invalidarDominiosDaMarca(id);
  return data as Linha;
}

async function invalidarDominiosDaMarca(brandId: string): Promise<void> {
  try {
    const { data } = await createAdminClient()
      .from("brand_domains")
      .select("host")
      .eq("brand_id", brandId);
    for (const d of (data ?? []) as Array<{ host: string }>) invalidarMarcaDoHost(d.host);
  } catch {
    invalidarMarcaDoHost();
  }
}

export async function adicionarDominio(brandId: string, host: string, kind: string): Promise<Linha> {
  const admin = createAdminClient();
  const { data: marca } = await admin.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!marca) throw new ErroDeMarca("not_found", "Marca não encontrada.", 404);
  const { data, error } = await admin
    .from("brand_domains")
    .insert({ brand_id: brandId, host, kind })
    .select("*")
    .single();
  if (error?.code === "23505") {
    throw new ErroDeMarca("brand_domain_exists", "Este endereço já está cadastrado.", 409);
  }
  if (error || !data) lancar(error, "adicionar domínio");
  invalidarMarcaDoHost(host);
  return data as Linha;
}

export async function removerDominio(brandId: string, domainId: string): Promise<{ host: string }> {
  const { data, error } = await createAdminClient()
    .from("brand_domains")
    .delete()
    .eq("id", domainId)
    .eq("brand_id", brandId)
    .select("host")
    .maybeSingle();
  if (error) lancar(error, "remover domínio");
  if (!data) throw new ErroDeMarca("not_found", "Domínio não encontrado.", 404);
  const host = (data as { host: string }).host;
  invalidarMarcaDoHost(host);
  return { host };
}

/**
 * LEGADO da SP1: `brand_plans` deixou de ser a fonte dos planos da marca
 * (ADR-002 da mudança 003). A aba Cobrança usa `cobranca-repo.ts`.
 */
export async function listarPlanos(brandId: string): Promise<Linha[]> {
  const { data, error } = await createAdminClient()
    .from("brand_plans")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });
  if (error) lancar(error, "listar planos");
  return (data ?? []) as Linha[];
}

/** Plano é só cadastro: nada aqui aciona cobrança (AC-008.3). */
export async function criarPlano(brandId: string, campos: Linha): Promise<Linha> {
  const admin = createAdminClient();
  const { data: marca } = await admin.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!marca) throw new ErroDeMarca("not_found", "Marca não encontrada.", 404);
  const { data, error } = await admin
    .from("brand_plans")
    .insert({ ...campos, brand_id: brandId })
    .select("*")
    .single();
  if (error || !data) lancar(error, "criar plano");
  return data as Linha;
}

export async function editarPlano(brandId: string, planId: string, campos: Linha): Promise<Linha> {
  const { data, error } = await createAdminClient()
    .from("brand_plans")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("brand_id", brandId)
    .select("*")
    .maybeSingle();
  if (error) lancar(error, "editar plano");
  if (!data) throw new ErroDeMarca("not_found", "Plano não encontrado.", 404);
  return data as Linha;
}

export async function listarPacotes(): Promise<Linha[]> {
  const { data, error } = await createAdminClient()
    .from("vertical_packs")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) lancar(error, "listar pacotes");
  return (data ?? []) as Linha[];
}

export async function criarPacote(campos: Linha): Promise<Linha> {
  const { data, error } = await createAdminClient()
    .from("vertical_packs")
    .insert(campos)
    .select("*")
    .single();
  if (error?.code === "23505") {
    throw new ErroDeMarca("pack_slug_exists", "Já existe um pacote com este identificador.", 409);
  }
  if (error || !data) lancar(error, "criar pacote");
  return data as Linha;
}

/** Mudar o `seed` sobe a versão; organizações que já copiaram NÃO são tocadas. */
export async function editarPacote(packId: string, campos: Linha): Promise<Linha> {
  const admin = createAdminClient();
  const { data: atual, error: e1 } = await admin
    .from("vertical_packs")
    .select("id, version")
    .eq("id", packId)
    .maybeSingle();
  if (e1) lancar(e1, "ler pacote");
  if (!atual) throw new ErroDeMarca("not_found", "Pacote não encontrado.", 404);
  const patch: Linha = { ...campos, updated_at: new Date().toISOString() };
  if (campos.seed !== undefined) patch.version = (atual as { version: number }).version + 1;
  const { data, error } = await admin
    .from("vertical_packs")
    .update(patch)
    .eq("id", packId)
    .select("*")
    .single();
  if (error || !data) lancar(error, "editar pacote");
  return data as Linha;
}

/**
 * Todas as contas (organizações) com a marca de cada uma — painel da
 * plataforma (AC-008.5). `brand_id` NULL = marca padrão. O filtro de marca vem
 * da query da rota do admin, nunca do corpo.
 */
export async function listarContasComMarca(opts: {
  brandId?: string;
  q?: string;
  limit: number;
}): Promise<Linha[]> {
  let query = createAdminClient()
    .from("organizations")
    .select("id, name, slug, status, brand_id, created_at, brands(id, name, slug, is_default)")
    .order("created_at", { ascending: false })
    .limit(opts.limit);
  if (opts.brandId) query = query.eq("brand_id", opts.brandId);
  if (opts.q) {
    // Vírgula e parênteses quebram a sintaxe do or(); \, % e _ são curingas do ilike.
    const termo = opts.q.replace(/[,()]/g, "").replace(/[\\%_]/g, (c) => "\\" + c);
    query = query.or(`name.ilike.%${termo}%,slug.ilike.%${termo}%`);
  }
  const { data, error } = await query;
  if (error) lancar(error, "listar contas");
  return (data ?? []) as Linha[];
}
