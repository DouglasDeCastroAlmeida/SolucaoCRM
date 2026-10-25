# Prompt para colar na primeira mensagem da sessão nova

Copie o bloco abaixo (entre as linhas) e cole como primeira mensagem. Ele não contém segredos.

---
Você está assumindo o projeto Solução CRM (fork do DeskcommCRM) de uma sessão anterior que acabou de fechar o subprojeto 0.
Eu sou leigo em infraestrutura: explique em português simples e, em painéis, dê cliques exatos dizendo em qual site/tela.

Antes de qualquer coisa, leia só estes três arquivos (não varra `docs/` do upstream):
1. `docs/solucao-crm/migracao-nuvem/LEIA-PRIMEIRO-NUVEM.md` — contexto, minhas regras e armadilhas;
2. `docs/solucao-crm/migracao-nuvem/inventario-de-acessos.md` — o que você acessa e como;
3. `.sdd/constitution.md` — decisões A-01..A-07 e perfis da esteira.

Regras que não mudam: nunca me peça segredos no chat; esteira SDD sempre obrigatória (só eu aprovo etapas, e só com a mensagem `/sdd:approve`);
nunca trabalhe direto na `main`; peça meu ok antes de ação destrutiva, de produção ou na VPS; cota do plano Pro é curta, então fatias pequenas.

Primeira tarefa (teste do ambiente, 15 min, sem mudar nada de produção):
a) confirme o que a sessão consegue fazer aqui: clonar o repositório, rodar `node .sdd/bin/sdd.mjs status`, `pnpm install` e `pnpm vitest run tests/unit/ci-enxuto-da-solucao-crm.test.ts`;
b) diga se consegue usar `gh` (listar PRs e disparar workflow) e se alcança a VPS por SSH (apenas `echo ok`; se o domínio/porta for bloqueado, diga qual);
c) diga se a esteira SDD está ativa aqui (os comandos `/sdd:*` e o bloqueio que só deixa aprovar com a minha mensagem). Se não estiver, pare e me explique antes de tocar em código;
d) devolva uma tabela "consegue / não consegue / como resolver".

Depois do teste, aguarde meu pedido para abrir o subprojeto 1 (`/sdd:new` + Grill, uma pergunta por vez, com recomendação).
---

## Se a sessão nova for LOCAL (VS Code) em vez de nuvem
Use o mesmo prompt. O plugin da esteira (`sdd@sdd-esteira`) precisa estar instalado no seu Claude Code, ou use a cópia versionada em `.claude/` (ver `README-esteira-no-repo.md`, quando existir).
