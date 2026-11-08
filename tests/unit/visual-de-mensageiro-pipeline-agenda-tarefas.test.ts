import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Visual de mensageiro (#92): Pipeline, Agenda e Tarefas.
 * Só apresentação: aqui se trava a cor por token e o canto arredondado; o
 * comportamento (arrastar, marcar, remarcar) é coberto pelos testes de cada tela.
 */
const RAIZ = process.cwd();
const PASTAS = [
  "components/kanban",
  "components/agenda",
  "app/app/kanban",
  "app/app/pipelines",
  "app/app/agenda",
  "app/app/tasks",
];

function arquivos(dir: string): string[] {
  return readdirSync(join(RAIZ, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) return arquivos(rel);
    return /\.(tsx|ts)$/.test(n) && !/\.test\./.test(n) ? [rel] : [];
  });
}
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
/** Código sem comentários de linha/bloco (cores citadas em prosa não contam). */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CRUA =
  /#[0-9a-fA-F]{6}\b|\b(?:bg|text|border|ring|from|to|fill|stroke|divide|outline)-(?:red|green|blue|gray|slate|zinc|neutral|stone|yellow|amber|orange|emerald|white|black)(?:-\d+)?\b/;

describe("visual de mensageiro: Pipeline, Agenda e Tarefas (#92)", () => {
  it("nenhuma cor crua (hex ou paleta do Tailwind) nas três áreas", () => {
    const achados = PASTAS.flatMap(arquivos).filter((f) => CRUA.test(semComentarios(ler(f))));
    expect(achados).toEqual([]);
  });

  it("cartão do negócio e coluna do quadro têm canto grande", () => {
    expect(ler("components/kanban/KanbanCard.tsx")).toContain(
      "group relative overflow-hidden rounded-xl border border-border bg-surface",
    );
    const col = ler("components/kanban/StageColumn.tsx");
    expect(col).toContain("flex-col rounded-xl border border-border");
    expect(col).toContain("rounded-t-xl");
    expect(col).not.toContain("rounded-t-lg");
  });

  it("quadro de carregamento acompanha o canto da coluna", () => {
    expect(ler("components/kanban/KanbanBoard.tsx")).toContain("rounded-xl border border-border");
  });

  it("grade da agenda e seus blocos são arredondados", () => {
    const g = ler("components/agenda/GradeDaAgenda.tsx");
    expect(g).toContain("overflow-hidden rounded-xl border border-border bg-surface");
    expect(g).toContain("items-start overflow-hidden rounded-md px-1.5");
  });

  it("aviso de negócio duplicado usa os tokens de alerta", () => {
    expect(ler("components/kanban/NewLeadDialog.tsx")).toContain(
      "rounded-lg border border-warning/35 bg-warning-bg p-3 text-sm text-warning-fg",
    );
  });

  it("prioridade alta das tarefas usa o token de alerta", () => {
    expect(ler("app/app/tasks/_components/ListaDeTarefas.tsx")).toContain(
      'high: "bg-warning-bg text-warning-fg"',
    );
  });
});
