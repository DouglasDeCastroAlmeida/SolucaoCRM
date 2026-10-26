import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";

import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { test, expect } from "./helpers/test";

/**
 * TRÊS MARCAS, TRÊS ENDEREÇOS — login com a marca certa e e-mail com o link do mesmo host.
 *
 * Mudança SDD 002 (T-044; AC-005.1 pela tela e AC-006.1/AC-006.4 pelo e-mail). Ambiente
 * fresco: três marcas, cada uma com um subdomínio `*.localhost` (o Chromium resolve para a
 * máquina local, sem DNS). Para cada host:
 *   1. o `/login` mostra o nome da marca daquele host (e não o de outra);
 *   2. o gancho de e-mail (`POST /api/hooks/auth/send-email`), chamado com um payload
 *      assinado no padrão Standard Webhooks, monta o e-mail da marca e o entrega a um
 *      receiver HTTP de verdade, e o link do e-mail aponta para o MESMO host.
 *
 * Do ambiente (a spec não sobe o app, só mede):
 *   - `AUTH_HOOK_SECRET` no app = o segredo desta spec: `v1,whsec_<E2E_AUTH_HOOK_SECRET_BASE64>`
 *     (padrão de teste abaixo; não é segredo de ninguém).
 *   - O app envia pela Resend apontada ao receiver desta spec: `RESEND_API_KEY` e
 *     `RESEND_FROM_EMAIL` preenchidos e a base da Resend em `http://127.0.0.1:<porta>`
 *     (`E2E_RECEIVER_PORT`, padrão 3997, a mesma do dublê do workflow). Sem isso nada
 *     chega ao receiver e a spec reprova dizendo que o e-mail não chegou.
 *
 * Receita: `pnpm e2e:env` + `pnpm playwright test tests/e2e/marcas.spec.ts`.
 */

test.describe.configure({ timeout: 180_000 });

const SUFIXO = Date.now().toString(36);
const SEGREDO_BASE64 = process.env.E2E_AUTH_HOOK_SECRET_BASE64 ?? "ZTJlLW1hcmNhcy1ub3NzbyBzZWdyZWRvIGRlIHRlc3Rl";
const PORTA_DO_RECEIVER = Number(process.env.E2E_RECEIVER_PORT ?? "3997");

type MarcaDeTeste = { letra: "a" | "b" | "c"; host: string; appName: string; email: string };
const LETRAS = ["a", "b", "c"] as const;
const MARCAS: MarcaDeTeste[] = LETRAS.map((letra) => ({
  letra,
  host: `marca-${letra}-${SUFIXO}.localhost`,
  appName: `Marca ${letra.toUpperCase()} E2E ${SUFIXO}`,
  email: `e2e-marcas-${letra}-${SUFIXO}@deskcomm.test`,
}));

type EmailCapturado = { to: string[]; subject: string; html: string; text: string };
const capturados: EmailCapturado[] = [];
let receiver: http.Server | null = null;

