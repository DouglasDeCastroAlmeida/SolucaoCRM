import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DICIONARIO } from "@/lib/i18n/dicionario";

/**
 * AC-009.5 (mudança 006): textos novos saem do dicionário, em pt-BR (a própria
 * chave), es e en, sem texto fixo de marca.
 *
 * O que o produto exige de cada idioma, medido:
 * - es: obrigatório. `i18n-espanhol-cobre-a-tela` reprova t() sem espanhol, mas
 *   só enxerga `t(` com o nome exato; aqui entram também os wrappers locais
 *   (`const t = (s) => traduzir(...)`) e os textos que viajam em tabela.
 * - en: o catálogo `traducoes/en.json` está em construção (registro.ts:
 *   `nivel: "em_construcao"`) — nenhuma tela o lê e frase sem inglês cai no
 *   português. Por isso en NÃO é exigido para todo texto de tela; é exigido
 *   para a ferramenta nova do catálogo MCP (única superfície que já o lê).
 */

const RAIZ = join(__dirname, "..", "..");

/** Os arquivos de interface, rota e e-mail criados ou alterados pela 006 (Fatias 4 a 7). */
const ARQUIVOS = [
  "app/api/v1/ai/agents/[id]/automatico/route.ts",
  "app/api/v1/mcp-acoes/[id]/route.ts",
  "app/api/v1/mcp-acoes/route.ts",
  "app/api/v1/mcp-servidores/[id]/atualizar-ferramentas/route.ts",
  "app/api/v1/mcp-servidores/[id]/ferramentas/route.ts",
  "app/api/v1/mcp-servidores/[id]/route.ts",
  "app/api/v1/mcp-servidores/route.ts",
  "app/app/ai/agents/[id]/_components/AgentOperation.tsx",
  "app/app/ai/agents/[id]/_components/ServidorExternoNoAtendimento.tsx",
  "app/app/ai/inbox/_components/AcoesMcpPendentes.tsx",
  "app/app/ai/inbox/_components/AgentInboxList.tsx",
  "app/app/ai/usage/_uso-por-agente.tsx",
  "app/app/ai/usage/page.tsx",
  "app/app/prospecting/_client.tsx",
  "app/app/settings/servidor-mcp-externo/_components/FerramentasDoServidor.tsx",
  "app/app/settings/servidor-mcp-externo/_components/ServidoresMcpExternos.tsx",
  "app/app/settings/servidor-mcp-externo/page.tsx",
  "lib/ai/orcamento/aviso-por-email-envio.ts",
  "lib/ai/orcamento/aviso-por-email.handler.ts",
  "lib/ai/orcamento/uso-por-agente.ts",
  "lib/mcp/servidor-externo/aprovacao.ts",
  "lib/mcp/servidor-externo/repositorio.ts",
  "lib/mcp/servidor-externo/quem-administra.ts",
  "lib/mcp/tools/tarefas.ts",
] as const;

// Chamada a t()/traduzir()/ts() com literal (aspas duplas, simples ou crase sem ${}) como 1o argumento.
const CHAMADA =
  /(?<![\w.])(?:t|ts|tt|tr|traduzir|traduzirEm)\(\s*(?:[a-zA-Z_.]+,\s*)?("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`$]*`)/g;

function chavesDe(arquivo: string): string[] {
  const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
  const achadas: string[] = [];
  for (const m of fonte.matchAll(CHAMADA)) {
    const bruto = m[1] ?? "";
    const corpo = bruto.slice(1, -1).replace(/\\(["'`])/g, "$1");
    achadas.push(corpo);
  }
  return achadas;
}

const EXPLICITAS_DO_EMAIL_DE_80 = [
  "O gasto com IA chegou a",
  "do limite",
  "Neste mês a IA já gastou",
  "de um limite de",
  "Ao chegar em 100%, a IA para de responder e as conversas passam para uma pessoa da equipe. Os valores são estimativas e podem incluir modelos sem preço conhecido. Se quiser, aumente o limite antes disso.",
  "Você recebe este aviso porque administra esta empresa.",
  "Ver o uso de IA",
];

describe("AC-009.5: textos novos da 006 saem do dicionário", () => {
  it("AC-009.5: a varredura enxerga chamadas de tradução nos arquivos (não é vacuidade)", () => {
    const total = ARQUIVOS.flatMap(chavesDe).length;
    expect(total).toBeGreaterThan(50);
  });

  it("AC-009.5: todo literal passado a t()/traduzir() nos arquivos da 006 tem espanhol", () => {
    const sem = ARQUIVOS.flatMap((a) =>
      chavesDe(a)
        .filter((k) => !DICIONARIO[k]?.es)
        .map((k) => `${a} → ${k.slice(0, 90)}`),
    );
    expect(sem).toEqual([]);
  });

  it("AC-009.5: o e-mail de aviso de 80% do orçamento tem espanhol em cada frase", () => {
    const sem = EXPLICITAS_DO_EMAIL_DE_80.filter((k) => !DICIONARIO[k]?.es);
    expect(sem).toEqual([]);
  });

  it("AC-009.5: os títulos novos da Central (passagem por erro de ferramenta, serviço de IA e teto) têm espanhol", () => {
    const titulos = [
      "O assistente travou numa ferramenta — assumir a conversa",
      "O serviço de IA falhou — assumir a conversa",
      "Teto de gasto com IA atingido — assumir a conversa",
    ];
    expect(titulos.filter((k) => !DICIONARIO[k]?.es)).toEqual([]);
  });

  it("AC-009.5: a Central grava o título explícito da passagem no idioma da organização", () => {
    const fonte = readFileSync(join(RAIZ, "lib/agent-engine/agent/human-handoff.ts"), "utf8");
    expect(fonte).toMatch(/traduzir\(\s*opts\.inboxTitle\s*,/);
  });

  it("AC-009.5: a ferramenta crm_create_task do catálogo tem espanhol e inglês", () => {
    const en = JSON.parse(
      readFileSync(join(RAIZ, "lib", "i18n", "traducoes", "en.json"), "utf8"),
    ) as Record<string, string>;
    const textos = [
      "Criar tarefa para a equipe",
      "Deixa um lembrete de trabalho para a equipe, ligado ao cliente da conversa — por exemplo, ligar amanhã ou enviar o contrato. O cliente não recebe nada, e pedir a mesma tarefa de novo não cria outra igual.",
      "Tarefas da equipe",
    ];
    expect(textos.filter((k) => !DICIONARIO[k]?.es)).toEqual([]);
    expect(textos.filter((k) => !en[k])).toEqual([]);
  });
});
