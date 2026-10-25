# Esteira SDD dentro do repositório (para sessões em nuvem e outros computadores)

Plugins de marketplace NÃO vão para as sessões em nuvem do Claude Code; o que está versionado em `.claude/` vai.
Por isso a esteira (plugin `sdd@sdd-esteira` v2.0.0) foi copiada para cá:

| O que | Onde no repositório |
|---|---|
| Comandos `/sdd-new`, `/sdd-grill`, `/sdd-prd`, `/sdd-design`, `/sdd-tasks`, `/sdd-implement`, `/sdd-verify`, `/sdd-approve`, `/sdd-archive`, `/sdd-status`, `/sdd-init` e as regras `sdd-flow` | `.claude/commands/sdd-*.md` |
| Subagentes (implementer, reviewer, auditor) | `.claude/agents/sdd-*.md` |
| Ganchos (bloqueio de edição fora do estágio; aprovação só pela mensagem do dono; aviso no início da sessão) e o motor | `.claude/sdd-esteira/` (registrados em `.claude/settings.json`) |
| Motor de linha de comando | `.sdd/bin/` (já existia) |

## Nomes dos comandos
No plugin local o comando é `/sdd:approve`; na cópia do repositório é `/sdd-approve`. **Os dois funcionam** como aprovação do dono:
o gancho reconhece as duas formas (a mensagem do dono precisa ser APENAS esse comando). Nunca aprove por conta própria; nunca use `--force`.

## Convivência com o plugin local
A cópia do repositório grava o estado de aprovação em `.sdd/.gate-state-repo.json` (o plugin usa `.sdd/.gate-state.json`), para os dois conjuntos
de ganchos não disputarem a mesma aprovação. Se rodar os dois no mesmo PC, o aviso de início de sessão aparece duas vezes; é inofensivo.
Se algo estranho acontecer, desative um dos dois: `/plugin disable sdd@sdd-esteira` (plugin) ou remova as três entradas `sdd-esteira` de `.claude/settings.json` (cópia).

## O que está testado e o que não está
- Testado neste PC (Windows), com os ganchos exercitados à mão: comando inofensivo passa; `approve` sem a mensagem do dono é bloqueado (saída 2);
  com `/sdd-approve` do dono passa UMA vez e a segunda é bloqueada.
- **Não testado ainda numa sessão em nuvem.** Primeira tarefa da sessão nova: `prompt-continuacao.md`, itens (a) a (d).

## Por que comandos e não skills
`.claude/skills/` é um espelho gerado de `.agents/skills/` (teste `skills-embutidas`); um comando em `.claude/commands/` viaja com o repositório sem brigar com essa regra.
A única perda: a skill `sdd-flow` não dispara sozinha; os comandos mandam ler `.claude/commands/sdd-flow.md` e o gancho de início de sessão lembra a regra.

## Atualizar quando o plugin mudar
Recopie `hooks/ scripts/ templates/` do plugin para `.claude/sdd-esteira/`, reaplique as duas adaptações (regex `sdd[:-]approve` em `scripts/lib.mjs` e o nome do arquivo de estado
`.gate-state-repo.json`), e os `skills/*/SKILL.md` para `.claude/commands/sdd-*.md` trocando `/sdd:` por `/sdd-`.
