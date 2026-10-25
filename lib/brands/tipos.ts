/**
 * A marca como o app a conhece: a linha de `public.brands` (migration 0717).
 *
 * Campos visuais NULOS = herdam de `platform_branding` e do ambiente. A marca
 * padrão nasce assim de propósito (ADR-002): editar a marca da instalação
 * continua valendo para ela, e nada é copiado.
 */
import { z } from "zod";

const textoOpcional = z.string().nullish();

export const MarcaSchema = z.object({
  id: z.string(),
  partner_id: z.string().nullish(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(["active", "inactive"]),
  is_default: z.boolean(),
  app_name: textoOpcional,
  logo_path: textoOpcional,
  logo_dark_path: textoOpcional,
  favicon_path: textoOpcional,
  accent_hex: textoOpcional,
  accent_dark_hex: textoOpcional,
  sender_name: textoOpcional,
  reply_to: textoOpcional,
  support_email: textoOpcional,
  default_pack_id: z.string().nullish(),
  cadastro_aberto: z.boolean(),
  permite_personalizacao: z.boolean(),
});

export type Brand = z.infer<typeof MarcaSchema>;

export type TipoDeDominio = "padrao" | "subdominio" | "proprio";

/**
 * A marca padrão embutida: o que se serve quando o banco não responde, quando a
 * chave `MARCAS_POR_DOMINIO` está em `off` ou quando a migração ainda não rodou.
 * Todos os campos visuais nulos, ou seja, o produto exatamente como era antes.
 */
export const MARCA_PADRAO_EMBUTIDA: Brand = {
  id: "padrao-embutida",
  partner_id: null,
  slug: "padrao",
  name: "padrao",
  status: "active",
  is_default: true,
  app_name: null,
  logo_path: null,
  logo_dark_path: null,
  favicon_path: null,
  accent_hex: null,
  accent_dark_hex: null,
  sender_name: null,
  reply_to: null,
  support_email: null,
  default_pack_id: null,
  cadastro_aberto: false,
  permite_personalizacao: true,
};
