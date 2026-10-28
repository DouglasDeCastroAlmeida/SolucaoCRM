# Tarefas: Independência do repositório upstream

> Mudança `008-independencia-do-repositorio-upstream` · porte L · 2026-10-28
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

### Fatia 1: Imagens e instalação apontam para o dono do produto (REQ-001)
- [x] T-001 [TEST-INT] Medir antes de mexer: lista de todas as declarações do namespace e da URL de clone (compose, .env de exemplo, matriz de publish-image, kit, Dockerfiles, âncora de teste) e rodada de base de namespace-das-imagens e test:shell no estado atual (~30 min) {AC-001.1, AC-001.2}
- [x] T-002 [TEST-UNIT] Âncora e testes de identidade esperam ghcr.io/douglasdecastroalmeida e DouglasDeCastroAlmeida/SolucaoCRM: compose sem variáveis resolve para o namespace do dono, .env de exemplo idem (~35 min) {AC-001.1, AC-001.4} deps: T-001
- [x] T-003 [TEST-INT] Kit: IMG_NS, URL de clone e consulta da última versão usam o repositório do dono; .env fixado por SHA fica intacto quando o update.sh não aplica versão (nada a atualizar, recusa de anterior) e, com versão nova, as quatro imagens passam à tag dela no namespace do dono sem edição manual (caso novo em update-guard; check em test-validators cobrindo update.sh e diagnostico.sh) (~45 min) {AC-001.2, AC-001.3, AC-001.5} deps: T-001
- [x] T-004 [IMPL] Trocar a âncora, docker-compose.prod.yml, .env.hostgator.example, Dockerfile*, _common.sh, install.sh, comecar.sh e diagnostico.sh numa única mudança coerente (~60 min) {AC-001.1, AC-001.2, AC-001.4, AC-001.5} deps: T-002, T-003
- [ ] T-005 [CHECK-SMOKE] CI verde (verify, invariants, imagens-ok) e test:shell sem regressão; nenhuma imagem em execução na VPS mudou (~30 min) {AC-001.3} deps: T-004

### Fatia 2: Scripts e condições de workflow (REQ-002.1, .2)
- [ ] T-006 [TEST-UNIT] Constantes de repositório de scripts/cortar-release.ts, instalar-guias.sh, vigia-colisao-de-migration.ts e migration-populacao.sh apontam para o dono (~35 min) {AC-002.1}
- [ ] T-007 [TEST-UNIT] Condições github.repository dos workflows e testes de guarda da release leem o dono do repositório e continuam vigiando o mesmo comportamento (~40 min) {AC-002.2, AC-005.3} deps: T-005
- [ ] T-008 [IMPL] Trocar scripts, loop/hooks, release.yml, e2e.yml, acolhida.yml e testes de identidade (guarda-da-release-*, release-chega-na-lp, populacao-do-proximo-nnnn, deskcomm-contribuir) (~50 min) {AC-002.1, AC-002.2, AC-005.3} deps: T-006, T-007

### Fatia 3: Catálogo de extensões sem servidor de terceiro (REQ-003)
- [ ] T-009 [TEST-INT] extensao.sh e gerar-catalogo-de-extensoes sem origem não fazem consulta de rede e avisam; com origem informada funcionam; extensão já instalada continua instalada (~45 min) {AC-003.1, AC-003.2, AC-003.3}
- [ ] T-010 [IMPL] Origem do catálogo sem valor padrão, com mensagem clara (~35 min) {AC-003.1, AC-003.2, AC-003.3} deps: T-009

### Fatia 4: Crédito ao autor original (REQ-004)
- [ ] T-011 [TEST-UNIT] LICENSE mantém o copyright original e acrescenta o do dono; NOTICE existe e diz que é fork MIT sem URL; READMEs nos três idiomas têm o parágrafo Origem e nenhum comando que baixe algo do upstream (~35 min) {AC-004.1, AC-004.2, AC-004.3}
- [ ] T-012 [DOCS] Escrever a linha de copyright, o NOTICE e o parágrafo Origem em pt-BR, en e es (~30 min) {AC-004.1, AC-004.2, AC-004.3} deps: T-011

### Fatia 5: Cerca contra regressão (REQ-005)
- [ ] T-013 [TEST-UNIT] nada-executa-contra-o-upstream: varre os caminhos que executam e reprova melgarafael ou deskcomm.com.br fora da lista de exceções, apontando arquivo e linha; a lista só pode encolher; sabotagem prova que reprova (~50 min) {AC-005.1, AC-005.2} deps: T-005, T-008, T-010, T-012
- [ ] T-014 [IMPL] Montar a lista de exceções com motivo (só o que for legítimo) e o teto gravado (~30 min) {AC-005.1, AC-005.2} deps: T-013

### Fatia 6: Release próprio (REQ-002.4, .5)
- [ ] T-015 [TEST-UNIT] O workflow de corte usa só GITHUB_TOKEN com permissões mínimas, sem aplicativo nem segredo de terceiro, e é disparável manualmente; testes de workflows-tem-permissions seguem verdes (~40 min) {AC-002.4}
- [ ] T-016 [TEST-UNIT] O corte consome os fragmentos antes de o changelog passar do limite de 30.000 bytes e o aviso de proximidade aparece antes do estouro (~35 min) {AC-002.5}
- [ ] T-017 [IMPL] .github/workflows/corte-de-versao.yml e comentário do porquê nos jobs desligados do upstream (~50 min) {AC-002.4, AC-002.5} deps: T-015, T-016
- [ ] T-018 [CHECK-SMOKE] Disparar o corte manualmente e conferir o PR gerado, o CI dele e a tag depois do merge (~30 min) {AC-002.4} deps: T-017

### Fatia 7: Executor de CI (REQ-002.3)
- [ ] T-019 [TEST-INT] so-o-que-e-nosso.sh aceita o repositório do dono e recusa um alheio e um fork; instalar.sh e vaga.sh usam o repositório do dono (~45 min) {AC-002.3}
- [ ] T-020 [IMPL] Trocar o repositório esperado do executor com EXECUTOR_PROPRIO desligada e religar depois (~40 min) {AC-002.3} deps: T-019
- [ ] T-021 [CHECK-SMOKE] PR de teste roda no executor próprio e um fork continua recusado (~30 min) {AC-002.3} deps: T-020

### Fechamento
- [ ] T-022 [CHECK-SMOKE] Deploy na homologação e sondas de / (200) e /app (307); produção só com autorização escrita do dono (~30 min) deps: T-021, T-018
- [ ] T-023 [DOCS] Atualizar CLAUDE.md e AGENTS.md nos trechos que mandam executar algo do upstream, e o inventário de PI para a refatoração futura (~30 min) deps: T-022
- [ ] T-024 [REFACTOR] Limpeza com testes verdes (~20 min) deps: T-023

## Estimativa

| **TOTALIZADOR GERAL** | | **24 tarefas (0 concluídas, 0%)** | | **15h** (restante: 15h) |
