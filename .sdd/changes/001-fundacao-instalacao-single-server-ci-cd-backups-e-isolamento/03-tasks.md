# Tarefas: Fundação: instalação single-server, CI/CD, backups e isolamento

> Mudança `001-fundacao-instalacao-single-server-ci-cd-backups-e-isolamento` · porte L · 2026-10-22
> Fatias verticais e testáveis, derivadas dos critérios de aceite. Teste antes da implementação.

## Formato

Cada tarefa ocupa uma linha:

`- [ ] T-001 [P] [TIPO] Descrição objetiva (~20 min) {AC-001.1} deps: T-000`

- **Tipos:** SETUP, TEST-CONTRACT, TEST-UNIT, TEST-INT, TEST-UI, TEST-E2E, CHECK-SMOKE, IMPL, REFACTOR, DOCS
- **[P]:** pode rodar em paralelo (não toca os mesmos arquivos de outra tarefa [P] pendente)
- **{AC-...}:** critérios de aceite cobertos. Todo critério precisa de pelo menos uma tarefa TEST-*.
- **deps:** tarefas que precisam terminar antes
- **(~XX min):** estimativa. Pisos por tipo em `.sdd/config.json > estimates`.

## Tarefas

> Regra da fatia: tudo que toca a VPS (fatias 5 a 9) só roda com o comando mostrado ao dono e o "ok" dele.

### Fatia 1: CI enxuto, imagem só amd64 e varredura de segredos (só repositório, sem VPS)
- [x] T-001 [TEST-INT] Teste que lê os YAML: PR roda só verify e invariants com 1 Postgres; e2e completo só em push na main; matriz sem arm64; 4 workflows desligados (~40 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.4}
- [x] T-002 [IMPL] Ajustar ci.yml, e2e.yml, publish-image.yml e desligar acolhida, relogio, mysql-integracao e release (~45 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.4} deps: T-001
- [x] T-003 [TEST-INT] Teste que prova que o gitleaks reprova um segredo falso plantado no diff (~35 min) {AC-012.1}
- [x] T-004 [IMPL] Passo gitleaks no job verify e configuração de exceções (~25 min) {AC-012.1} deps: T-003, T-002
- [x] T-005 [DOCS] Registrar ADR-004 (amd64) na constituição e item "migration compatível com a versão anterior" no template de PR (~15 min) {AC-004.4, AC-006.4}
- [x] T-006 [TEST-INT] Teste que confere o item de migration compatível no template de PR (~35 min) {AC-006.4} deps: T-005

### Fatia 2: deploy com versão fixa, trava e rollback automático (testado localmente)
- [x] T-007 [P] [TEST-INT] deploy.sh contra Docker local com imagens de mentira: aceita SHA de 40 caracteres, recusa latest, é idempotente (~40 min) {AC-005.3}
- [x] T-008 [P] [TEST-INT] Duas execuções simultâneas do deploy.sh no mesmo ambiente: a segunda espera (~35 min) {AC-005.5}
- [x] T-009 [TEST-INT] Imagem que não sobe: deploy volta às tags anteriores, sai com código 10 e mede o tempo (~45 min) {AC-006.2, AC-006.3}
- [x] T-010 [TEST-INT] Deploy de produção tira backup antes e registra o resultado; log sem valores de segredo (~40 min) {AC-006.1, AC-012.2}
- [x] T-011 [IMPL] infra/solucao/deploy.sh (backup, tags, baseline, up, saúde, rollback, flock), reaproveitando funções do _common.sh (~60 min) {AC-005.3, AC-005.5, AC-006.1, AC-006.2, AC-006.3, AC-012.2} deps: T-007, T-008, T-009, T-010
- [x] T-012 [TEST-INT] Teste do YAML: deploy-prod só em workflow_dispatch com ambiente producao e sem gatilho de PR; deploy-hml só após publish-image verde na main (~35 min) {AC-005.1, AC-005.2, AC-005.4}
- [x] T-013 [IMPL] Workflows deploy-hml.yml e deploy-prod.yml com concurrency por ambiente e smoke test (/ = 200, /app = 307) (~45 min) {AC-005.1, AC-005.2, AC-005.4} deps: T-012, T-011

### Fatia 3: backup externo criptografado (testado localmente com MinIO)
- [x] T-014 [TEST-INT] backup-externo.sh contra MinIO: gera banco, WAHA e Storage, arquivos saem criptografados e a retenção local mantém 14 (~50 min) {AC-007.1, AC-007.2, AC-007.6}
- [x] T-015 [TEST-INT] Falha de envio gera alerta no mesmo dia e sai com código diferente de zero (~35 min) {AC-007.5}
- [x] T-016 [IMPL] infra/solucao/backup-externo.sh (age + rclone + alerta + verificação por hash) (~50 min) {AC-007.1, AC-007.2, AC-007.5, AC-007.6} deps: T-014, T-015

