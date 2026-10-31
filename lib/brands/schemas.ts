/**
 * Entradas da API admin de marcas, domínios, planos e pacotes (REQ-008).
 * Todo corpo externo passa por aqui (Zod). `is_default` não é editável por
 * estas rotas.
 */
import { z } from "zod";

import { edicaoDoPlanoSchema, novoPlanoSchema } from "@/lib/schemas/cobranca-plano";

const hexMinusculo = z.string().regex(/^#[0-9a-f]{6}$/, "Use o formato #rrggbb em minúsculas.");
const textoCurto = z.string().trim().min(1).max(200);

const camposDaMarca = {
  app_name: z.string().trim().min(1).max(80).nullable().optional(),
  logo_path: z.string().max(300).nullable().optional(),
  logo_dark_path: z.string().max(300).nullable().optional(),
  favicon_path: z.string().max(300).nullable().optional(),
  accent_hex: hexMinusculo.nullable().optional(),
  accent_dark_hex: hexMinusculo.nullable().optional(),
  sender_name: z.string().trim().min(1).max(120).nullable().optional(),
  reply_to: z.string().email().max(200).nullable().optional(),
  support_email: z.string().email().max(200).nullable().optional(),
  default_pack_id: z.string().uuid().nullable().optional(),
  cadastro_aberto: z.boolean().optional(),
  permite_personalizacao: z.boolean().optional(),
  mobile: z.record(z.string(), z.unknown()).optional(),
};

export const SLUG = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "Identificador inválido.");

export const CriarMarcaSchema = z
  .object({ slug: SLUG, name: textoCurto, partner_id: z.string().uuid().optional(), ...camposDaMarca })
  .strict();

export const EditarMarcaSchema = z
  .object({ name: textoCurto.optional(), ...camposDaMarca })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nada para alterar.");

const HOST = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/,
    "Endereço inválido.",
  );

export const CriarDominioSchema = z
  .object({ host: HOST, kind: z.enum(["subdominio", "proprio"]) })
  .strict();

const moeda = z
  .string()
  .length(3)
  .transform((s) => s.toUpperCase());

export const CriarPlanoSchema = z
  .object({
    name: textoCurto,
    limits: z.record(z.string(), z.unknown()).default({}),
    price_cents: z.number().int().min(0).max(100_000_000),
    currency: moeda.default("BRL"),
    cycle: z.enum(["monthly", "yearly", "one_time"]).default("monthly"),
  })
  .strict();

export const EditarPlanoSchema = z
  .object({
    plan_id: z.string().uuid(),
    name: textoCurto.optional(),
    limits: z.record(z.string(), z.unknown()).optional(),
    price_cents: z.number().int().min(0).max(100_000_000).optional(),
    currency: moeda.optional(),
    cycle: z.enum(["monthly", "yearly", "one_time"]).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, "Nada para alterar.");

export const CriarPacoteSchema = z
  .object({
    slug: SLUG,
    name: textoCurto,
    seed: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const EditarPacoteSchema = z
  .object({
    pack_id: z.string().uuid(),
    name: textoCurto.optional(),
    seed: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, "Nada para alterar.");

export const TrocarMarcaDaOrganizacaoSchema = z.object({ brand_id: z.string().uuid() }).strict();

export const UuidSchema = z.string().uuid();

// ── Cobrança da marca (mudança 003) ─────────────────────────────────────────
// Os planos cobráveis são os de `cobranca_planos`: a régua é a MESMA da
// instalação (preço mínimo, intervalo, dias de teste), por isso reaproveita
// `lib/schemas/cobranca-plano.ts`. `brand_id` nunca vem do corpo: é o do path.

export const LigarCobrancaSchema = z.object({ cobranca_ligada: z.boolean() }).strict();

export const CriarPlanoCobravelSchema = novoPlanoSchema;

export const EditarPlanoCobravelSchema = z
  .looseObject({ plan_id: z.string().uuid() })
  .transform((v, ctx) => {
    const { plan_id, ...resto } = v;
    const r = edicaoDoPlanoSchema.safeParse(resto);
    if (!r.success) {
      for (const i of r.error.issues) ctx.addIssue({ code: "custom", message: i.message, path: i.path });
      return z.NEVER;
    }
    return { plan_id, ...r.data };
  });
