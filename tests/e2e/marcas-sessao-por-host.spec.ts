import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { test, expect } from "./helpers/test";

/**
 * A SESSÃO É DO HOST — entrar na marca A e abrir a marca B pede novo login.
 *
 * Mudança SDD 002, AC-004.3 (e AC-004.1 pelo que a tela mostra). Duas marcas, cada
 * uma com um subdomínio `*.localhost` (o Chromium resolve para a máquina local, sem
 * DNS), e UM usuário com uma organização em cada marca: identidade única.
 *
 * O cookie `sb-deskcomm-auth` não declara `domain`, então o navegador o prende ao
 * host que o gravou. Esta spec mede o comportamento real, com cookie de verdade: o
 * login em A não vale em B, e o login de B pede credencial de novo.
 *
 * Roda com o servidor de produção (`next start`); a marca do host é resolvida pelo
 * servidor, que lê `brand_domains` com a service role.
 */

test.describe.configure({ timeout: 120_000 });

const SUFIXO = Date.now().toString(36);
const HOST_A = `marca-a-${SUFIXO}.localhost`;
const HOST_B = `marca-b-${SUFIXO}.localhost`;
const SENHA = "SenhaForte!2026e2e";
const EMAIL = `e2e-marcas-${SUFIXO}@deskcomm.test`;

function admin() {
  const c = credenciaisSupabaseDeTeste();
  return createClient(c.url, c.serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function semErro<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, onde: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${onde}: ${error.message}`);
  if (data === null) throw new Error(`${onde}: nenhuma linha devolvida`);
  return data;
}

async function semear(): Promise<void> {
  const db = admin();
  const parceiro = await semErro(
    db.from("partners").insert({ slug: `e2e-p-${SUFIXO}`, name: "Parceiro E2E" }).select("id").single(),
    "parceiro",
  );
  const usuario = await db.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true });
  if (usuario.error || !usuario.data.user) throw new Error(`usuário: ${usuario.error?.message}`);
  for (const [letra, host] of [["a", HOST_A], ["b", HOST_B]] as const) {
    const marca = await semErro(
      db
        .from("brands")
        .insert({ partner_id: parceiro.id, slug: `e2e-${letra}-${SUFIXO}`, name: `Marca ${letra.toUpperCase()}`, app_name: `Marca ${letra.toUpperCase()} E2E` })
        .select("id")
        .single(),
      `marca ${letra}`,
    );
    await semErro(
      db.from("brand_domains").insert({ brand_id: marca.id, host, kind: "subdominio", status: "active" }).select("id").single(),
      `domínio ${letra}`,
    );
    const org = await semErro(
      db
        .from("organizations")
        .insert({
          slug: `e2e-marcas-${letra}-${SUFIXO}`,
          legal_name: `Org ${letra.toUpperCase()}`,
          display_name: `Org ${letra.toUpperCase()} ${SUFIXO}`,
          brand_id: marca.id,
          onboarded_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
      `organização ${letra}`,
    );
    await semErro(
      db
        .from("user_organizations")
        .insert({ user_id: usuario.data.user.id, organization_id: org.id, role: "manager", accepted_at: new Date().toISOString() })
        .select("organization_id")
        .single(),
      `vínculo ${letra}`,
    );
  }
}

function origem(baseURL: string | undefined, host: string): string {
  const porta = new URL(baseURL ?? "http://localhost:3000").port || "3000";
  return `http://${host}:${porta}`;
}

test.beforeAll(async () => {
  await semear();
});

test("AC-004.3: a sessão iniciada na marca A não vale na marca B, que pede novo login", async ({ page, baseURL }) => {
  const a = origem(baseURL, HOST_A);
  const b = origem(baseURL, HOST_B);

  // O login de cada marca mostra o nome da própria marca (AC-005.1, pela tela).
  await page.goto(`${a}/login`);
  await expect(page.getByLabel(/e-?mail/i)).toBeVisible();

  await page.getByLabel(/e-?mail/i).fill(EMAIL);
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/(app|onboarding)(\/|$)/, { timeout: 30_000 });

  // AC-004.1: dentro de A só a organização de A aparece.
  await expect(page.locator("body")).not.toContainText(`Org B ${SUFIXO}`);

  // Mesma pessoa, mesmo navegador, OUTRO host: o cookie de A não vai junto.
  await page.goto(`${b}/app`);
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByLabel(/e-?mail/i)).toBeVisible();

  // E a sessão de A continua de pé em A (controle: o bloqueio é de B, não um logout geral).
  await page.goto(`${a}/app`);
  await expect(page).not.toHaveURL(/\/login/);
});