### Fatia 4: isolamento e atalho de leitura (scripts testados localmente)
- [x] T-017 [TEST-INT] Teste do authorized_keys gerado para o deploy: command=, sem pty, sem forwarding (~35 min) {AC-008.4}
- [x] T-018 [TEST-UNIT] Cada ação de infra/solucao/admin tem script numerado com --dry-run e nenhum comando administrativo fora deles (~25 min) {AC-008.5}
- [x] T-019 [TEST-INT] crm-status.sh não imprime padrões de segredo (chaves, tokens, linhas de .env) (~35 min) {AC-008.3}
- [x] T-020 [IMPL] admin/01-swap.sh, 02-firewall.sh, 03-usuarios.sh, 04-mover-vava.sh, 05-cron.sh e crm-status.sh, todos com --dry-run (~60 min) {AC-008.3, AC-008.4, AC-008.5} deps: T-017, T-018, T-019

### Fatia 5: reserva de memória, firewall e usuários na VPS (cada ação só com seu ok)
- [x] T-043 [TEST-INT] medir-memoria.sh com free/docker falsos: registra memória livre em arquivo, e abaixo de 2 GB por mais de um dia dispara o alerta (ALERTA_CMD) sem segredos (~40 min) {AC-009.3, AC-009.4}
- [x] T-044 [IMPL] infra/solucao/medir-memoria.sh (cron a cada 10 min; guarda série diária; alerta de VPS dedicada) (~40 min) {AC-009.3, AC-009.4} deps: T-043
- [x] T-021 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Medir a VPS antes de instalar: memória, CPU, disco e portas abertas, comparando com a estimativa de 9 a 11 GB (~40 min) {AC-009.5}
- [x] T-022 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Swap de 4 GB ativo e persistente após reinício (~40 min) {AC-009.1} deps: T-021, T-020
- [x] T-023 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: ufw só com 22, 80, 443/tcp e 443/udp; porta 8000 fechada (~40 min) {AC-010.2} deps: T-020
- [x] T-024 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Como dev: docker ps e leitura de /opt/crm-prod negados; crm-status funciona; deploy só roda o comando fixo (~40 min) {AC-008.1, AC-008.2, AC-008.4} deps: T-020

### Fatia 6: DNS e troca do dono de 80/443 com o vava (janela combinada com o dono)
- [x] T-025 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: DNS na Hostinger: app, hml e curinga apontando para o IP da VPS; registros antigos revistos (~40 min) {AC-010.1, AC-010.4}
- [x] T-026 [TEST-INT] 04-mover-vava.sh em pasta de teste: cria a cópia dos arquivos (inclusive os locais) e --desfazer restaura byte a byte (~40 min) {AC-001.4}
- [x] T-027 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Troca real: só o Caddy do CRM em 80/443, valescaalmeida.com responde 200 e a porta interna do vava recusa de fora; indisponibilidade medida (~40 min) {AC-001.1, AC-001.2, AC-001.3, AC-001.5} deps: T-025, T-026, T-022, T-023

### Fatia 7: produção no ar
- [ ] T-028 [TEST-INT] docker compose config da produção não contém voice-agent e todos os serviços têm limite de memória e CPU (~35 min) {AC-002.4, AC-009.2}
- [ ] T-029 [IMPL] docker-compose.solucao.yml (limites, prioridade da produção, voice-agent desligado) (~35 min) {AC-002.4, AC-009.2} deps: T-028
- [ ] T-030 [TEST-INT] Instalador com .env incompleto ou DNS errado falha com mensagem em português e sem instalação pela metade (~35 min) {AC-002.5}
- [x] T-031 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Instalar crm-prod pelo instalador single-server e conferir /, /app, /api/v1/health e Studio e Postgres fechados (~40 min) {AC-002.1, AC-002.2, AC-002.3} deps: T-027, T-029, T-030
- [x] T-032 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Nenhuma porta além de 80/443 responde pela internet, inclusive as publicadas pelo Docker (~40 min) {AC-010.3} deps: T-031

### Fatia 8: homologação e primeiro deploy pelo pipeline
- [ ] T-033 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Instalar crm-hml com Supabase Cloud, publicada por caddy-sites, sem banco, env ou volumes em comum com a produção (~40 min) {AC-003.1, AC-003.2, AC-003.3} deps: T-031
- [ ] T-034 [CHECK-SMOKE] Deploy real em homologação pelo GitHub e rollback provocado medido abaixo de 2 minutos (~35 min) {AC-005.1, AC-006.3} deps: T-013, T-033
- [ ] T-035 [CHECK-SMOKE] Deploy de produção parado esperando a aprovação do dono e concluído depois do clique (~25 min) {AC-005.2} deps: T-034

