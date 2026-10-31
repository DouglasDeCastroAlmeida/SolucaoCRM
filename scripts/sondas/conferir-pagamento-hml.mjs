#!/usr/bin/env node
// Mudança 003 - confere, DEPOIS do pagamento de teste, o que o pagamento deixou na homologação.
/* eslint-disable no-console */
// Lado Asaas (sandbox, chave lida do arquivo de segredos em tempo de execução, só leitura):
//   A1 existe assinatura com externalReference = id da organização; A2 é ACTIVE;
//   A3 a primeira cobrança é PENDING, vence no fim do teste e não foi confirmada;
//   A4 há UMA só assinatura (por externalReference e pelo cliente).
// Lado banco da hml (service role, SÓ LEITURA, filtrado pelo id da organização de teste):
//   B1 a organização saiu da suspensão; B2 a linha de cobranca_assinaturas tem provedor, cliente e
//   assinatura preenchidos; B3 pagamento_inicial_pendente = false; B4 a assinatura do banco é a do Asaas.
// Imprime PASSOU/FALHOU por item (sem chave, token, e-mail ou ids completos). Exit 0 se tudo passou, 1 se não.
// Uso: node scripts/sondas/conferir-pagamento-hml.mjs [<organization_id>]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SEGREDOS = join(homedir(), ".secrets");
const NOME_DA_ORG = "[teste-003] Empresa Exemplo";
const BASE_ASAAS = "https://api-sandbox.asaas.com/v3";

function lerEnv(arquivo) {
  return Object.fromEntries(
    readFileSync(arquivo, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
  );
}

const chave = lerEnv(join(SEGREDOS, "asaas-sandbox.env")).ASAAS_API_KEY ?? "";
if (!chave.startsWith("$aact_hmlg_")) {
  console.error("Abortado: a chave não é de sandbox ($aact_hmlg_).");
  process.exit(2);
}
const sb = lerEnv(join(SEGREDOS, "supabase-hml.env"));

const resultados = [];
function item(id, descricao, passou, detalhe = "") {
  resultados.push(passou);
  console.log(`${passou ? "PASSOU" : "FALHOU"}  ${id} ${descricao}${detalhe ? ` (${detalhe})` : ""}`);
}
const curto = (v) => (typeof v === "string" && v.length > 8 ? `${v.slice(0, 4)}...${v.slice(-3)}` : String(v));

async function asaas(caminho) {
  const url = new URL(BASE_ASAAS + caminho);
  if (url.host !== "api-sandbox.asaas.com") throw new Error("host recusado");
  const r = await fetch(url, { headers: { access_token: chave, "User-Agent": "sonda-003-conferir" } });
  if (!r.ok) throw new Error(`Asaas ${r.status}`);
  return r.json();
}

async function banco(tabela, consulta) {
  const r = await fetch(`${sb.SUPABASE_URL}/rest/v1/${tabela}?${consulta}`, {
    headers: { apikey: sb.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${sb.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) throw new Error(`banco ${r.status}`);
  return r.json();
}

const diaSp = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

let orgId = process.argv[2] ?? null;
let org = null;
let linha = null;
try {
  if (!orgId) {
    const achadas = await banco("organizations", `select=id&display_name=eq.${encodeURIComponent(NOME_DA_ORG)}`);
    orgId = achadas[0]?.id ?? null;
  }
  if (!orgId) throw new Error("organização de teste não encontrada");
  org = (await banco("organizations", `select=id,status,brand_id&id=eq.${orgId}`))[0] ?? null;
  linha =
    (
      await banco(
        "cobranca_assinaturas",
        `select=provedor,modo,provedor_cliente_id,provedor_assinatura_id,pagamento_inicial_pendente,trial_ate,estado&organization_id=eq.${orgId}`,
      )
    )[0] ?? null;
} catch (e) {
  console.error(`Não consegui ler o banco da hml: ${e.message}`);
  process.exit(2);
}

// --- Asaas ---
let assinaturas = [];
try {
  assinaturas = (await asaas(`/subscriptions?externalReference=${encodeURIComponent(orgId)}&limit=100`)).data ?? [];
} catch (e) {
  console.log(`(Asaas não respondeu: ${e.message})`);
}
const sub = assinaturas[0] ?? null;
item("A1", "existe assinatura com externalReference = id da organização", assinaturas.length > 0 && sub.externalReference === orgId);
item("A2", "a assinatura está ACTIVE", sub?.status === "ACTIVE", sub ? `status ${sub.status}` : "sem assinatura");

const fimDoTeste = linha?.trial_ate ? diaSp(linha.trial_ate) : null;
let cobrancas = [];
if (sub) {
  try {
    cobrancas = (await asaas(`/subscriptions/${sub.id}/payments?limit=100`)).data ?? [];
  } catch (e) {
    console.log(`(cobranças não lidas: ${e.message})`);
  }
}
const primeira = [...cobrancas].sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0] ?? null;
item(
  "A3",
  "a primeira cobrança é PENDING, vence no fim do teste e não foi confirmada",
  Boolean(primeira) && primeira.status === "PENDING" && primeira.dueDate === fimDoTeste && !primeira.confirmedDate && !primeira.paymentDate,
  primeira ? `status ${primeira.status}, vence ${primeira.dueDate}, esperado ${fimDoTeste ?? "?"}` : "sem cobrança",
);

let doCliente = assinaturas;
if (sub?.customer) {
  try {
    doCliente = (await asaas(`/subscriptions?customer=${encodeURIComponent(sub.customer)}&limit=100`)).data ?? [];
  } catch {
    // a contagem por externalReference já vale
  }
}
item("A4", "há UMA só assinatura (por externalReference e pelo cliente)", assinaturas.length === 1 && doCliente.length === 1, `${assinaturas.length} / ${doCliente.length}`);

// --- banco da hml ---
item("B1", "a organização saiu da suspensão", org?.status === "active", org ? `status ${org.status}` : "organização não lida");
item(
  "B2",
  "a linha de cobranca_assinaturas tem provedor, cliente e assinatura preenchidos",
  Boolean(linha?.provedor && linha?.provedor_cliente_id && linha?.provedor_assinatura_id),
  linha ? `provedor ${linha.provedor ?? "-"}, modo ${linha.modo ?? "-"}, cliente ${linha.provedor_cliente_id ? "ok" : "-"}, assinatura ${linha.provedor_assinatura_id ? curto(linha.provedor_assinatura_id) : "-"}` : "sem linha",
);
item("B3", "pagamento_inicial_pendente = false", linha?.pagamento_inicial_pendente === false, `valor ${linha?.pagamento_inicial_pendente}`);
item("B4", "a assinatura gravada no banco é a do Asaas", Boolean(sub) && linha?.provedor_assinatura_id === sub.id);

const falhas = resultados.filter((r) => !r).length;
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} item(ns) FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
