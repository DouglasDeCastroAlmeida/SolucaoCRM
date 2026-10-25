---
description: Inicializa a esteira SDD no projeto (novo ou existente) e escreve a constituição a partir do código
argument-hint: "[--force]"
---

# /sdd-init — Inicializar a esteira

Siga as regras de `.claude/commands/sdd-flow.md`. Objetivo: deixar o projeto pronto para mudanças SDD, com uma constituição que reflita **este** projeto.

## 1. Criar a estrutura

Rode o CLI do plugin (`${CLAUDE_PROJECT_DIR}/.claude/sdd-esteira` é o diretório do plugin; o caminho absoluto também aparece no contexto do início da sessão):

```bash
node "${CLAUDE_PROJECT_DIR}/.claude/sdd-esteira/scripts/sdd.mjs" init
```

Acrescente `--force` ao comando só se o usuário o escreveu em `$ARGUMENTS` (`--force`). Qualquer outro texto em `$ARGUMENTS` é contexto do projeto: **não o repasse ao shell**; use-o apenas na entrevista do passo 2.

Isso cria `.sdd/` (config, constituição, specs, changes, archive) e copia o motor para `.sdd/bin/` e os templates para `.sdd/templates/`. Daqui em diante use `node .sdd/bin/sdd.mjs`.

## 2. Descobrir o projeto

- **Projeto existente:** explore antes de perguntar (use o subagente `Explore` para repositórios grandes). Levante: linguagens e frameworks, gerenciador de pacotes, estrutura de pastas, padrões de nome, como os testes são escritos e executados, lint/typecheck, CI, banco e migrações, isolamento de dados, e regras já documentadas em `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`.
- **Projeto novo:** entreviste o usuário, uma pergunta por vez, sempre com uma recomendação.

## 3. Perfis de padrões

Liste os perfis disponíveis:

```bash
node .sdd/bin/sdd.mjs profile list
```

| Perfil | Conteúdo |
| :-- | :-- |
| `web-react` | MUI / Ant Design / Tailwind, Impeccable Style, paletas com contraste WCAG AA, ícones Lucide (Lordicon, Heroicons, React Icons como apoio), acessibilidade, Testing Library, Playwright + axe |
| `api-node` | Camadas Controller → Service → Repository, Zod nas bordas, timeouts de 5 s, retry com jitter, circuit breaker, PostgreSQL (Prisma/Drizzle) ou MongoDB, migrações reversíveis, Supertest + banco real |
| `infra-hostinger` | Docker multi-stage não-root, healthchecks, Caddy com TLS, deploy por GitHub Actions, rollback em 2 min, smoke test |

Recomende apenas os perfis que combinam com a stack encontrada (ou escolhida, em projeto novo) e explique em uma linha cada. Num projeto que já tem design system, ORM ou pipeline próprios, diga quais itens do perfil conflitam: o que existe prevalece. Aplique os que o usuário aceitar:

```bash
node .sdd/bin/sdd.mjs profile add <nome>
```

O perfil é copiado para a constituição (seção "Perfis adotados") e passa a valer para design, implementação e revisão. Projeto de cliente com padrões próprios pode não adotar nenhum.

## 4. Preencher

- `.sdd/constitution.md`: substitua todos os marcadores `<!-- PREENCHA -->` com fatos concretos, citando arquivos de referência. Regras que o código não comprova viram perguntas ao usuário.
- `.sdd/config.json`:
  - `commands`: comandos reais do projeto. Rode cada um uma vez com `node .sdd/bin/sdd.mjs run <nome>` e confirme que funciona.
    - `test`: suíte completa, com reporter curto (ex.: `npx vitest run --reporter=dot`, `pytest -q`).
    - `testFocused`: roda só os arquivos informados, com `{files}` no lugar deles (ex.: `npx vitest run {files}`, `pytest -q {files}`). É o que mais economiza tokens no TDD.
    - `lint`, `typecheck`, `e2e` (ex.: `npx playwright test --reporter=line`).
    - `coverage` (opcional) e `quality.coverageMin` (opcional, ex.: 80).
    - `security` (opcional): auditoria de dependências (ex.: `npm audit --audit-level=high`).
  - `review.mode`: `auto` (padrão: revisão final no porte S, por fatia nos portes M/L), `per-slice`, `per-task` ou `final`.
  - `tests.include`: padrões dos arquivos de teste deste projeto, se diferentes do padrão.
  - `gate.allow`: caminhos que podem ser editados sem mudança aprovada (docs, configs de editor). Não libere código de produção.
  - `gate.mode`: `strict` (padrão), `warn` para adoção gradual em projeto legado, `off` para desligar.

## 5. Integrar com o projeto

Se existir `CLAUDE.md`, acrescente uma seção curta (não reescreva o arquivo):

```markdown
## Esteira SDD
Este projeto usa a esteira SDD (`.sdd/`). Toda mudança de comportamento passa por /sdd-new.
Constituição: `.sdd/constitution.md`. Specs vivas: `.sdd/specs/`.
```

Se não existir, crie um `CLAUDE.md` mínimo com essa seção.

## 6. Fechar

Mostre ao usuário o resumo da constituição, os perfis adotados e os comandos detectados, e peça a revisão. A constituição é do usuário: só considere pronta depois que ele confirmar. Sugira o primeiro `/sdd-new`.
