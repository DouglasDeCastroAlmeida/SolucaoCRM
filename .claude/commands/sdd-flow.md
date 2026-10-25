---
name: sdd-flow
description: Regras da esteira de Spec-Driven Development (SDD) do projeto. Use sempre que o projeto tiver a pasta .sdd/ e o usuário pedir uma feature, correção, refatoração ou qualquer mudança de comportamento; quando pedir para especificar, levantar requisitos, desenhar arquitetura, quebrar tarefas ou estimar; e quando um comando /sdd-* estiver em andamento.
---

# Esteira SDD

Mudanças de comportamento seguem um fluxo com artefatos em disco e aprovação humana entre as etapas. O objetivo é que o código implemente exatamente o que foi combinado, com prova.

## Regra de ouro

Não escreva código de produção sem uma mudança em `implement` (ou `verify`). Pedido direto para codificar num projeto com `.sdd/`: explique em uma frase e abra a mudança com o fluxo do `/sdd-new` (porte S existe justamente para coisas pequenas). O hook do plugin bloqueia edições fora disso; não tente contorná-lo (por exemplo, escrevendo arquivos via shell).

Fora do escopo da esteira (não precisa de mudança): dúvidas e explicações, leitura de código, docs, ajustes em `.sdd/`, experimentos descartáveis que o usuário pediu explicitamente fora da esteira.

## Fluxo

| Porte | Etapas |
| :-- | :-- |
| S | grill → tasks → implement → verify → done |
| M | grill → prd → tasks → implement → verify → done |
| L | grill → prd → design → tasks → implement → verify → done |

Comandos: `/sdd-init`, `/sdd-new`, `/sdd-grill`, `/sdd-prd`, `/sdd-design`, `/sdd-tasks`, `/sdd-implement`, `/sdd-verify`, `/sdd-approve` (só o usuário), `/sdd-archive`, `/sdd-status`.

Estrutura no projeto:

```
.sdd/
  constitution.md        regras invioláveis do projeto
  config.json            comandos de teste/lint, gate, pisos de estimativa
  specs/<capacidade>.md  specs vivas: como o sistema se comporta hoje
  changes/NNN-slug/      mudanças em andamento (00-grill, 01-prd, 02-design, 03-tasks, 04-verify, specs/)
  archive/               mudanças concluídas
  bin/sdd.mjs            CLI (validate, approve, estimate, trace, archive, status)
  templates/             templates, perfis e guia de testes (customizáveis por projeto)
  runs/                  saída completa do último "sdd run" de cada comando (fora do git)
```

## Regras de cada etapa

- **Aprovação é humana.** Ao terminar uma etapa, valide (`node .sdd/bin/sdd.mjs validate`), resuma e peça ao usuário que digite `/sdd-approve`. Nunca rode `approve` por conta própria, nunca use `--force`, nunca edite `meta.json`.
- **Uma pergunta por vez, com recomendação.** O que o código responde, descubra em vez de perguntar.
- **Constituição manda.** Conflito entre pedido e `.sdd/constitution.md`: pare e pergunte.
- **Specs vivas são a verdade do comportamento atual.** Leia as capacidades afetadas antes de propor algo.
- **IDs rastreáveis.** Requisitos `REQ-001`, critérios `AC-001.1`, tarefas `T-001`, decisões `D-01`, ADRs `ADR-001`. Testes citam o ID literal do critério, que é o que `sdd trace` procura: no nome (`it('AC-001.1: ...')`) ou, em linguagens onde o nome não aceita `-` e `.`, num comentário ou docstring do teste (`"""AC-001.1: ..."""`).
- **Test-led.** Para cada critério: teste falhando, mínimo para passar, refatorar com tudo verde. Regras de qualidade de teste em `.sdd/templates/testing-guide.md`.
- **Perfis adotados** (seção "Perfis adotados" da constituição) valem como regra: componentes, ícones, acessibilidade, camadas, resiliência, infra. O que o projeto já usa prevalece sobre o perfil; divergência vira decisão registrada.
- **Economia de tokens.** Rode testes, lint e typecheck por `node .sdd/bin/sdd.mjs run <comando>` (resume a saída; log completo em `.sdd/runs/`). Use `run testFocused <arquivos>` no TDD e a suíte completa só no fechamento da fatia. Passe aos subagentes trechos, não documentos inteiros. Navegador por MCP só para depurar.
- **Sem desvio de escopo.** Precisou de algo fora da spec: pare, explique, atualize o artefato com o usuário e só então continue.
- **Evidência antes de afirmar.** "Pronto", "passa", "corrigido" só depois de rodar o comando nesta sessão e mostrar a saída.
- **Estimativas sempre com TOTALIZADOR GERAL** (total de tarefas e tempo em horas e minutos) na última linha, no chat e nos arquivos.
- **Segredos nunca** em spec, código, log ou commit.

## Subagentes

- `sdd-implementer`: executa uma fatia (ou tarefa) com TDD, em contexto isolado.
- `sdd-reviewer`: revisa em duas etapas (conformidade com a spec, depois qualidade de código e testes), por fatia, tarefa ou mudança conforme `review.mode`.
- `sdd-auditor`: verificação final da mudança com evidências.

O contexto principal orquestra; o trabalho pesado vai para os subagentes.
