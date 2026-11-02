#!/usr/bin/env node
// Mudança 003 (T-041, AC-002.4 e AC-010.5) - sonda de produção da cobrança com trial no cartão.
/* eslint-disable no-console */
// SÓ LÊ. Confere que, com todas as marcas desligadas, a produção está como estava antes:
//   P1 "/" responde 200; P2 "/app" responde 307 (CLAUDE.md, seção Deploy); P3 /api/v1/health responde 200.
// Se houver chave de leitura (variável de ambiente, nunca impressa), confere também no banco:
//   B1 nenhuma marca com cobranca_ligada = true;
//   B2 nenhuma organização suspensa por cobrança (suspended_kind = 'cobranca');
//   B3 nenhuma assinatura criada em estado de cobrança (trial_com_cartao = true);
//   B4 o número de organizações não diminuiu em relação à linha de base (se a base trouxer o número).
// A linha de base é um JSON: {"marcas_ligadas":0,"suspensas_cobranca":0,"assinaturas_trial_com_cartao":0,
// "organizacoes_total":N}. Campo ausente = 0 (zero), exceto organizacoes_total (ausente = não confere).
// Uso (bash):
//   SONDA_URL_PRODUCAO=https://meudominio.com.br \
//   SONDA_SUPABASE_URL=https://xxxx.supabase.co SONDA_CHAVE_LEITURA=<chave> \
//   SONDA_LINHA_DE_BASE_ARQUIVO=base.json   (ou SONDA_LINHA_DE_BASE com o JSON) \
//   node scripts/sondas/sonda-producao-cobranca.mjs
// Exit 0 se tudo passou, 1 se algo falhou, 2 se faltou configuração.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Normaliza a linha de base: contagens ausentes valem 0; organizacoes_total ausente fica null. */
export function lerLinhaDeBase(bruto) {
  const b = bruto && typeof bruto === "object" ? bruto : {};
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    marcas_ligadas: n(b.marcas_ligadas),
    suspensas_cobranca: n(b.suspensas_cobranca),
    assinaturas_trial_com_cartao: n(b.assinaturas_trial_com_cartao),
    organizacoes_total: Number.isInteger(b.organizacoes_total) && b.organizacoes_total >= 0 ? b.organizacoes_total : null,
  };
}

/** Compara o medido com a base. Devolve itens {id, descricao, passou, detalhe}. Função pura. */
export function compararComBase(medido, baseBruta) {
  const base = lerLinhaDeBase(baseBruta);
  const itens = [
    { id: "B1", descricao: "nenhuma marca com a cobrança ligada", passou: medido.marcas_ligadas === base.marcas_ligadas, detalhe: `${medido.marcas_ligadas} (base ${base.marcas_ligadas})` },
    { id: "B2", descricao: "nenhuma organização suspensa por cobrança", passou: medido.suspensas_cobranca === base.suspensas_cobranca, detalhe: `${medido.suspensas_cobranca} (base ${base.suspensas_cobranca})` },
    { id: "B3", descricao: "nenhuma assinatura criada em estado de cobrança (teste com cartão)", passou: medido.assinaturas_trial_com_cartao === base.assinaturas_trial_com_cartao, detalhe: `${medido.assinaturas_trial_com_cartao} (base ${base.assinaturas_trial_com_cartao})` },
  ];
  if (base.organizacoes_total !== null) {
    itens.push({ id: "B4", descricao: "o número de organizações não diminuiu", passou: medido.organizacoes_total >= base.organizacoes_total, detalhe: `${medido.organizacoes_total} (base ${base.organizacoes_total})` });
  }
  return itens;
}

/** Confere o lado HTTP. `buscar` é o fetch (injetado). Não segue redirecionamento: o 307 é o sinal. */
export async function conferirSite(urlBase, buscar) {
  const base = String(urlBase).replace(/\/+$/, "");
  const alvos = [
    ["P1", "a página inicial '/' responde 200", "/", 200],
    ["P2", "'/app' responde 307 (redireciona para o login)", "/app", 307],
    ["P3", "/api/v1/health responde 200", "/api/v1/health", 200],
  ];
  const itens = [];
  for (const [id, descricao, caminho, esperado] of alvos) {
    let status = null;
    try {
      status = (await buscar(base + caminho, { redirect: "manual", method: "GET" })).status;
    } catch {
      status = null;
    }
    itens.push({ id, descricao, passou: status === esperado, detalhe: status === null ? "sem resposta" : `status ${status}, esperado ${esperado}` });
  }
  return itens;
}

/** Lê as quatro contagens do banco (só GET, count=exact). `buscar` injetado. */
export async function medirBanco(urlBanco, chave, buscar) {
  const raiz = String(urlBanco).replace(/\/+$/, "");
  async function contar(tabela, filtro) {
    const r = await buscar(`${raiz}/rest/v1/${tabela}?select=id&limit=1${filtro ? `&${filtro}` : ""}`, {
      method: "GET",
      headers: { apikey: chave, authorization: `Bearer ${chave}`, prefer: "count=exact" },
    });
    if (!r.ok) throw new Error(`banco ${r.status} em ${tabela}`);
    const total = /\/(\d+)$/.exec(r.headers.get("content-range") ?? "")?.[1];
    if (total === undefined) throw new Error(`banco sem contagem em ${tabela}`);
    return Number(total);
  }
  return {
    marcas_ligadas: await contar("brands", "cobranca_ligada=eq.true"),
    suspensas_cobranca: await contar("organizations", "suspended_kind=eq.cobranca"),
    assinaturas_trial_com_cartao: await contar("cobranca_assinaturas", "trial_com_cartao=eq.true"),
    organizacoes_total: await contar("organizations", ""),
  };
}

function baseDoAmbiente(env) {
  if (env.SONDA_LINHA_DE_BASE_ARQUIVO) return JSON.parse(readFileSync(env.SONDA_LINHA_DE_BASE_ARQUIVO, "utf8"));
  if (env.SONDA_LINHA_DE_BASE) return JSON.parse(env.SONDA_LINHA_DE_BASE);
  return {};
}

/** Roda tudo e devolve os itens. Nunca imprime segredo. */
export async function rodar(env, buscar) {
  const itens = await conferirSite(env.SONDA_URL_PRODUCAO, buscar);
  if (env.SONDA_SUPABASE_URL && env.SONDA_CHAVE_LEITURA) {
    try {
      const medido = await medirBanco(env.SONDA_SUPABASE_URL, env.SONDA_CHAVE_LEITURA, buscar);
      itens.push(...compararComBase(medido, baseDoAmbiente(env)));
    } catch (e) {
      itens.push({ id: "B0", descricao: "ler o banco de produção", passou: false, detalhe: String(e.message).split(env.SONDA_CHAVE_LEITURA).join("***") });
    }
  } else {
    console.log("(sem SONDA_SUPABASE_URL e SONDA_CHAVE_LEITURA: só a parte do site foi conferida)");
  }
  return itens;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.SONDA_URL_PRODUCAO) {
    console.error("Abortado: defina SONDA_URL_PRODUCAO (o endereço https da produção).");
    process.exit(2);
  }
  const itens = await rodar(process.env, fetch);
  for (const i of itens) console.log(`${i.passou ? "PASSOU" : "FALHOU"}  ${i.id} ${i.descricao}${i.detalhe ? ` (${i.detalhe})` : ""}`);
  const falhas = itens.filter((i) => !i.passou).length;
  console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} item(ns) FALHOU`);
  process.exit(falhas === 0 ? 0 : 1);
}