### Fatia 9: backup real, restauração e monitoramento
- [x] T-045 [TEST-INT] backup-externo.sh com rclone falso que informa o tamanho do bucket: abaixo de 7 GB envia; acima recusa, alerta e não envia; falha ao medir o tamanho também recusa (não arrisca estourar a cota); alerta sem segredos (~40 min) {AC-007.7}
- [x] T-046 [IMPL] Teto de tamanho (BUCKET_TETO_GB, padrão 7) no backup-externo.sh e regra de ciclo de vida de 14 dias documentada no runbook (~35 min) {AC-007.7} deps: T-045
- [x] T-047 [TEST-INT] admin/07-ferramentas-backup.sh com apt falso: instala age e rclone só se faltarem, em --dry-run não executa nada, recusa fora de Debian/Ubuntu (~35 min) {AC-008.5}
- [x] T-048 [IMPL] admin/07-ferramentas-backup.sh (apt-get install age rclone, idempotente, com --dry-run) (~25 min) {AC-008.5} deps: T-047
- [ ] T-036 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Backup real da produção no R2: objeto criptografado e leitura sem credencial negada (~40 min) {AC-007.1, AC-007.2, AC-007.3} deps: T-016, T-031, T-046, T-048
- [ ] T-037 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Restaurar um backup do R2 em ambiente descartável usando só a chave do gerenciador de senhas (~40 min) {AC-007.4} deps: T-036
- [ ] T-038 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: Monitor de disponibilidade com alerta no celular e erro de teste no Sentry sem dados sensíveis (~40 min) {AC-011.1, AC-011.2} deps: T-033
- [ ] T-039 [TEST-INT] Sonda executável (tests/infra/vps/) rodada contra a VPS: medir-memoria.sh por 24 horas, registro de memória livre >= 2 GB e alerta simulado abaixo do limiar (~40 min) {AC-009.3, AC-009.4} deps: T-031, T-033, T-044

### Fechamento
- [ ] T-040 [DOCS] Runbook docs/solucao-crm/runbooks/fundacao.md: instalação, troca de portas, rollback, restauração, consumo de minutos (~40 min) {AC-004.5}
- [ ] T-041 [TEST-INT] Sonda executável (gh api) que registra o consumo de minutos do GitHub no primeiro mês e comparar com a cota (~40 min) {AC-004.5} deps: T-040
- [ ] T-042 [REFACTOR] Limpeza dos scripts de infra com testes verdes e evidências em docs/solucao-crm/evidencias/001-fundacao/ (~20 min) deps: T-035, T-037, T-038, T-039

## Estimativa

