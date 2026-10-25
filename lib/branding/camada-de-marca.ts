/**
 * A camada de MARCA: fica entre a organização e a instalação na pilha
 * (organização > marca > plataforma > ambiente > padrão do produto).
 *
 * Campo nulo na marca NÃO apaga a camada de baixo — é a herança por campo que
 * faz a marca padrão (toda nula) ser idêntica ao produto de antes.
 */
import type { Brand } from "@/lib/brands/tipos";

import { logoDaCamada } from "./logo";
import { envelopeDeSemente } from "./schema";
import type { CamadaDeMarca } from "./resolve";

export const ORIGEM_DA_MARCA = "marca";

export type MarcaParaCamada = Pick<
  Brand,
  "app_name" | "logo_path" | "logo_dark_path" | "accent_hex" | "accent_dark_hex"
>;

export function camadaDaMarca(marca: MarcaParaCamada | null | undefined): CamadaDeMarca {
  if (!marca) return { origem: ORIGEM_DA_MARCA };
  const hex = (marca.accent_hex ?? "").trim();
  const hexEscuro = (marca.accent_dark_hex ?? "").trim();
  const logoUrl = logoDaCamada(marca.logo_path, null);
  const logoDarkUrl = logoDaCamada(marca.logo_dark_path, null);
  const base = {
    origem: ORIGEM_DA_MARCA,
    nome: marca.app_name,
    logoUrl,
    ...(logoDarkUrl ? { logoDarkUrl } : {}),
  };
  // Sem hex a camada não fala de cor (nunca `cor: null`, que emitiria `cor_ausente`).
  if (hex.length === 0) return base;
  return {
    ...base,
    cor: envelopeDeSemente(hex),
    ...(hexEscuro.length > 0 ? { corEscura: envelopeDeSemente(hexEscuro) } : {}),
  };
}
