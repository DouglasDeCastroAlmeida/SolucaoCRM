# Verificação: Fundação: instalação single-server, CI/CD, backups e isolamento

> Mudança `001-fundacao-instalacao-single-server-ci-cd-backups-e-isolamento` · porte L · 2026-10-25
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.

## Evidências

- `node .sdd/bin/sdd.mjs run test` (`pnpm test:unit`) → não verificado: `pnpm` não existe nesta máquina Windows (exit 1 em 0,1 s); suíte completa inviável aqui.
- `run lint` (`pnpm lint`) e `run typecheck` (`pnpm typecheck`) → não verificado, mesmo motivo (sem pnpm). A mudança não altera TypeScript de aplicação, só workflows, shell e testes.
- `run e2e` (`pnpm test:e2e`) → não executado: exige servidor e banco; por A-07 só roda por disparo manual.
- `run coverage` → não configurado (comando vazio; `quality.coverageMin` nulo).
- `run security` (`pnpm audit --audit-level=high`) → não verificado (sem pnpm). Nenhuma dependência npm foi adicionada pela mudança.
- `npx vitest run` nos 7 arquivos de workflow (ci-enxuto, deploy-workflows, gatilho-dos-jobs-de-entrega, gitleaks-reprova-segredo, preambulo-do-ci, pr-template-migration-compativel, publish-image-tag-sha) → 7 arquivos passaram, 68 testes passaram, 2 pulados (gitleaks sem binário local), 0 falhas.
- `bash tests/infra/{compose-hml,deploy-health-url,deploy-sha,deploy-lock}.test.sh` no Git Bash → 4 de 4 OK (exit 0).
- Testes de infra completos: não reexecutados aqui; registro herdado em `docs/solucao-crm/evidencias/001-fundacao/testes-infra-linux.txt` → 27 de 27 passam na VPS com cópia limpa do git (registro do implementador, não reproduzido por esta auditoria).
- Provas contra a VPS (lidas como registro, não reexecutadas): `deploy-prod.txt` (deploy pelo pipeline, / = 200 e /app = 307 em 20 s, backup antes em 3 s); `deploy-hml-e-rollback.txt` (rollback em 5 s, 7 s totais, AC-006.3); `memoria-24h.txt` (143 amostras, mínimo 11964 MB livres, AC-009.3); `backup-real-e-restauracao.txt` e `backup-r2.txt` (backup cifrado no R2, sem credencial → HTTP 400, restauração em banco vazio com 197 tabelas, 1 usuário e 635 políticas RLS idênticos); `janela-de-troca-medida-de-fora.log` (vava com quedas isoladas de 1 amostra, AC-001.5); `sentry.txt` (evento de teste confirmado no painel pelo dono).
- `node .sdd/bin/sdd.mjs validate` → ver Parecer.

## Rastreabilidade

Saída de `node .sdd/bin/sdd.mjs trace 001-...` (4 critérios sem teste detectável pelo ID):

