# Tarefas: {{TITLE}}

> Mudança `{{CHANGE_ID}}` · porte {{SIZE}} · {{DATE}}
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

<!-- PREENCHA: agrupe por fatia (critério ou fluxo), não por camada técnica. Exemplo:

### Fatia 1: <comportamento do AC-001.1>
- [ ] T-001 [TEST-UNIT] Teste "AC-001.1: ..." falhando (~20 min) {AC-001.1}
- [ ] T-002 [IMPL] Implementar o mínimo para T-001 passar (~25 min) {AC-001.1} deps: T-001

### Fatia 2: <comportamento do AC-001.2>
- [ ] T-003 [P] [TEST-INT] ... (~35 min) {AC-001.2}
- [ ] T-004 [IMPL] ... (~30 min) {AC-001.2} deps: T-003

### Fechamento
- [ ] T-005 [REFACTOR] Limpeza com testes verdes (~15 min) deps: T-002, T-004
-->

## Estimativa

<!-- Gerada por `sdd estimate`. Sempre com a linha TOTALIZADOR GERAL. -->
