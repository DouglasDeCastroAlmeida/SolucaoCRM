import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { test, expect, type Page } from "./helpers/test";

/**
 * O CLIENTE CONFIRMA OU PEDE PARA REMARCAR PELO WHATSAPP, E A AGENDA MOSTRA.
 *
 * Mudança SDD 007 (T-024; AC-006.2). Jornada de quem opera, dirigida pela TELA:
 *   1. cria um tipo de agendamento novo e vê que ele já nasce com os lembretes de 24 h e 2 h;
 *   2. liga "Pedir confirmação ao cliente" no tipo;
 *   3. um compromisso desse tipo existe, com o lembrete JÁ ENVIADO (semente: `reminder_sent_at`,
 *      porque o envio real do lembrete é do cron e do WAHA);
 *   4. o cliente responde "1": a agenda mostra o selo "Confirmado pelo cliente";
 *   5. outro compromisso, o cliente responde "2": a agenda mostra "Pediu para remarcar".
 *
 * As respostas entram pelo CAMINHO DE PRODUÇÃO: `POST /api/v1/webhooks/waha/[token]`, o mesmo que o
 * WAHA chama (sem assinatura, como o WAHA Core real). O WAHA REAL só entra na homologação
 * (T-027 a T-029); por isso a spec está em `FORA_DO_CI` no workflow. Aqui o agradecimento ao cliente
 * não chega a lugar nenhum (não há WAHA), e a spec não depende dele: a prova é o que a TELA mostra.
 *
 * Receita: `pnpm e2e:env` + `pnpm playwright test tests/e2e/agenda-confirmacao-cliente.spec.ts`.
 * Evidência: `evidence/007-agenda/` (versionada).
 */

test.describe.configure({ timeout: 180_000 });

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = "evidence/007-agenda";

interface Creds {
  org_id: string;
  password: string;
  users: Record<string, { id: string; email: string }>;
  nascimento?: { webhook_token: string; session_name: string };
}

function lerCreds(): Creds {
  if (!fs.existsSync(CREDS_PATH)) execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  let c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  if (!c.nascimento?.webhook_token) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-nascimento-do-lead.ts"], { stdio: "inherit" });
    c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  }
  return c;
}

const sufixo = Date.now().toString(36);
const NOME_DO_TIPO = `Retorno Confirma ${sufixo}`;
const NOME_DO_CLIENTE = `Cliente Confirma ${sufixo}`;
/** Telefone único por execução: o banco de e2e é compartilhado entre frentes. */
const TELEFONE = `55319${String(Date.now()).slice(-8)}`;
const DIA = 24 * 3_600_000;

function admin() {
  const c = credenciaisSupabaseDeTeste();
  return createClient(c.url, c.serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function entrar(page: Page, creds: Creds): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(creds.users.manager!.email);
  await page.getByLabel(/senha/i).fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 });
}

/** Uma mensagem de ENTRADA de texto, como o WAHA a entrega. */
async function responder(page: Page, creds: Creds, texto: string, id: string): Promise<void> {
  const r = await page.request.post(`/api/v1/webhooks/waha/${creds.nascimento!.webhook_token}`, {
    data: {
      event: "message",
      session: creds.nascimento!.session_name,
      payload: {
        id,
        from: `${TELEFONE}@c.us`,
        fromMe: false,
        body: texto,
        timestamp: Math.floor(Date.now() / 1000),
        _data: { notifyName: NOME_DO_CLIENTE },
      },
    },
  });
  expect(r.status(), "o webhook precisa ACEITAR a mensagem de entrada").toBe(200);
}

