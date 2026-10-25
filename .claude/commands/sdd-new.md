---
description: Abre uma nova mudança SDD, define o porte (S/M/L) e começa o Grill
argument-hint: "<descrição do que você quer construir ou mudar>"
---

# /sdd-new — Nova mudança

Pedido do usuário: $ARGUMENTS

Siga as regras de `.claude/commands/sdd-flow.md`.

## 1. Entender antes de classificar

Explore o código ligado ao pedido (arquivos, módulos, padrões) e leia `.sdd/constitution.md` e as specs vivas relevantes em `.sdd/specs/`. Se o pedido estiver vazio ou vago, pergunte o que o usuário quer antes de seguir.

## 2. Definir o porte

| Porte | Quando | Fluxo |
| :-- | :-- | :-- |
| **S** | Ajuste localizado: poucos arquivos, comportamento claro, sem mudança de dados ou contrato público | grill → tasks → implement → verify |
| **M** | Feature ou mudança de comportamento com requisitos a negociar | grill → prd → tasks → implement → verify |
| **L** | Feature com decisão de arquitetura, modelo de dados, integração externa ou risco alto | grill → prd → design → tasks → implement → verify |

Correção de bug costuma ser porte S: o Grill registra como reproduzir, e a primeira tarefa é um teste que reproduz o bug e falha (fica como teste de regressão).

Na dúvida entre dois portes, escolha o maior. Proponha o porte com uma frase de justificativa e deixe o usuário confirmar ou mudar.

Mudança grande demais (várias features independentes)? Proponha dividir em mudanças separadas antes de criar.

## 3. Criar

```bash
node .sdd/bin/sdd.mjs new "<título curto>" --size <S|M|L>
```

## 4. Seguir para o Grill

Continue direto no fluxo do `/sdd-grill` para a mudança criada, sem esperar outro comando.
