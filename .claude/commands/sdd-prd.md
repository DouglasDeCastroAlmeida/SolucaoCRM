---
description: Escreve o PRD (o quê e o porquê) com critérios de aceite verificáveis
argument-hint: "[mudança]"
---

# /sdd-prd — PRD

Mudança: $ARGUMENTS (vazio = a única mudança ativa). Siga as regras de `.claude/commands/sdd-flow.md`.

Pré-condição: a mudança está no estágio `prd` (`node .sdd/bin/sdd.mjs status`). Se não estiver, diga em que estágio está e qual comando vem antes.

## Escrever `01-prd.md`

- Fonte: `00-grill.md` (decisões e fora de escopo), constituição e specs vivas. Não invente requisito que o Grill não sustenta; se faltar informação, pergunte (uma pergunta por vez, com recomendação).
- **O quê e porquê**, nunca como implementar.
- Um bloco `### REQ-001: nome` por requisito, com história de usuário e critérios de aceite:
  - `- **AC-001.1** Dado <contexto>, quando <ação>, então <resultado observável>.`
  - ou EARS: `- **AC-001.2** QUANDO <evento> o sistema DEVE <resposta>.`
  - Cada critério testa **uma** coisa e tem resultado observável. Inclua caminhos de erro, permissão negada e limites decididos no Grill.
- Requisito não funcional que precisa de prova vira critério de aceite dentro de um REQ.
- Copie o fora de escopo do Grill e complete.

Remova todos os marcadores e valide:

```bash
node .sdd/bin/sdd.mjs validate <mudança>
```

## Fechar

Mostre a lista de requisitos e critérios de aceite em formato compacto e diga: **"Para aprovar e seguir, digite `/sdd-approve`."** Não aprove por conta própria.
