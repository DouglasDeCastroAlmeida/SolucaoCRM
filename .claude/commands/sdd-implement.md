---
description: Implementa as tarefas aprovadas com subagentes (TDD + revisão em duas etapas), por fatia
argument-hint: "[mudança] [T-001..T-00N]"
---

# /sdd-implement — Implementação

Argumentos: $ARGUMENTS (mudança e, opcionalmente, quais tarefas). Siga as regras de `.claude/commands/sdd-flow.md`.

Pré-condição: estágio `implement`. Fora dele, o hook bloqueia edição de código de produção: diga ao usuário em que estágio está e qual comando falta.

Você é o **orquestrador**: não implemente no seu próprio contexto. Delegue, e passe aos subagentes só o necessário (linhas das tarefas, texto dos critérios, trechos do design), não os documentos inteiros.

## Unidade de trabalho: a fatia

Uma fatia é um grupo `### Fatia N` de `03-tasks.md` (testes + implementação de um ou poucos critérios). Veja o modo de revisão em `node .sdd/bin/sdd.mjs status` (linha "Revisão"), definido por `.sdd/config.json > review.mode`:

| Modo | Padrão para | Revisão |
| :-- | :-- | :-- |
| `final` | porte S | uma revisão de toda a mudança no fim |
| `per-slice` | portes M e L | uma revisão por fatia |
| `per-task` | escolha explícita (alto risco) | uma revisão por tarefa |

## Para cada fatia, na ordem do arquivo (respeitando `deps`)

1. **Executor:** chame `sdd-implementer` com a pasta da mudança, as linhas das tarefas da fatia, o texto completo dos critérios cobertos e os trechos relevantes do design/constituição/perfis.
2. **Revisor** (conforme o modo): chame `sdd-reviewer` com os IDs das tarefas, os critérios e o comando do diff (`git diff` dos arquivos alterados).
3. **Correção:** se o revisor reprovar, devolva os achados ao `sdd-implementer` e revise de novo. Após 2 ciclos sem aprovação, pare e mostre o impasse ao usuário.
4. **Concluir:** com testes verdes (e revisão aprovada, quando houver), marque `- [x]` nas tarefas da fatia em `03-tasks.md`.

Fatias cujas tarefas são `[P]`, sem dependência pendente entre si e sem arquivos em comum, podem ter executores em paralelo (várias chamadas na mesma mensagem). Na dúvida, sequencial.

## Desvios

Se uma tarefa exigir algo fora da spec (novo endpoint, mudança de contrato, refatoração grande), **pare**. Explique ao usuário e proponha atualizar o artefato correspondente (PRD/design/tasks) antes de continuar.

## Fechar

Rode a suíte pelo resumidor: `node .sdd/bin/sdd.mjs run test` (e `lint`, `typecheck`). Mostre as linhas de resumo, o progresso com `node .sdd/bin/sdd.mjs estimate` (com o **TOTALIZADOR GERAL**) e diga: **"Para aprovar a implementação e seguir para a verificação, digite `/sdd-approve`."**
