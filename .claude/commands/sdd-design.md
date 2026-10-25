---
description: Escreve o design técnico (o como), com ADRs e estratégia de testes, alinhado ao código existente
argument-hint: "[mudança]"
---

# /sdd-design — Design técnico

Mudança: $ARGUMENTS (vazio = a única mudança ativa). Siga as regras de `.claude/commands/sdd-flow.md`.

Pré-condição: estágio `design` (só porte L). Se não estiver, diga em que estágio está.

## Pesquisar antes de desenhar

- Leia `01-prd.md`, `00-grill.md`, a constituição e as specs vivas afetadas.
- Encontre no código como problemas parecidos já foram resolvidos e **siga esses padrões**. Para repositórios grandes, use o subagente `Explore`.
- Consulte documentação oficial das bibliotecas quando a decisão depender de versão. Use as ferramentas indicadas nos perfis adotados (ex.: MUI MCP no perfil `web-react`).
- Siga os perfis adotados na constituição (componentes, ícones, camadas, resiliência, infra). Divergência de um perfil vira ADR.

## Escrever `02-design.md`

- **Abordagem:** a solução e as alternativas descartadas, com o motivo.
- **Componentes afetados:** caminhos reais, novos e alterados. Prefira estender o que existe.
- **Contratos e interfaces**, **Modelo de dados** (migrações compatíveis com rollback), **Riscos e casos extremos**.
- **Decisões (ADRs):** pelo menos um `### ADR-001: título` com contexto, decisão e consequências.
- **Estratégia de testes:** que camada cobre cada critério de aceite (a mais baixa que o prova; veja `.sdd/templates/testing-guide.md`) e como o teste cita o ID (`it('AC-001.1: ...')`).
- Diagrama Mermaid só se ajudar a entender um fluxo.
- Seção que não se aplica: `N/A — motivo`.
- Qualquer conflito com a constituição: pare e pergunte ao usuário.

Valide:

```bash
node .sdd/bin/sdd.mjs validate <mudança>
```

## Fechar

Resuma a abordagem, os ADRs e os riscos e diga: **"Para aprovar e seguir, digite `/sdd-approve`."** Não aprove por conta própria.
