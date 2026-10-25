---
description: Mostra o estado das mudanças SDD, gates e progresso com totalizador
argument-hint: "[mudança]"
---

# /sdd-status — Status

Rode:

```bash
node .sdd/bin/sdd.mjs status $ARGUMENTS
```

Para cada mudança ativa, mostre ao usuário: estágio atual, o que falta para o gate (rode `validate` se houver erros e liste-os) e o próximo comando da esteira. Se houver tarefas, inclua a tabela de `node .sdd/bin/sdd.mjs estimate <mudança>` com a linha **TOTALIZADOR GERAL**.

Próximo comando por estágio: `grill` → /sdd-grill · `prd` → /sdd-prd · `design` → /sdd-design · `tasks` → /sdd-tasks · `implement` → /sdd-implement · `verify` → /sdd-verify · `done` → /sdd-archive.