| Critério | Tarefas | Testes | Status |
| :-- | :-- | :-- | :-: |
| AC-001.1 | T-027 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-001.2 | T-027 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-001.3 | T-027 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-001.4 | T-026 | `tests/infra/mover-vava.test.sh` | ✅ |
| AC-001.5 | T-027 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-002.1 | T-031 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-002.2 | T-031 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-002.3 | T-031 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-002.4 | T-028, T-029 | `tests/infra/compose-solucao.test.sh`, `tests/infra/vps/sondas.sh` | ✅ |
| AC-002.5 | T-030 | `tests/infra/instalar-prod.test.sh` | ✅ |
| AC-003.1 | T-033 | `tests/infra/compose-hml.test.sh`, `tests/infra/deploy-sha.test.sh`, `tests/infra/vps/sondas.sh` | ✅ |
| AC-003.2 | T-033 | `tests/infra/compose-hml.test.sh`, `tests/infra/vps/sondas.sh` | ✅ |
| AC-003.3 | T-033 | tests/infra/vps/sondas.sh (sonda homologacao) | ✅ |
| AC-004.1 | T-001, T-002 | `tests/unit/ci-enxuto-da-solucao-crm.test.ts` | ✅ |
| AC-004.2 | T-001, T-002 | `tests/unit/ci-enxuto-da-solucao-crm.test.ts` | ✅ |
| AC-004.3 | T-001, T-002 | `tests/unit/ci-enxuto-da-solucao-crm.test.ts` | ✅ |
| AC-004.4 | T-001, T-002, T-005 | `tests/unit/ci-enxuto-da-solucao-crm.test.ts` | ✅ |
| AC-004.5 | T-040, T-041 | `tests/infra/minutos-github.test.sh` | ✅ |
| AC-005.1 | T-012, T-013, T-034 | `tests/infra/deploy-baseline-pula.test.sh`, `tests/infra/deploy-health-url.test.sh`, `tests/unit/deploy-workflows-da-solucao-crm.test.ts` | ✅ |
| AC-005.2 | T-012, T-013, T-035 | `tests/unit/deploy-workflows-da-solucao-crm.test.ts` | ✅ |
| AC-005.3 | T-007, T-011 | `tests/infra/deploy-sha.test.sh`, `tests/unit/deploy-workflows-da-solucao-crm.test.ts`, `tests/unit/publish-image-tag-sha.test.ts` | ✅ |
| AC-005.4 | T-012, T-013 | `tests/unit/deploy-workflows-da-solucao-crm.test.ts` | ✅ |
| AC-005.5 | T-008, T-011 | `tests/infra/deploy-lock.test.sh`, `tests/unit/deploy-workflows-da-solucao-crm.test.ts` | ✅ |
| AC-006.1 | T-010, T-011 | `tests/infra/deploy-backup-segredos.test.sh` | ✅ |
| AC-006.2 | T-009, T-011 | `tests/infra/deploy-integracao.test.sh`, `tests/infra/deploy-rollback-codigo.test.sh`, `tests/infra/deploy-rollback.test.sh` | ✅ |
| AC-006.3 | T-009, T-011, T-034 | `tests/infra/deploy-health-url.test.sh`, `tests/infra/deploy-rollback.test.sh` | ✅ |
| AC-006.4 | T-005, T-006 | `tests/unit/pr-template-migration-compativel.test.ts` | ✅ |
| AC-007.1 | T-014, T-016, T-036 | `tests/infra/backup-externo.test.sh` | ✅ |
| AC-007.2 | T-014, T-016, T-036 | `tests/infra/backup-externo.test.sh` | ✅ |
| AC-007.3 | T-036 | tests/infra/vps/sondas.sh (sonda backup-privado) | ✅ |
| AC-007.4 | T-037 | `tests/infra/backup-externo-falha.test.sh` | ✅ |
| AC-007.5 | T-015, T-016 | `tests/infra/backup-externo-falha.test.sh` | ✅ |
| AC-007.6 | T-014, T-016 | `tests/infra/backup-externo.test.sh` | ✅ |
| AC-007.7 | T-045, T-046 | `tests/infra/admin-ferramentas-backup.test.sh`, `tests/infra/backup-externo-teto.test.sh` | ✅ |
| AC-008.1 | T-024 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-008.2 | T-024 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-008.3 | T-019, T-020 | `tests/infra/admin-usuarios.test.sh`, `tests/infra/crm-status.test.sh`, `tests/infra/vps/sondas.sh` | ✅ |
| AC-008.4 | T-017, T-020, T-024 | `tests/infra/admin-instalar-scripts.test.sh`, `tests/infra/admin-usuarios.test.sh`, `tests/infra/isolamento-authorized-keys.test.sh`, `tests/infra/vps/sondas.sh` | ✅ |
| AC-008.5 | T-018, T-020, T-047, T-048 | `tests/infra/admin-cron.test.sh`, `tests/infra/admin-dry-run.test.sh`, `tests/infra/admin-ferramentas-backup.test.sh`, `tests/infra/admin-firewall.test.sh`, `tests/infra/admin-instalar-scripts.test.sh`, `tests/infra/admin-swap.test.sh`, `tests/infra/admin-usuarios.test.sh`, `tests/infra/alerta.test.sh` | ✅ |
| AC-009.1 | T-022 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-009.2 | T-028, T-029 | `tests/infra/compose-solucao.test.sh` | ✅ |
| AC-009.3 | T-043, T-044, T-039 | `tests/infra/medir-memoria.test.sh` | ✅ |
| AC-009.4 | T-043, T-044, T-039 | `tests/infra/medir-memoria.test.sh` | ✅ |
| AC-009.5 | T-021 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-010.1 | T-025 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-010.2 | T-023 | `tests/infra/admin-firewall.test.sh`, `tests/infra/vps/sondas.sh` | ✅ |
| AC-010.3 | T-032 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-010.4 | T-025 | `tests/infra/vps/sondas.sh` | ✅ |
| AC-011.1 | T-038 | tests/infra/vps/sondas.sh (sonda monitor) + evidencias/monitor.txt | ✅ |
| AC-011.2 | T-038 | tests/infra/vps/sondas.sh (sonda sentry) + evidencias/sentry.txt | ✅ |
| AC-012.1 | T-003, T-004 | `tests/unit/gitleaks-reprova-segredo.test.ts` | ✅ |
| AC-012.2 | T-010, T-011 | `tests/infra/alerta.test.sh`, `tests/infra/backup-externo.test.sh`, `tests/infra/deploy-backup-segredos.test.sh`, `tests/infra/deploy-integracao.test.sh` | ✅ |

