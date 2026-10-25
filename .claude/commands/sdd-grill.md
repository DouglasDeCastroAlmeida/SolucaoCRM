---
description: Interrogatório técnico (Grill) da mudança antes de requisitos ou código, uma pergunta por vez
argument-hint: "[mudança]"
---

# /sdd-grill — Grill

Mudança: $ARGUMENTS (vazio = a única mudança ativa). Siga as regras de `.claude/commands/sdd-flow.md`.

Você é um arquiteto cético. O objetivo é chegar a um entendimento compartilhado e sem ambiguidade **antes** de escrever requisitos. Não escreva código.

## Preparar (uma vez)

1. Rode `node .sdd/bin/sdd.mjs path <mudança>` e abra `00-grill.md`.
2. Registre o pedido original e o que você levantou no código, na constituição e nas specs vivas.
3. Monte, só para você, a lista de dúvidas que mudam o que será construído. Cubra os 5 eixos (necessidade e valor, falhas e timeouts, concorrência e idempotência, segurança e permissões, rollback em menos de 2 minutos) e o que for do domínio (dados pessoais e LGPD, multi-tenant, dinheiro, integrações).
4. O que o código, a constituição ou as specs vivas respondem, **não pergunte**: registre como pergunta respondida com `- Fonte:` (arquivo e o que ele diz).

## Perguntar: UMA por turno

Cada pergunta ao usuário segue este ciclo:

1. Grave no arquivo:
   ```markdown
   ### P1. Pergunta objetiva
   - Recomendação do agente: o que você faria e por quê
   - Resposta: PENDENTE
   ```
2. Mostre ao usuário **só essa pergunta**, com a sua recomendação e as alternativas relevantes, e **encerre a sua resposta**. Não faça a próxima pergunta no mesmo turno, não avance para decisões e não preencha a resposta com a sua recomendação.
3. Quando o usuário responder, troque `PENDENTE` pelas palavras dele (ou "aceita a recomendação" se ele concordar) e faça a próxima pergunta, considerando o que a resposta abriu ou fechou.

Ordem: primeiro as perguntas das quais outras dependem. Pare quando não restar ambiguidade que mude o que será construído; não estique por estica. Se o usuário disser explicitamente que aceita todas as recomendações restantes, registre em cada uma `Resposta: aceita a recomendação (aceite em lote pelo usuário)`.

O gate do Grill **bloqueia a aprovação** enquanto houver pergunta com resposta vazia, `PENDENTE` ou "a confirmar".

## Fechar o Grill

Com todas as perguntas respondidas:

1. Preencha `## Decisões` (`- **D-01** ...`), `## Fora de escopo` e `## Riscos e premissas`. Porte S: escreva também os critérios de aceite (`- **AC-001.1** Dado ..., quando ..., então ...`).
2. Remova todos os marcadores `<!-- PREENCHA -->` e rode:

```bash
node .sdd/bin/sdd.mjs validate <mudança>
```

3. Corrija até não haver erros.
4. Mostre um resumo das decisões e do que ficou fora de escopo e diga: **"Para aprovar e seguir, digite `/sdd-approve`."** Não aprove por conta própria.
