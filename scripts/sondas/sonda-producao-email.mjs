#!/usr/bin/env node
// Mudança 005 (T-045, AC-009.4) - sonda de produção do canal de e-mail.
/* eslint-disable no-console */
// SÓ LÊ. Confere que, sem nenhuma caixa de e-mail conectada, a produção está como estava antes:
//   P1 "/" responde 200; P2 "/app" responde 307 (CLAUDE.md, seção Deploy); P3 /api/v1/health responde 200;
//   E1 nenhuma caixa de e-mail (channel_sessions.provider = 'email');  E2 nenhuma conversa de e-mail;
//   E3 nenhum e-mail ignorado;  E4 os outros canais ativos não mudaram;  E5 nenhuma organização sumiu;
//   E6 o worker não abriu NENHUMA conexão de e-mail desde o deploy.
// As medições do banco e do log vêm de um JSON gerado por scripts/sondas/medir-producao-email.sh (que lê
// pela VPS, só SELECT e grep no log). Medição ausente ou inválida REPROVA: nunca passa em silêncio.
// A linha de base é um JSON opcional: {"canais_ativos_nao_email":N,"organizacoes_total":N}.
// Uso:
//   SONDA_URL_PRODUCAO=https://app.corretora.io SONDA_MEDIDO_ARQUIVO=medido.json \
//   SONDA_LINHA_DE_BASE_ARQUIVO=base.json node scripts/sondas/sonda-producao-email.mjs
// Exit 0 se tudo passou, 1 se algo falhou, 2 se faltou configuração.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const inteiro = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const exato = (v, esperado) => ({
  passou: inteiro(v) === esperado,
  detalhe: inteiro(v) === null ? "sem medição" : `${v} (esperado ${esperado})`,
});

/** Compara o medido com a base. Função pura; devolve itens {id, descricao, passou, detalhe}. */
export function compararComBase(medido, base = {}) {
  const m = medido && typeof medido === "object" ? medido : {};
  const b = base && typeof base === "object" ? base : {};
  const itens = [
    { id: "E1", descricao: "nenhuma caixa de e-mail conectada", ...exato(m.caixas_email, 0) },
    { id: "E2", descricao: "nenhuma conversa de e-mail", ...exato(m.conversas_email, 0) },
    {
      id: "E3",
      descricao: "nenhum e-mail ignorado nem remetente marcado 'não é cliente'",
      ...(inteiro(m.ignorados) === 0 && inteiro(m.remetentes_ignorados) === 0
        ? { passou: true, detalhe: "0 e 0" }
        : { passou: false, detalhe: `ignorados ${m.ignorados ?? "?"}, remetentes ${m.remetentes_ignorados ?? "?"}` }),
    },
  ];
  const baseCanais = inteiro(b.canais_ativos_nao_email);
  const canais = inteiro(m.canais_ativos_nao_email);
  itens.push({
    id: "E4",
    descricao: "os canais ativos que não são e-mail continuam os mesmos",
    passou: baseCanais === null ? canais !== null : canais === baseCanais,
    detalhe: `${canais ?? "sem medição"} (${baseCanais === null ? "sem base" : `base ${baseCanais}`})`,
  });
  const baseOrgs = inteiro(b.organizacoes_total);
  if (baseOrgs !== null) {
    const n = inteiro(m.organizacoes_total);
    itens.push({
      id: "E5",
      descricao: "o número de organizações não diminuiu",
      passou: n !== null && n >= baseOrgs,
      detalhe: `${n ?? "sem medição"} (base ${baseOrgs})`,
    });
  }
  itens.push({
    id: "E6",
    descricao: "o worker não abriu nenhuma conexão de e-mail desde o deploy",
    ...exato(m.conexoes_de_email_no_worker, 0),
  });
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
    itens.push({
      id,
      descricao,
      passou: status === esperado,
      detalhe: status === null ? "sem resposta" : `status ${status}, esperado ${esperado}`,
    });
  }
  return itens;
}

const lerJson = (arquivo) => JSON.parse(readFileSync(arquivo, "utf8"));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  if (!env.SONDA_URL_PRODUCAO || !env.SONDA_MEDIDO_ARQUIVO) {
    console.error("Abortado: defina SONDA_URL_PRODUCAO (https da produção) e SONDA_MEDIDO_ARQUIVO (JSON do medir-producao-email.sh).");
    process.exit(2);
  }
  const itens = await conferirSite(env.SONDA_URL_PRODUCAO, fetch);
  let medido = {};
  try {
    medido = lerJson(env.SONDA_MEDIDO_ARQUIVO);
  } catch {
    itens.push({ id: "E0", descricao: "ler o JSON das medições", passou: false, detalhe: "arquivo ausente ou inválido" });
  }
  const base = env.SONDA_LINHA_DE_BASE_ARQUIVO ? lerJson(env.SONDA_LINHA_DE_BASE_ARQUIVO) : {};
  itens.push(...compararComBase(medido, base));
  for (const i of itens) console.log(`${i.passou ? "PASSOU" : "FALHOU"}  ${i.id} ${i.descricao}${i.detalhe ? ` (${i.detalhe})` : ""}`);
  const falhas = itens.filter((i) => !i.passou).length;
  console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} item(ns) FALHOU`);
  process.exit(falhas === 0 ? 0 : 1);
}