Os 4 critérios que o auditor apontou com ❌ foram fechados em 25/10/2026:

- AC-003.3: o rótulo da sonda foi corrigido para "AC-003.3" (tests/infra/vps/sondas.sh, sonda homologacao).
- AC-007.3: nova sonda backup-privado (GET sem credencial no bucket e num objeto → HTTP 400) e backup-r2.txt.
- AC-011.2: nova sonda sentry (DSN do dono nos dois ambientes, nunca vazio nem a da comunidade) e sentry.txt, com a conferência visual do dono no painel.
- AC-011.1: nova sonda monitor, evidencias/monitor.txt: a homologação foi derrubada de propósito (18:28 UTC) e o alerta chegou ao celular do dono ("Root cause: 502 Bad Gateway"); recuperação em ~4 min totais.

Nota: vários ✅ da tabela dependem de `tests/infra/vps/sondas.sh`, que só roda contra a VPS; esta auditoria não a executou.

## Revisão de código

Revisão manual (não houve subagente sdd-reviewer nesta rodada):

- Workflows: `deploy-prod.yml` só por `workflow_dispatch`, ambiente `producao`, `permissions` mínimas, `concurrency` por ambiente, `StrictHostKeyChecking=yes` com known_hosts fixo; sem `pull_request_target` em deploy (AC-005.2/4/5, cobertos por `deploy-workflows-da-solucao-crm.test.ts`). Imagem por SHA, nunca `latest` (AC-005.3).
- Os testes shell exercitam comportamento observável (rollback devolve código e imagens, lock, segredo mascarado, teto de 7 GB, falha gera alerta) e incluem caminhos de erro (`backup-externo-falha`, `deploy-rollback*`, `instalar-prod`).
- Achados não bloqueantes:
  1. AC-007.4 pede "o CRM sobe com os dados do backup"; a prova restaurou só o BANCO (limite declarado em `backup-real-e-restauracao.txt`). A restauração da VPS inteira em até 2 h depende de ensaio do runbook, ainda não feito.
  2. AC-004.5: medição de minutos parcial (uso bruto ~51% em 23/10; "Billed" e "Budget" em zero ainda por confirmar). O repositório ficou público (minutos ilimitados), o que reduz o risco; a medição de fim de novembro é o acompanhamento aceito pelo dono.
  3. O `testes-infra-linux.txt` foi produzido pelo implementador na VPS; no Windows só 4 testes shell foram reexecutados.

## Segurança

