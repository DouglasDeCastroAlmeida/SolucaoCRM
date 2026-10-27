/**
 * INBOX NO ESTILO WHATSAPP — DESEMPENHO DA LISTA E LARGURA DE CELULAR
 * (mudança SDD 004, AC-007.2 e AC-007.3), medidos por ferramenta, nunca a olho.
 *
 * ## O que mede
 *
 * - AC-007.2: com 500 conversas carregadas na lista, rolar de ponta a ponta não
 *   perde quadros de forma perceptível. A lista pagina de 50 em 50 ("Carregar
 *   mais"); a spec carrega as 10 páginas e só então rola.
 *   CRITÉRIO NUMÉRICO (rolagem programática: `scrollTop += 48` por quadro,
 *   cronometrada por `requestAnimationFrame` + `performance.now()`, ~4 s):
 *     - p95 do intervalo entre quadros <= 50 ms (piso de 20 quadros/s);
 *     - no máximo 2% dos quadros acima de 100 ms (travadas visíveis);
 *     - a rolagem de fato andou (scrollTop final > 0).
 *   O teto é folgado de propósito: o runner roda sem GPU, com renderização por
 *   software. Num aparelho de verdade o número é melhor, não pior.
 * - AC-007.3: em 375x812, nem a lista nem a conversa aberta criam rolagem
 *   horizontal da página (`scrollWidth <= clientWidth`) e nenhum filho do inbox
 *   passa da borda direita (`getBoundingClientRect().right <= largura`).
 *
 * ## Pré-requisitos (banco local fresco, app buildada)
 *   pnpm exec tsx scripts/seed-e2e-credentials.ts
 *   pnpm e2e:env && pnpm e2e:build
 *   E2E_PORT=3021 pnpm exec playwright test tests/e2e/inbox-desempenho-e-celular.spec.ts
 *
 * Fora do CI (ver `FORA_DO_CI` em `.github/workflows/e2e.yml`): o seed é grande e
 * a medição de quadros só vale numa máquina de homologação/VPS fresca.
 * Evidência: `evidence/004-inbox/`.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test, type Page } from "./helpers/test";
import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), "evidence/004-inbox");

const TOTAL = 500;
const POR_LOTE = 100;
const P95_MAXIMO_MS = 50;
const QUADRO_LENTO_MS = 100;
const FRACAO_LENTA_MAXIMA = 0.02;

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PREFIXO = "Desempenho Inbox E2E";

let creds: Creds;
let primeiraConversaId = "";

async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

async function limpar(): Promise<void> {
  const { data } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", creds.org_id)
    .like("display_name", `${PREFIXO}%`);
  const ids = ((data as Array<{ id: string }> | null) ?? []).map((c) => c.id);
  for (let i = 0; i < ids.length; i += POR_LOTE) {
    const lote = ids.slice(i, i + POR_LOTE);
    await admin.from("messages").delete().in("contact_id", lote);
    await admin.from("conversations").delete().in("contact_id", lote);
    await admin.from("contacts").delete().in("id", lote);
  }
}

/** Carrega as páginas da lista (50 por vez) até haver `alvo` linhas. */
async function carregarAteTer(page: Page, alvo: number): Promise<number> {
  const linhas = page.locator("[data-conversation-id]");
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    const antes = await linhas.count();
    if (antes >= alvo) return antes;
    const botao = page.getByRole("button", { name: "Carregar mais", exact: true });
    if ((await botao.count()) === 0) return antes;
    await botao.click();
    await expect.poll(async () => linhas.count(), { timeout: 30_000 }).toBeGreaterThan(antes);
  }
  return linhas.count();
}