| Tarefa | Tipo | Descrição | Status | Estimativa |
| :-- | :-- | :-- | :-: | --: |
| T-001 | TEST-INT | Teste que lê os YAML: PR roda só verify e invariants com 1 Postgres; e2e completo só em push na main; matriz sem arm64; 4 workflows desligados | ⬜ | 40min |
| T-002 | IMPL | Ajustar ci.yml, e2e.yml, publish-image.yml e desligar acolhida, relogio, mysql-integracao e release | ⬜ | 45min |
| T-003 | TEST-INT | Teste que prova que o gitleaks reprova um segredo falso plantado no diff | ⬜ | 35min |
| T-004 | IMPL | Passo gitleaks no job verify e configuração de exceções | ⬜ | 25min |
| T-005 | DOCS | Registrar ADR-004 (amd64) na constituição e item "migration compatível com a versão anterior" no template de PR | ⬜ | 15min |
| T-006 | TEST-INT | Teste que confere o item de migration compatível no template de PR | ⬜ | 35min |
| T-007 [P] | TEST-INT | deploy.sh contra Docker local com imagens de mentira: aceita SHA de 40 caracteres, recusa latest, é idempotente | ⬜ | 40min |
| T-008 [P] | TEST-INT | Duas execuções simultâneas do deploy.sh no mesmo ambiente: a segunda espera | ⬜ | 35min |
| T-009 | TEST-INT | Imagem que não sobe: deploy volta às tags anteriores, sai com código 10 e mede o tempo | ⬜ | 45min |
| T-010 | TEST-INT | Deploy de produção tira backup antes e registra o resultado; log sem valores de segredo | ⬜ | 40min |
| T-011 | IMPL | infra/solucao/deploy.sh (backup, tags, baseline, up, saúde, rollback, flock), reaproveitando funções do _common.sh | ⬜ | 1h |
| T-012 | TEST-INT | Teste do YAML: deploy-prod só em workflow_dispatch com ambiente producao e sem gatilho de PR; deploy-hml só após publish-image verde na main | ⬜ | 35min |
| T-013 | IMPL | Workflows deploy-hml.yml e deploy-prod.yml com concurrency por ambiente e smoke test (/ = 200, /app = 307) | ⬜ | 45min |
| T-014 | TEST-INT | backup-externo.sh contra MinIO: gera banco, WAHA e Storage, arquivos saem criptografados e a retenção local mantém 14 | ⬜ | 50min |
| T-015 | TEST-INT | Falha de envio gera alerta no mesmo dia e sai com código diferente de zero | ⬜ | 35min |
| T-016 | IMPL | infra/solucao/backup-externo.sh (age + rclone + alerta + verificação por hash) | ⬜ | 50min |
| T-017 | TEST-INT | Teste do authorized_keys gerado para o deploy: command=, sem pty, sem forwarding | ⬜ | 35min |
| T-018 | TEST-UNIT | Cada ação de infra/solucao/admin tem script numerado com --dry-run e nenhum comando administrativo fora deles | ⬜ | 25min |
| T-019 | TEST-INT | crm-status.sh não imprime padrões de segredo (chaves, tokens, linhas de .env) | ⬜ | 35min |
| T-020 | IMPL | admin/01-swap.sh, 02-firewall.sh, 03-usuarios.sh, 04-mover-vava.sh, 05-cron.sh e crm-status.sh, todos com --dry-run | ⬜ | 1h |
| T-021 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Medir a VPS antes de instalar: memória, CPU, disco e portas abertas, comparando com a estimativa de 9 a 11 GB | ⬜ | 40min |
| T-022 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Swap de 4 GB ativo e persistente após reinício | ⬜ | 40min |
| T-023 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: ufw só com 22, 80, 443/tcp e 443/udp; porta 8000 fechada | ⬜ | 40min |
| T-024 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Como dev: docker ps e leitura de /opt/crm-prod negados; crm-status funciona; deploy só roda o comando fixo | ⬜ | 40min |
| T-025 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: DNS na Hostinger: app, hml e curinga apontando para o IP da VPS; registros antigos revistos | ⬜ | 40min |
| T-026 | TEST-INT | 04-mover-vava.sh em pasta de teste: cria a cópia dos arquivos (inclusive os locais) e --desfazer restaura byte a byte | ⬜ | 40min |
| T-027 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Troca real: só o Caddy do CRM em 80/443, valescaalmeida.com responde 200 e a porta interna do vava recusa de fora; indisponibilidade medida | ⬜ | 40min |
| T-028 | TEST-INT | docker compose config da produção não contém voice-agent e todos os serviços têm limite de memória e CPU | ⬜ | 35min |
| T-029 | IMPL | docker-compose.solucao.yml (limites, prioridade da produção, voice-agent desligado) | ⬜ | 35min |
| T-030 | TEST-INT | Instalador com .env incompleto ou DNS errado falha com mensagem em português e sem instalação pela metade | ⬜ | 35min |
| T-031 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Instalar crm-prod pelo instalador single-server e conferir /, /app, /api/v1/health e Studio e Postgres fechados | ⬜ | 40min |
| T-032 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Nenhuma porta além de 80/443 responde pela internet, inclusive as publicadas pelo Docker | ⬜ | 40min |
| T-033 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Instalar crm-hml com Supabase Cloud, publicada por caddy-sites, sem banco, env ou volumes em comum com a produção | ⬜ | 40min |
| T-034 | CHECK-SMOKE | Deploy real em homologação pelo GitHub e rollback provocado medido abaixo de 2 minutos | ⬜ | 35min |
| T-035 | CHECK-SMOKE | Deploy de produção parado esperando a aprovação do dono e concluído depois do clique | ⬜ | 25min |
| T-036 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Backup real da produção no R2: objeto criptografado e leitura sem credencial negada | ⬜ | 40min |
| T-037 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Restaurar um backup do R2 em ambiente descartável usando só a chave do gerenciador de senhas | ⬜ | 40min |
| T-038 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: Monitor de disponibilidade com alerta no celular e erro de teste no Sentry sem dados sensíveis | ⬜ | 40min |
| T-039 | TEST-INT | Sonda executável (tests/infra/vps/) rodada contra a VPS: medir-memoria.sh por 24 horas, registro de memória livre >= 2 GB e alerta simulado abaixo do limiar | ⬜ | 40min |
| T-040 | DOCS | Runbook docs/solucao-crm/runbooks/fundacao.md: instalação, troca de portas, rollback, restauração, consumo de minutos | ⬜ | 40min |
| T-041 | TEST-INT | Sonda executável (gh api) que registra o consumo de minutos do GitHub no primeiro mês e comparar com a cota | ⬜ | 40min |
| T-042 | REFACTOR | Limpeza dos scripts de infra com testes verdes e evidências em docs/solucao-crm/evidencias/001-fundacao/ | ⬜ | 20min |
| **TOTALIZADOR GERAL** | | **42 tarefas (0 concluídas, 0%)** | | **26h 50min** (restante: 26h 50min) |
