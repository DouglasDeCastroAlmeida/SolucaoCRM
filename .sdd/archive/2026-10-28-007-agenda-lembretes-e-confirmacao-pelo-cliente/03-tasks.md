# Tarefas: Agenda: lembretes e confirmação pelo cliente

> Mudança `007-agenda-lembretes-e-confirmacao-pelo-cliente` · porte M · 2026-10-27
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

### Fatia 1: Banco aditivo e tipos existentes intactos (REQ-001, REQ-005, REQ-006)
- [x] T-001 [TEST-INT] Invariante: nenhum tipo de agendamento existente muda de lembrete nem de chave por causa da migration, campos novos de confirmação e de pedido de remarcar nulos nos compromissos existentes, isolamento entre 2 organizações, funções novas sem EXECUTE para PUBLIC e anon (~50 min) {AC-001.2, AC-005.3, AC-006.1}
- [x] T-002 [SETUP] Reservar o número da migration com pnpm checar:colisao-de-migration e criar o arquivo com cabeçalho -- manifest: (~10 min)
- [x] T-003 [IMPL] Migration aditiva + apêndice idempotente no baseline.sql: client_confirmed_at e client_reschedule_requested_at em calendar_appointments, chave por tipo da confirmação do cliente (desligada nos existentes), kinds novos da Central (~50 min) {AC-001.2, AC-005.3, AC-006.1} deps: T-001, T-002
- [x] T-004 [CHECK-SMOKE] pnpm test:db verde em instalação nova e em atualização (~15 min) deps: T-003 Provado pelo CI no PR #18 (invariants-majors verde, instalação nova e atualização).

### Fatia 2: Lembretes padrão para tipos novos (REQ-001)
- [x] T-005 [TEST-UNIT] Texto padrão em pt-BR, en e es: nome do contato, serviço, data, hora e nome da organização, sem marca fixa, e a frase "Responda 1 ... 2 ..." só quando a confirmação do cliente está ligada no tipo (~35 min) {AC-001.4, AC-001.5}
- [x] T-006 [TEST-UNIT] Tipo novo nasce com lembretes de 24 h e 2 h ligados e texto editável; "ativar lembretes padrão" num tipo existente liga os dois e só isso (~40 min) {AC-001.1, AC-001.3}
- [x] T-007 [TEST-UNIT] Regressão do lembrete: sem telefone, sem canal conectado, contato bloqueado ou fora da janela de horário o lembrete não sai (~30 min) {AC-001.6}
- [x] T-008 [IMPL] Textos padrão com i18n e criação de tipo novo com os dois lembretes ligados (~45 min) {AC-001.1, AC-001.4, AC-001.5} deps: T-004, T-005, T-006
- [x] T-009 [IMPL] Rota e botão "ativar lembretes padrão" na tela do tipo existente, auditado (~40 min) {AC-001.3, AC-001.6} deps: T-007, T-008

### Fatia 3: Confirmação pelo cliente (REQ-002)
- [x] T-010 [TEST-UNIT] Regra pura com relógio injetado: "1", "sim", "confirmo", "ok", "confirmado" em qualquer caixa, com pontuação ou emoji; aceita só até 48 h depois do lembrete, compromisso futuro e pendente; tardia ou sem lembrete recente segue o fluxo normal; repetida não muda; dois compromissos valem para o mais próximo (~55 min) {AC-002.2, AC-002.3, AC-002.4, AC-002.5, AC-002.6}
- [x] T-011 [IMPL] lib/agenda/confirmacao-do-cliente.ts, regra pura de classificação (~40 min) {AC-002.2, AC-002.3, AC-002.4, AC-002.5, AC-002.6} deps: T-010
- [x] T-012 [TEST-INT] Aplicação: grava o campo próprio sem alterar o status nem a confirmação da equipe, agradece com data e hora, o agente de IA não responde à mensagem tratada, funciona com a IA desligada, só considera compromissos da organização do contato (~55 min) {AC-002.1, AC-002.7, AC-002.8, AC-002.9, AC-005.3} deps: T-004
- [x] T-013 [IMPL] Aplicar a regra no ponto de entrada de mensagens antes de acionar o agente, com resposta curta e idempotência por mensagem (~60 min) {AC-002.1, AC-002.7, AC-002.8, AC-002.9} deps: T-011, T-012