async function semErro<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, onde: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${onde}: ${error.message}`);
  return data;
}

test("o cliente responde 1 e 2 ao lembrete e a agenda mostra o selo e a pendência", async ({ page }) => {
  const creds = lerCreds();
  const db = admin();
  await entrar(page, creds);

  // 1 e 2. Tipo novo pela tela, com os lembretes padrão e a confirmação ligada.
  await page.goto("/app/settings/tenant/agenda");
  await page.getByTestId("abrir-novo-tipo").click();
  await page.getByTestId("novo-tipo-nome").fill(NOME_DO_TIPO);
  await page.getByTestId("salvar-novo-tipo").click();
  const cartao = page.locator('[data-testid^="tipo-"]', { hasText: NOME_DO_TIPO }).first();
  await expect(cartao).toBeVisible({ timeout: 20_000 });

  const tipo = await semErro(
    db.from("calendar_event_types").select("id").eq("organization_id", creds.org_id).eq("name", NOME_DO_TIPO).single(),
    "tipo criado",
  );
  const tipoId = (tipo as { id: string }).id;

  const lembretes = page.getByTestId(`lembrete-ligado-${tipoId}`);
  await expect(lembretes, "o tipo novo tem de nascer com lembretes ligados").toBeVisible();
  await expect(lembretes).toContainText("1440");
  await expect(lembretes).toContainText("120");

  await page.getByTestId(`editar-${tipoId}`).click();
  await page.getByTestId(`editar-confirmacao-cliente-${tipoId}`).check();
  await page.getByTestId(`salvar-${tipoId}`).click();
  await expect
    .poll(
      async () =>
        (
          (await semErro(
            db.from("calendar_event_types").select("client_confirmation_enabled").eq("id", tipoId).single(),
            "tipo",
          )) as { client_confirmation_enabled: boolean }
        ).client_confirmation_enabled,
      { timeout: 20_000, message: "a confirmação do cliente não ficou ligada no tipo" },
    )
    .toBe(true);
  await page.screenshot({ path: `${EVIDENCIA}/tipo-com-confirmacao.png`, fullPage: true });

  // 3. O cliente já escreveu uma vez (a conversa nasce pelo caminho de produção) e há dois
  // compromissos futuros com o lembrete já enviado.
  await responder(page, creds, "Oi", `e2e-conf-${sufixo}-0`);
  const contato = (await semErro(
    db.from("contacts").select("id").eq("organization_id", creds.org_id).like("phone_number", `%${TELEFONE}`).limit(1).single(),
    "contato do cliente",
  )) as { id: string };
  const conversa = (await semErro(
    db.from("conversations").select("id").eq("organization_id", creds.org_id).eq("contact_id", contato.id).limit(1).single(),
    "conversa do cliente",
  )) as { id: string };

  const agora = Date.now();
  const novoCompromisso = async (inicioEmMs: number, titulo: string) =>
    semErro(
      db
        .from("calendar_appointments")
        .insert({
          organization_id: creds.org_id,
          contact_id: contato.id,
          conversation_id: conversa.id,
          event_type_id: tipoId,
          owner_user_id: creds.users.agent!.id,
          title: titulo,
          status: "confirmed",
          starts_at: new Date(inicioEmMs).toISOString(),
          ends_at: new Date(inicioEmMs + 30 * 60_000).toISOString(),
          reminder_sent_at: new Date(agora - 3_600_000).toISOString(),
        } as never)
        .select("id")
        .single(),
      "compromisso",
    );
  await novoCompromisso(agora + 2 * DIA, `${NOME_DO_TIPO} A`);

  // 4. "1": confirma o compromisso mais próximo.
  await responder(page, creds, "1", `e2e-conf-${sufixo}-1`);
  await page.goto("/app/agenda");
  await expect(page.getByTestId("tela-agenda")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId("selo-confirmado-pelo-cliente").first(),
    "o selo Confirmado pelo cliente não apareceu na agenda",
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Confirmado pelo cliente").first()).toBeVisible();
  await page.screenshot({ path: `${EVIDENCIA}/selo-confirmado.png`, fullPage: true });

  // 5. Um segundo compromisso, e "2": só registra o pedido, nada é cancelado.
  const segundo = await novoCompromisso(agora + 3 * DIA, `${NOME_DO_TIPO} B`);
  await responder(page, creds, "2", `e2e-conf-${sufixo}-2`);
  await page.goto("/app/agenda");
  await expect(page.getByTestId("tela-agenda")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId("pendencia-pediu-para-remarcar").first(),
    "a pendência Pediu para remarcar não apareceu na agenda",
  ).toBeVisible({ timeout: 20_000 });

  const depois = (await semErro(
    db.from("calendar_appointments").select("status").eq("id", (segundo as { id: string }).id).single(),
    "compromisso depois do 2",
  )) as { status: string };
  expect(depois.status, "o pedido de remarcar não pode cancelar sozinho").toBe("confirmed");
  await page.screenshot({ path: `${EVIDENCIA}/pendencia-pediu-para-remarcar.png`, fullPage: true });
});
