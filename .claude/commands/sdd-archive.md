---
description: Arquiva a mudança concluída, mescla as specs vivas e atualiza o CHANGELOG
argument-hint: "[mudança]"
---

# /sdd-archive — Arquivar

Mudança: $ARGUMENTS (vazio = a única mudança concluída). Siga as regras de `.claude/commands/sdd-flow.md`.

1. Confirme que a mudança está em `done` (`node .sdd/bin/sdd.mjs status`).
2. Mostre ao usuário as specs vivas que serão alteradas (arquivos em `specs/` da mudança) e rode:

```bash
node .sdd/bin/sdd.mjs archive <mudança>
```

3. Se der conflito de mescla (requisito ADICIONADO que já existe, MODIFICADO/REMOVIDO que não existe), corrija o delta da mudança e rode de novo. Nada é gravado quando há conflito.
4. Mostre o resultado: pasta do histórico, specs vivas atualizadas, entrada nova do `CHANGELOG.md`.
5. `.sdd/runs/` e `.sdd/.gate-state.json` já são ignorados pelo `.sdd/.gitignore`; o resto de `.sdd/` deve ser versionado.
6. Sugira o commit (sem executar, a menos que o usuário peça), por exemplo: `feat: <título> (sdd <id>)`.