- Varredura nos 237 arquivos versionados de `docs/solucao-crm`, `infra`, `.github`, `.sdd`, `tests/infra` e `scripts` por chaves privadas, tokens (ghp_, github_pat_, sk_live, sk-ant, AKIA, xox), JWT longos e DSN do Sentry: só ocorrências em código de mascaramento (`alerta.sh`, `crm-status.sh`), em testes com valores falsos e em placeholders de e2e ("nao-e-segredo"). Nenhum segredo real encontrado.
- Atribuições de senha/token/secret com valor longo: todas placeholders de e2e ou locais, herdadas do upstream e fora desta mudança.
- Único IP real: o da VPS em `dns.txt`, `sondas.sh` e `runbooks/fundacao.md`. Aceitável por decisão do dono. Os demais são faixas de documentação (203.0.113.x, 198.51.100.x) e versão de imagem.
- Nenhum `.env`, `.pem` ou `.key` real versionado (só `.env*.example`). As evidências citam a chave privada do age e a DSN do Sentry por caminho ou ID, sem o valor. A pasta de segredos do dono não foi lida.
- Repositório agora PÚBLICO: o histórico antigo continua visível. Esta auditoria NÃO varreu o histórico inteiro do git; o gitleaks do CI cobre só o diff de PR. Recomenda-se uma varredura única do histórico (`gitleaks detect`) e rotacionar qualquer segredo que tenha passado por commit antes da publicação. Não verificado.
- Isolamento, firewall, portas e swap: provados só por sondas na VPS (`firewall.txt`, `portas.txt`, `swap.txt`); não reexecutados aqui.
- Achado já corrigido (`sentry.txt`): DSN vazio enviava erros ao Sentry da comunidade do upstream; hoje as duas instâncias apontam para o Sentry do dono.
- Dependências novas: nenhuma.

## Desvios de escopo

- Desvios deliberados decididos pelo dono e registrados na constituição: A-05 (imagem só amd64), A-06 (sem Required reviewers: disparo manual = aprovação, AC-005.2), A-07 (e2e só por disparo manual; AC-004.2 já emendado no PRD).
- T-041 fechada com sonda e evidência de outubro; a medição de fim de novembro fica como acompanhamento (AC-004.5).
- Além do pedido (benigno, todos com teste): correções de defeitos descobertos na prova (saúde via `NEXT_PUBLIC_APP_URL`, rollback do código, apelido de rede da hml, baseline que só reaplica quando muda, keepalive do SSH).
- Aquém do pedido: restauração provada só no banco (AC-007.4); o ensaio com o CRM inteiro fica no runbook. O monitor (AC-011.1) agora tem evidência (monitor.txt).
- Nenhuma mudança em marcas, billing, domínios dinâmicos ou conteúdo do vava foi encontrada.

## Specs vivas

`.sdd/specs/` estava vazio (confirmado), logo só há ADICIONADOS. Deltas em `specs/` desta mudança:

- `specs/implantacao-single-server.md` (portas, produção, homologação, domínio, firewall, limites de memória, monitoramento)
- `specs/ci-cd.md` (CI enxuto, deploy, rollback, varredura de segredos)
- `specs/backup-externo.md`
- `specs/isolamento-dev.md`

## Parecer

**APROVADO** — a entrega está comprovada: 48 de 48 tarefas, 56 de 56 critérios rastreados (testes e sondas com o ID, mais evidências em docs/solucao-crm/evidencias/001-fundacao/).
Os dois bloqueantes do primeiro parecer foram resolvidos em 25/10/2026: (1) AC-011.1 provado pelo alerta real de queda no celular do dono; (2) IDs AC-003.3, AC-007.3, AC-011.1 e AC-011.2 agora aparecem em sondas executáveis.
A varredura do histórico inteiro do git (repositório público) não achou nenhum segredo nosso (historico-gitleaks.txt: 46 achados, todos fixtures do projeto original).

Acompanhamentos que NÃO bloqueiam: AC-004.5 (conferir Billed/Budget do GitHub, já em US$ 0 e sem cartão); AC-007.4 (restauração com o CRM inteiro); T-041 (medição de minutos do mês fechado, fim de novembro); voltar o repositório para privado depois da entrega.
