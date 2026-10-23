# LEIA PRIMEIRO — Solução CRM (para qualquer sessão do Claude que chegar aqui)

Este repositório é uma **cópia privada do DeskcommCRM (MIT)**, que está sendo transformada em um CRM
whitelabel e multiclient para profissionais autônomos. O remoto `upstream` aponta para o original.

## Onde está a verdade
A pasta `docs/` do repositório é **majoritariamente do DeskcommCRM original** (cerca de 149 documentos).
**Não leia a pasta inteira.** Tudo o que é nosso está **só nesta pasta** (`docs/solucao-crm/`):

| Ordem | Arquivo | O que é |
|---|---|---|
| 1 | `specs/2026-10-21-crm-autonomos-design.md` | **Autoridade do que construir.** Decisões D-01..D-14 (não rediscutir), arquitetura, subprojetos 0..9 (seção 12), validações pendentes V-1..V-7 (seção 13, resolvidas no Grill do subprojeto indicado) |
| 2 | `setup/guia-de-setup.md` | Contas, chaves, SSH, DNS e onde cada segredo mora |
| 3 | `setup/diagnostico-vps-2026-10-21.md` | Estado real da VPS depois da limpeza e o requisito de portas 80/443 |

Do **restante** do repositório, leia apenas:
- `CLAUDE.md` (e `AGENTS.md`, que deriva dele): convenções de código do DeskcommCRM. Em caso de conflito com a esteira SDD, **o `CLAUDE.md` prevalece** (spec, seção 10.4); a divergência vira decisão ou ADR.
- Um documento específico de `docs/` **somente quando o assunto da tarefa pedir** (ex.: `docs/white-label.md` e `docs/saas/cobranca.md` no subprojeto de marcas e cobrança; `docs/saas/coolify.md` para o modo single-server). Nunca varrer `docs/`.

## Regras do dono do projeto (valem sempre)
1. É leigo em infraestrutura: explicar em português simples e dar cliques exatos em painéis (Hostinger, GitHub etc.).
2. Antes de qualquer ação destrutiva ou irreversível (apagar, `push --force`, publicar, mexer na VPS): mostrar o que será feito e **esperar o "ok"**.
3. **Nunca pedir segredos no chat.** Segredos vão no `.env` da VPS ou nos Secrets do GitHub; o dono preenche.
4. Plano Claude Pro, sem créditos pagos extras: **fatias pequenas e econômicas**, sem leituras amplas.
5. **Não pode haver dois serviços disputando as portas 80/443** na VPS (ver o diagnóstico). Não alterar o projeto `vava` sem aprovação explícita.
6. Parar ao final de cada tarefa, mostrar o resultado e esperar o dono mandar seguir.

## Ambiente
- Repositório privado: `DouglasDeCastroAlmeida/SolucaoCRM` (GitHub). Branches: `docs/spec-e-guia-de-setup` (documentos) e `chore/sdd-init` (parte do anterior e acrescenta a esteira `.sdd/`). Trabalho novo sai de `chore/sdd-init` em branch próprio. A `main` só recebe mudanças por PR.
- Esteira SDD instalada globalmente (`sdd@sdd-esteira`). Os comandos `/sdd:*` só aparecem em sessão nova.
- VPS Hostinger KVM4 (`srv2049015`), acesso por SSH com a chave do dono. O IP está no gerenciador de senhas e nos Secrets do GitHub, não neste arquivo.

## Andamento
| # | Tarefa | Estado |
|---|---|---|
| 1 | Instalar a esteira SDD | Concluída |
| 2 | Diagnóstico da VPS (somente leitura) | Concluída |
| 3 | Limpeza dos projetos antigos (`botimobiliario`, `evo-crm-community`); `vava` e `portainer` intactos | Concluída em 2026-10-21 |
| 4 | Cópia privada do DeskcommCRM, remoto `upstream`, docs em branch próprio | Concluída |
| 5 | `/sdd:init`: projeto existente, `gate.mode` "warn", perfis `web-react` e `infra-hostinger`, convenções do `CLAUDE.md` prevalecem | Concluída e revisada (branch `chore/sdd-init`, ainda sem PR para a `main`). Decisões de adoção da constituição usam IDs `A-xx`, para não colidir com as `D-xx` da spec |
| 6 | `/sdd:new` do subprojeto 0 (Fundação, porte L): escopo = seção 12 da spec; resolver no Grill as validações V-4 e V-5 | **Próxima**, só quando o dono mandar |

Subprojetos seguintes: seção 12 da spec, um `/sdd:new` por vez, sempre com o dono aprovando o anterior.

## Mapa: onde está cada coisa do que é NOSSO (atualizado em 23/10/2026)

O repositório tem milhares de arquivos do DeskcommCRM original. O que é nosso fica só nestes lugares:

| Quero ver... | Onde |
|---|---|
| **O que vamos construir** (visão, decisões D-xx, subprojetos 0 a 9) | `docs/solucao-crm/specs/2026-10-21-crm-autonomos-design.md` |
| **As etapas do subprojeto 0** (perguntas, requisitos, design, tarefas) | `.sdd/changes/001-fundacao-.../` → `00-grill.md`, `01-prd.md`, `02-design.md`, `03-tasks.md` |
| **Quais tarefas estão feitas** (`[x]`) e quais faltam (`[ ]`) | `.sdd/changes/001-fundacao-.../03-tasks.md` |
| **As regras do projeto** (constituição, decisões A-xx) | `.sdd/constitution.md` |
| **Contas, chaves e passo a passo de painéis** | `docs/solucao-crm/setup/guia-de-setup.md` |
| **Estado real da VPS** | `docs/solucao-crm/setup/diagnostico-vps-2026-10-21.md` e as evidências abaixo |
| **Provas de que algo funciona** (sem segredos) | `docs/solucao-crm/evidencias/001-fundacao/` |
| **Scripts da VPS** (deploy, backup, firewall, usuários, memória) | `infra/solucao/` e `infra/solucao/admin/` |
| **Testes desses scripts** e **sondas contra a VPS** | `tests/infra/` e `tests/infra/vps/sondas.sh` |
| **Automações do GitHub** (CI, deploy) | `.github/workflows/` (`deploy-hml.yml`, `deploy-prod.yml`, `ci.yml`) |

Segredos **nunca** ficam no repositório: moram em `C:\Users\Douglas\.secrets\` (seu computador), nos Secrets do GitHub e nos `.env` da VPS.

Comando para ver o andamento: `node .sdd/bin/sdd.mjs status`.