### Fatia 4: Pedido de remarcar (REQ-003)
- [x] T-014 [TEST-INT] "2", "cancelar", "não vou" e "remarcar" marcam o pedido, levam a conversa à fila humana, avisam a Central e respondem ao cliente; nada é cancelado ou remarcado sozinho; repetir não duplica; remarcar ou cancelar pela agenda limpa a pendência (~55 min) {AC-003.1, AC-003.2, AC-003.3, AC-003.4} deps: T-004
- [x] T-015 [IMPL] Pedido de remarcar na regra, na fila humana, na Central e na limpeza pela agenda (~60 min) {AC-003.1, AC-003.2, AC-003.3, AC-003.4} deps: T-013, T-014

### Fatia 5: Visibilidade, chaves e auditoria (REQ-004, REQ-005)
- [x] T-016 [TEST-UI] Selo "confirmado pelo cliente" com a hora e pendência "pediu para remarcar" destacada na agenda e no cartão do contato (~40 min) {AC-004.1, AC-004.2}
- [x] T-017 [IMPL] Selos na agenda e no cartão do contato (~50 min) {AC-004.1, AC-004.2} deps: T-016, T-013
- [x] T-018 [TEST-UNIT] Chave por tipo desligada ou chave de instalação AGENDA_CONFIRMACAO_CLIENTE desligada: "1" e "2" seguem o fluxo normal e nenhum dado é apagado (~35 min) {AC-005.1, AC-005.2}
- [x] T-019 [IMPL] Chave por tipo na tela e AGENDA_CONFIRMACAO_CLIENTE em lib/env.ts e .env.example (~40 min) {AC-005.1, AC-005.2} deps: T-018, T-013
- [x] T-020 [TEST-UNIT] Auditoria da confirmação e do pedido de remarcar sem o texto do cliente; rotas novas com Zod, papel e requireSupportWrite antes do efeito (~40 min) {AC-005.4, AC-005.5}
- [x] T-021 [IMPL] Ações de auditoria novas e ajustes nas rotas (~35 min) {AC-005.4, AC-005.5} deps: T-020, T-009, T-015

### Fechamento
- [x] T-022 [TEST-UNIT] Textos novos (selos, respostas automáticas, texto padrão) em pt-BR, en e es pelo dicionário e varredura de marca sem nome ou cor fixos (~30 min) {AC-004.3, AC-006.4}
- [x] T-023 [IMPL] Entradas do dicionário com a chave en/es até a varredura passar (~30 min) {AC-004.3, AC-006.4} deps: T-022, T-008, T-017
- [x] T-024 [TEST-E2E] Jornada pela tela na homologação com WhatsApp real (WAHA): tipo novo, lembrete chega, um cliente responde "1" e outro "2", selo e pendência na agenda (~60 min) {AC-006.2} deps: T-015, T-017, T-021
- [x] T-025 [TEST-E2E] Sonda de produção com os tipos existentes: resultado igual ao de antes e nenhum lembrete novo enviado (~30 min) {AC-006.3}
- [x] T-026 [DOCS] Runbook e roteiro do dono: lembretes padrão, confirmação do cliente, chaves, e a situação da verificação do Google Agenda (~35 min) deps: T-024
- [x] T-027 [CHECK-SMOKE] Implantar na homologação e rodar a jornada com WhatsApp real (~30 min) deps: T-024 Jornada rodada em produção com autorização escrita do dono (evidence/007-agenda/jornada-em-producao-2026-10-27.md).
- [x] T-028 [CHECK-SMOKE] Implantar em produção e rodar a sonda (~30 min) deps: T-027, T-025
- [x] T-029 [REFACTOR] Limpeza com testes verdes (~20 min) deps: T-028 Sem refatoração necessária: CI verde na main.

## Estimativa

<!-- Gerada por `sdd estimate`. Sempre com a linha TOTALIZADOR GERAL. -->
