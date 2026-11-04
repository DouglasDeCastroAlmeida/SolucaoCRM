/**
 * A anonimização do contato alcança o canal de e-mail (pendência do ADR-008, mudança 005).
 *
 * Catraca de texto, sem Postgres: a ÚLTIMA definição de `fn_lgpd_cascade_redact_contact` na
 * cadeia de migrations e a do apêndice do baseline (as que o Postgres deixa de pé) têm de
 * enfileirar TODOS os anexos de e-mail e apagar as duas tabelas sem `contact_id`, sempre
 * filtrando a organização. O efeito no banco é de `tests/invariants/email-lgpd-anonimiza.test.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "supabase", "migrations");
const BASELINE = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
const MARCA = "create or replace function public.fn_lgpd_cascade_redact_contact(";

function ultimaDefinicao(texto: string): string {
  const inicio = texto.lastIndexOf(MARCA);
  if (inicio < 0) return "";
  const fim = texto.indexOf("create or replace function", inicio + MARCA.length);
  return texto.slice(inicio, fim < 0 ? texto.length : fim);
}

const queRedefinem = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => readFileSync(join(DIR, f), "utf8").includes(MARCA));
const naCadeia = ultimaDefinicao(readFileSync(join(DIR, queRedefinem[queRedefinem.length - 1]!), "utf8"));
const noBaseline = ultimaDefinicao(BASELINE);

for (const [onde, def] of [
  ["a última da cadeia de migrations", naCadeia],
  ["a última do baseline", noBaseline],
] as const) {
  describe(`LGPD x canal de e-mail: ${onde}`, () => {
    it("AC-009.2: a sonda leu uma definição de verdade", () => {
      expect(def).toContain("fn_lgpd_rotulo_anonimizado");
      expect(def).toContain("external_id = null");
    });

    it("AC-009.2: enfileira TODOS os anexos de e-mail antes de zerar o metadata, só da própria organização", () => {
      const fila = def.indexOf("metadata -> 'email' -> 'anexos'");
      const zera = def.indexOf("update messages set");
      expect(fila).toBeGreaterThan(-1);
      expect(fila).toBeLessThan(zera);
      expect(def).toMatch(/anexo ->> 'caminho'\) like p_organization_id::text \|\| '\/%'/);
    });

    it("AC-009.2: apaga e_mail ignorado e remetente ignorado do endereço, filtrando a organização", () => {
      expect(def).toMatch(
        /delete from public\.email_ignorados\s+where organization_id = p_organization_id\s+and lower\(btrim\(remetente\)\) = v_email/,
      );
      expect(def).toMatch(
        /delete from public\.email_remetentes_ignorados\s+where organization_id = p_organization_id\s+and endereco_normalizado = v_email/,
      );
      expect(def).toContain("jsonb_build_object('email_ignorados', v_count)");
      expect(def).toContain("jsonb_build_object('email_remetentes_ignorados', v_count)");
    });

    it("AC-009.2: o endereço é lido ANTES do passo 1, que o zera", () => {
      const le = def.indexOf("into v_email");
      const zera = def.indexOf("update contacts set");
      expect(le).toBeGreaterThan(-1);
      expect(le).toBeLessThan(zera);
    });
  });
}

describe("LGPD x canal de e-mail: apêndice do baseline", () => {
  it("AC-009.2: fecha o EXECUTE das duas origens e entra antes da VARREDURA anon", () => {
    const bloco = BASELINE.indexOf("(migration 0728) ----");
    const varredura = BASELINE.indexOf("-- ---- VARREDURA anon");
    expect(bloco).toBeGreaterThan(-1);
    expect(bloco).toBeLessThan(varredura);
    const depois = BASELINE.slice(BASELINE.lastIndexOf(MARCA), varredura);
    expect(depois).toMatch(
      /revoke all on function public\.fn_lgpd_cascade_redact_contact\(uuid, uuid, uuid\) from public, anon, authenticated;/,
    );
    expect(depois).toMatch(
      /grant execute on function public\.fn_lgpd_cascade_redact_contact\(uuid, uuid, uuid\) to service_role;/,
    );
  });
});
