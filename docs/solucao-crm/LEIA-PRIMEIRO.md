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
- Repositório privado: `DouglasDeCastroAlmeida/SolucaoCRM` (GitHub). Branch de trabalho dos docs: `docs/spec-e-guia-de-setup`. A `main` só recebe mudanças por PR.
- Esteira SDD instalada globalmente (`sdd@sdd-esteira`). Os comandos `/sdd:*` só aparecem em sessão nova.
- VPS Hostinger KVM4 (`srv2049015`), acesso por SSH com a chave do dono. O IP está no gerenciador de senhas e nos Secrets do GitHub, não neste arquivo.

## Andamento
| # | Tarefa | Estado |
|---|---|---|
| 1 | Instalar a esteira SDD | Concluída |
| 2 | Diagnóstico da VPS (somente leitura) | Concluída |
| 3 | Limpeza dos projetos antigos (`botimobiliario`, `evo-crm-community`); `vava` e `portainer` intactos | Concluída em 2026-10-21 |
| 4 | Cópia privada do DeskcommCRM, remoto `upstream`, docs em branch próprio | Concluída |
| 5 | `/sdd:init`: projeto existente, `gate.mode` "warn", perfis `web-react` e `infra-hostinger`, convenções do `CLAUDE.md` prevalecem | **Próxima** |
| 6 | `/sdd:new` do subprojeto 0 (Fundação, porte L): escopo = seção 12 da spec; resolver no Grill as validações V-4 e V-5 | Depois da 5, só quando o dono mandar |

Não abrir `/sdd:new` de nenhum subprojeto antes de o `/sdd:init` terminar e o dono aprovar.