function admin() {
  const c = credenciaisSupabaseDeTeste();
  return createClient(c.url, c.serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function semErro(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  onde: string,
): Promise<{ id: string }> {
  const { data, error } = await p;
  if (error) throw new Error(`${onde}: ${error.message}`);
  if (data === null || data === undefined) throw new Error(`${onde}: nenhuma linha devolvida`);
  return data as { id: string };
}

async function semear(): Promise<void> {
  const db = admin();
  const parceiro = await semErro(
    db.from("partners").insert({ slug: `e2e-mp-${SUFIXO}`, name: "Parceiro E2E Marcas" }).select("id").single(),
    "parceiro",
  );
  for (const m of MARCAS) {
    const marca = await semErro(
      db
        .from("brands")
        .insert({
          partner_id: parceiro.id,
          slug: `e2e-m-${m.letra}-${SUFIXO}`,
          name: `Marca ${m.letra.toUpperCase()}`,
          app_name: m.appName,
        })
        .select("id")
        .single(),
      `marca ${m.letra}`,
    );
    await semErro(
      db.from("brand_domains").insert({ brand_id: marca.id, host: m.host, kind: "subdominio", status: "active" }).select("id").single(),
      `domínio ${m.letra}`,
    );
    // É esta linha que diz ao gancho de que marca é o e-mail (o app a grava antes de pedir ao GoTrue).
    const { error } = await db
      .from("brand_email_context")
      .upsert({ email: m.email, action: "recovery", brand_id: marca.id }, { onConflict: "email,action" });
    if (error) throw new Error(`contexto ${m.letra}: ${error.message}`);
  }
}

type CorpoDaResend = { to?: string | string[]; subject?: string; html?: string; text?: string };

/** Receiver HTTP de verdade no formato da Resend: `POST /emails` guarda o e-mail e devolve `{ id }`. */
function subirReceiver(): Promise<http.Server> {
  return new Promise((resolver, rejeitar) => {
    const servidor = http.createServer((req, res) => {
      const pedacos: Buffer[] = [];
      req.on("data", (c: Buffer) => pedacos.push(c));
      req.on("end", () => {
        if (req.method === "POST" && (req.url ?? "").split("?")[0] === "/emails") {
          const corpo = JSON.parse(Buffer.concat(pedacos).toString("utf8") || "{}") as CorpoDaResend;
          capturados.push({
            to: Array.isArray(corpo.to) ? corpo.to : corpo.to ? [corpo.to] : [],
            subject: corpo.subject ?? "",
            html: corpo.html ?? "",
            text: corpo.text ?? "",
          });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ id: `capturado-${capturados.length}` }));
          return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    servidor.once("error", rejeitar);
    servidor.listen(PORTA_DO_RECEIVER, "127.0.0.1", () => resolver(servidor));
  });
}

/** Assinatura Standard Webhooks: HMAC-SHA256 de `${id}.${timestamp}.${corpo}`, chave = bytes do base64. */
function assinar(id: string, timestamp: string, corpo: string): string {
  const chave = Buffer.from(SEGREDO_BASE64, "base64");
  return `v1,${createHmac("sha256", chave).update(`${id}.${timestamp}.${corpo}`).digest("base64")}`;
}

function origem(baseURL: string | undefined, host: string): string {
  const porta = new URL(baseURL ?? "http://localhost:3000").port || "3000";
  return `http://${host}:${porta}`;
}

test.beforeAll(async () => {
  receiver = await subirReceiver();
  await semear();
});

test.afterAll(async () => {
  const s = receiver;
  if (s) await new Promise<void>((ok) => s.close(() => ok()));
});

for (const m of MARCAS) {
  test(`AC-005.1: o login de ${m.host} mostra a marca ${m.letra.toUpperCase()}, e só ela`, async ({ page, baseURL }) => {
    await page.goto(`${origem(baseURL, m.host)}/login`);
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible();
    await expect(page.locator("body")).toContainText(m.appName);
    for (const outra of MARCAS.filter((x) => x.letra !== m.letra)) {
      await expect(page.locator("body")).not.toContainText(outra.appName);
    }
  });

  test(`AC-006.1: o e-mail da marca ${m.letra.toUpperCase()} traz o link no mesmo host`, async ({ request, baseURL }) => {
    const antes = capturados.length;
    const id = `msg_${randomBytes(8).toString("hex")}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const corpo = JSON.stringify({
      user: { email: m.email },
      email_data: {
        token: "123456",
        token_hash: `hash-${m.letra}-${SUFIXO}`,
        redirect_to: `https://${m.host}/auth/confirm`,
        email_action_type: "recovery",
      },
    });

    const resposta = await request.post(`${origem(baseURL, m.host)}/api/hooks/auth/send-email`, {
      data: corpo,
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": assinar(id, timestamp, corpo),
      },
    });
    expect(resposta.status(), "o gancho aceita o payload assinado (AUTH_HOOK_SECRET igual no app)").toBe(200);

    await expect.poll(() => capturados.length, { message: "o e-mail chegou ao receiver", timeout: 15_000 }).toBeGreaterThan(antes);
    const email = capturados[capturados.length - 1] as EmailCapturado;
    expect(email.to).toContain(m.email);
    expect(email.html).toContain(`https://${m.host}/auth/confirm?token_hash=hash-${m.letra}-${SUFIXO}`);
    for (const outra of MARCAS.filter((x) => x.letra !== m.letra)) {
      expect(email.html).not.toContain(outra.host);
    }
  });
}

test("AC-006: payload sem assinatura válida é 401 e nenhum e-mail sai", async ({ request, baseURL }) => {
  const m = MARCAS[0] as MarcaDeTeste;
  const antes = capturados.length;
  const resposta = await request.post(`${origem(baseURL, m.host)}/api/hooks/auth/send-email`, {
    data: "{}",
    headers: {
      "content-type": "application/json",
      "webhook-id": "x",
      "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
      "webhook-signature": "v1,AAAA",
    },
  });
  expect(resposta.status()).toBe(401);
  expect(capturados.length).toBe(antes);
});