test.describe("Inbox — 500 conversas e largura de celular", () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeAll(async () => {
    if (!fs.existsSync(CREDS_PATH)) {
      execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
    }
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    fs.mkdirSync(EVIDENCIA, { recursive: true });
    await limpar();

    const { data: sessaoExistente } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", creds.org_id)
      .limit(1)
      .maybeSingle();
    let sessaoId = (sessaoExistente as { id: string } | null)?.id ?? null;
    if (!sessaoId) {
      const { data, error } = await admin
        .from("channel_sessions")
        .insert({
          organization_id: creds.org_id,
          waha_session_name: `e2e-desempenho-inbox-${Date.now()}`,
          webhook_secret_encrypted: "e2e",
        })
        .select("id")
        .single();
      if (error) throw new Error(`channel_sessions: ${error.message}`);
      sessaoId = (data as { id: string }).id;
    }

    const base = Date.now();
    for (let inicio = 0; inicio < TOTAL; inicio += POR_LOTE) {
      const contatos = Array.from({ length: POR_LOTE }, (_, k) => {
        const n = inicio + k;
        return {
          organization_id: creds.org_id,
          display_name: `${PREFIXO} ${String(n + 1).padStart(3, "0")}`,
          phone_number: `+5511${String(base + n).slice(-9)}`,
        };
      });
      const { data: criados, error: erroContatos } = await admin
        .from("contacts")
        .insert(contatos)
        .select("id, display_name");
      if (erroContatos) throw new Error(`contacts: ${erroContatos.message}`);

      const conversas = ((criados as Array<{ id: string; display_name: string }>) ?? []).map(
        (c, k) => {
          // Mais recente primeiro, a 1 min entre uma e outra: ordem estável.
          const quando = new Date(base - (inicio + k) * 60_000).toISOString();
          return {
            organization_id: creds.org_id,
            contact_id: c.id,
            channel_session_id: sessaoId,
            status: "open",
            last_message_at: quando,
            last_inbound_at: quando,
            last_message_preview: k % 3 === 0 ? "Imagem" : `Mensagem de teste ${inicio + k + 1}`,
          };
        },
      );
      const { data: convs, error: erroConvs } = await admin
        .from("conversations")
        .insert(conversas)
        .select("id");
      if (erroConvs) throw new Error(`conversations: ${erroConvs.message}`);
      if (inicio === 0) primeiraConversaId = (convs as Array<{ id: string }>)[0]?.id ?? "";
    }
    expect(primeiraConversaId).not.toBe("");
  });

  test.afterAll(async () => {
    await limpar();
  });

  test("AC-007.2: rolar 500 conversas não perde quadros de forma perceptível", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 800 });
    await login(page, creds.users.agent!.email, creds.password);
    await page.goto("/app/inbox?filter=all");
    await expect(page.locator("[data-conversation-id]").first()).toBeVisible({ timeout: 60_000 });

    const carregadas = await carregarAteTer(page, TOTAL);
    expect(carregadas).toBeGreaterThanOrEqual(TOTAL);

    const medida = await page.evaluate(async () => {
      const primeira = document.querySelector("[data-conversation-id]");
      let rolavel: HTMLElement | null = primeira?.parentElement ?? null;
      while (rolavel && !/(auto|scroll)/.test(getComputedStyle(rolavel).overflowY)) {
        rolavel = rolavel.parentElement;
      }
      if (!rolavel) return null;
      const alvo = rolavel;
      const intervalos: number[] = [];
      const DURACAO_MS = 4000;
      const PASSO_PX = 48;
      await new Promise<void>((resolver) => {
        let anterior = performance.now();
        const inicio = anterior;
        const quadro = (agora: number) => {
          intervalos.push(agora - anterior);
          anterior = agora;
          alvo.scrollTop += PASSO_PX;
          if (agora - inicio < DURACAO_MS) requestAnimationFrame(quadro);
          else resolver();
        };
        requestAnimationFrame(quadro);
      });
      return {
        intervalos,
        scrollTopFinal: alvo.scrollTop,
        alturaTotal: alvo.scrollHeight,
        linhas: document.querySelectorAll("[data-conversation-id]").length,
      };
    });
    expect(medida).not.toBeNull();
    if (!medida) return;

    // O primeiro intervalo mede o arranque, não a rolagem.
    const amostra = medida.intervalos.slice(1).sort((a, b) => a - b);
    expect(amostra.length).toBeGreaterThan(30);
    const p95 = amostra[Math.min(amostra.length - 1, Math.floor(amostra.length * 0.95))] ?? Infinity;
    const lentos = amostra.filter((ms) => ms > QUADRO_LENTO_MS).length;
    const fracaoLenta = lentos / amostra.length;
    test.info().annotations.push({
      type: "medida",
      description: `quadros=${amostra.length} p95=${p95.toFixed(1)}ms lentos(>${QUADRO_LENTO_MS}ms)=${lentos} linhas=${medida.linhas} scrollTop=${Math.round(medida.scrollTopFinal)}/${medida.alturaTotal}`,
    });

    expect(medida.scrollTopFinal).toBeGreaterThan(0);
    expect(p95).toBeLessThanOrEqual(P95_MAXIMO_MS);
    expect(fracaoLenta).toBeLessThanOrEqual(FRACAO_LENTA_MAXIMA);

    await page.screenshot({ path: path.join(EVIDENCIA, "desempenho-lista-500-depois-da-rolagem.png") });
  });

  test("AC-007.3: em 375x812 lista e conversa se alternam sem rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, creds.users.agent!.email, creds.password);

    const medirLargura = async (): Promise<{
      scrollWidth: number;
      clientWidth: number;
      passaDaBorda: string[];
    }> =>
      page.evaluate(() => {
        const largura = document.documentElement.clientWidth;
        const passaDaBorda: string[] = [];
        for (const el of Array.from(document.querySelectorAll("main *"))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > largura + 1) {
            passaDaBorda.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
            if (passaDaBorda.length >= 5) break;
          }
        }
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: largura,
          passaDaBorda,
        };
      });

    // Lista.
    await page.goto("/app/inbox?filter=all");
    await expect(page.locator("[data-conversation-id]").first()).toBeVisible({ timeout: 60_000 });
    const lista = await medirLargura();
    await page.screenshot({ path: path.join(EVIDENCIA, "celular-375-lista.png") });
    expect(lista.scrollWidth).toBeLessThanOrEqual(lista.clientWidth);
    expect(lista.passaDaBorda).toEqual([]);

    // Conversa aberta: a lista cede o lugar.
    await page.locator(`[data-conversation-id="${primeiraConversaId}"]`).click();
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
    const conversa = await medirLargura();
    await page.screenshot({ path: path.join(EVIDENCIA, "celular-375-conversa.png") });
    expect(conversa.scrollWidth).toBeLessThanOrEqual(conversa.clientWidth);
    expect(conversa.passaDaBorda).toEqual([]);
  });
});
