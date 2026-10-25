---
description: Verifica a entrega contra as specs com evidências, rastreabilidade, revisão e segurança
argument-hint: "[mudança]"
---

# /sdd-verify — Verificação

Mudança: $ARGUMENTS (vazio = a única mudança ativa). Siga as regras de `.claude/commands/sdd-flow.md`.

Pré-condição: estágio `verify`.

## Executar

1. Chame o subagente `sdd-auditor` com o caminho da mudança. Ele roda os comandos de verificação pelo resumidor (`sdd run`), confere cobertura, gera a matriz de rastreabilidade, revisa testes, segurança e desvios de escopo e devolve um parecer com evidências.
   - Porte L, ou mudança em autenticação, autorização, pagamentos ou dados sensíveis: sugira ao usuário rodar também o `/security-review` nativo do Claude Code.
2. Se houver achados bloqueantes, corrija (pequenas correções podem ser feitas aqui; o gate permite edição no estágio `verify`) e rode o auditor de novo.
3. **Specs vivas** (portes M e L): para cada capacidade afetada, escreva `specs/<capacidade>.md` dentro da pasta da mudança descrevendo o comportamento **como foi entregue**, no formato de `.sdd/templates/spec-delta.md` (seções ADICIONADOS, MODIFICADOS, REMOVIDOS; blocos `### Requisito: nome`). Para MODIFICADOS e REMOVIDOS, use o nome exato que já existe em `.sdd/specs/<capacidade>.md`.
4. Preencha `04-verify.md` com o resultado do auditor: evidências (uma linha de resumo por comando; nada de colar a saída inteira), rastreabilidade (`node .sdd/bin/sdd.mjs trace`), revisão, segurança, desvios, specs vivas e parecer **APROVADO** ou **REPROVADO**.

```bash
node .sdd/bin/sdd.mjs validate <mudança>
```

## Fechar

Mostre o parecer e a matriz e diga: **"Para concluir a mudança, digite `/sdd-approve`. Depois, `/sdd-archive`."** Nunca declare pronto sem evidência executada nesta sessão.
