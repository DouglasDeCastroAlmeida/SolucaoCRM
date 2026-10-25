---
description: Aprovação humana do estágio atual (só o usuário invoca)
argument-hint: "[mudança] [observação]"
disable-model-invocation: true
---

# /sdd-approve — Aprovação humana

O usuário digitou `/sdd-approve`: esta é a aprovação explícita do estágio atual. Argumentos: $ARGUMENTS

1. Rode a aprovação **uma única vez**. O hook só a permite quando o último turno do usuário é `/sdd-approve`, e cada `/sdd-approve` vale para um estágio:

```bash
node .sdd/bin/sdd.mjs approve <mudança se informada> --note "<observação do usuário, se houver>"
```

2. Se o gate bloquear por erros nos artefatos, mostre os erros, corrija e peça ao usuário para revisar e digitar `/sdd-approve` de novo. **Não** use `--force`; só o usuário pode decidir isso, no terminal dele.
3. Se avançar, diga o novo estágio e siga direto para o comando dele (`/sdd-prd`, `/sdd-design`, `/sdd-tasks`, `/sdd-implement`, `/sdd-verify`) ou, em `done`, sugira `/sdd-archive`. Ao terminar a etapa seguinte, peça uma nova aprovação; nunca aprove duas etapas seguidas.
