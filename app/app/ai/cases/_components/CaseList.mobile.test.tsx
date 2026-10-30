import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("009 leva 2: alvos de toque e Casos no celular", () => {
  it("AC-004.2: Casos mostra lista OU painel abaixo de md, com volta para a lista", () => {
    const fonte = ler("app/app/ai/cases/_components/CaseList.tsx");
    expect(fonte).toContain('selectedId === null ? "flex" : "hidden md:flex"');
    expect(fonte).toContain('selectedId === null ? "hidden md:block" : "block"');
    expect(fonte).toContain('t("Voltar aos casos")');
  });

  it("AC-004.2: Tarefas, Fluxos e Central dão 44 px de alvo no celular e mantêm o tamanho de sm", () => {
    const tarefas = ler("app/app/tasks/_components/ListaDeTarefas.tsx");
    expect(tarefas).not.toContain('className="h-7 w-7"');
    expect(tarefas).toContain("h-11 w-11 sm:h-7 sm:w-7");
    const fluxos = ler("app/app/ai/followups/_components/FlowsList.tsx");
    expect(fluxos).toContain("max-sm:[&_button]:min-h-11");
    const central = ler("app/app/ai/inbox/_components/AgentInboxList.tsx");
    expect((central.match(/max-sm:min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
