---
description: Quebra a mudança em tarefas test-led, rastreáveis e estimadas (com totalizador)
argument-hint: "[mudança]"
---

# /sdd-tasks — Tarefas

Mudança: $ARGUMENTS (vazio = a única mudança ativa). Siga as regras de `.claude/commands/sdd-flow.md`.

Pré-condição: estágio `tasks`.

## Escrever `03-tasks.md`

Fonte: critérios de aceite (Grill no porte S, PRD nos portes M/L) e o design (porte L).

- **Fatias verticais:** cada fatia entrega um comportamento observável de ponta a ponta (um ou poucos critérios de aceite), não uma camada técnica. A primeira fatia é o caminho mais fino que atravessa o sistema inteiro.
- **Teste antes:** em cada fatia, a tarefa `TEST-*` que referencia o critério vem antes da `IMPL` que a faz passar.
- **Formato obrigatório** (uma linha por tarefa):
  `- [ ] T-001 [P] [TIPO] Descrição (~20 min) {AC-001.1} deps: T-000`
- **Cobertura:** todo critério de aceite aparece em pelo menos uma tarefa `TEST-*`. Escolha a camada **mais baixa** que prova o critério (`.sdd/templates/testing-guide.md`); E2E só para jornadas críticas, porque é o teste mais caro de escrever, rodar e ler.
- **Agrupe em fatias** com títulos `### Fatia N: <comportamento>`: o `/sdd-implement` trabalha e revisa fatia por fatia.
- **Tamanho:** uma tarefa cabe numa sessão focada (até ~60 min). Maior que isso, divida.
- **[P]** só quando a tarefa não toca arquivos de outra tarefa [P] pendente e não depende de nenhuma.
- Inclua tarefas que a constituição e os perfis exigem (migração, auditoria, acessibilidade, smoke test, docs) e uma de `REFACTOR` no fechamento quando fizer sentido.

Valide e gere a estimativa:

```bash
node .sdd/bin/sdd.mjs validate <mudança>
node .sdd/bin/sdd.mjs estimate <mudança>
```

Cole a tabela da estimativa na seção `## Estimativa` do arquivo. Toda tabela de estimativa mostrada ao usuário termina na linha **TOTALIZADOR GERAL** (total de tarefas e tempo em horas e minutos).

## Fechar

Mostre a tabela com o totalizador e diga: **"Para aprovar e liberar a implementação, digite `/sdd-approve`."** Não aprove por conta própria.
