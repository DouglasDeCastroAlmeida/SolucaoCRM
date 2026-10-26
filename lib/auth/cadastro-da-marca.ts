/**
 * Quem pode se cadastrar neste endereço: a política da INSTALAÇÃO combinada com a
 * chave `cadastro_aberto` da MARCA (REQ-005).
 *
 * - Instalação em `so_convite` fecha tudo, em qualquer marca.
 * - Marca de vertical (não padrão) nasce FECHADA (`cadastro_aberto = false`, D-05):
 *   só abre quando o dono da plataforma liga a chave.
 * - A marca padrão NÃO é fechada por esta chave: ela é o produto de antes das marcas
 *   (AC-002.2), e quem a governa continua sendo `SIGNUP_MODE` / `/admin/cadastro`.
 *   Fechá-la aqui mudaria o cadastro de toda instalação que já existe.
 */
import { buscarMarcaAtivaPorId } from "@/lib/brands/repositorio";
import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

import { modoDeCadastro, type ModoDeCadastro } from "./politica-de-cadastro";
import { vinculoAtivo } from "./provision";

export function decidirCadastroDaMarca(brand: Brand, modoDaInstalacao: ModoDeCadastro): ModoDeCadastro {
  if (modoDaInstalacao === "so_convite") return "so_convite";
  if (brand.is_default) return modoDaInstalacao;
  return brand.cadastro_aberto ? modoDaInstalacao : "so_convite";
}

/** Nunca lança (herda de `modoDeCadastro`). */
export async function modoDeCadastroDaMarca(brand: Brand): Promise<ModoDeCadastro> {
  return decidirCadastroDaMarca(brand, await modoDeCadastro());
}

/**
 * O código de `/login?error=` de quem foi recusado por cadastro fechado. Quem JÁ tem organização em
 * outra marca recebe o aviso específico ("sua conta não tem organização nesta
 * marca"); quem não tem nenhuma, o aviso de cadastro por convite. Leitura que falha
 * cai no aviso genérico, que também é verdadeiro.
 */
export async function motivoDaRecusaPorConvite(
  userId: string,
): Promise<"sem_organizacao_na_marca" | "cadastro_por_convite"> {
  try {
    if (await vinculoAtivo(userId)) return "sem_organizacao_na_marca";
  } catch {
    // o aviso genérico abaixo vale
  }
  return "cadastro_por_convite";
}

/**
 * A marca em que a pessoa INICIOU o cadastro (`user_metadata.brand_id`, gravado pelo
 * `signUp`) vence o host do link de confirmação, que pode ser outro. Nunca lança: marca
 * inexistente, inativa ou leitura que falha cai no host. Com o host na marca embutida
 * (chave off) não consulta nada.
 *
 * O metadado é editável pela própria pessoa (`updateUser`), então só decide a marca da
 * organização NOVA, e só se a marca existe e está ativa; a trava de cadastro fechado
 * continua valendo sobre a marca resolvida aqui.
 */
export async function marcaDeOrigemDoCadastro(
  metadados: Record<string, unknown> | null | undefined,
  marcaDoHost: Brand,
  buscar: (id: string) => Promise<Brand | null> = buscarMarcaAtivaPorId,
): Promise<Brand> {
  const id = metadados?.brand_id;
  if (typeof id !== "string" || id === "" || id === marcaDoHost.id) return marcaDoHost;
  if (marcaDoHost.id === MARCA_PADRAO_EMBUTIDA.id) return marcaDoHost;
  try {
    const marca = await buscar(id);
    return marca && marca.status === "active" ? marca : marcaDoHost;
  } catch {
    return marcaDoHost;
  }
}
