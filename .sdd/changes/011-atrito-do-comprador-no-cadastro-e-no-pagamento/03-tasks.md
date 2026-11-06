# Tarefas: Atrito do comprador no cadastro e no pagamento

> Mudança `011-atrito-do-comprador-no-cadastro-e-no-pagamento` · porte M · 2026-11-06
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

### Fatia 0: medir o payload real do webhook (decide o REQ-001)
- [ ] T-001 [TEST-INT] Pagar um checkout de teste no sandbox pela hml sem voltar ao site e registrar em `evidence/011-atrito/` se o corpo do webhook traz `checkoutSession` (sem token nem dado pessoal) (~35 min) {AC-004.1}

### Fatia 1: o aviso do Asaas acha a empresa pelo checkout e reativa a conta
- [x] T-002 [TEST-UNIT] Teste "AC-001.2: sem cliente gravado, acha a empresa pelo checkout_provedor_id" falhando (~25 min) {AC-001.2} deps: T-001
- [x] T-003 [TEST-INT] Testes da rota do webhook: "AC-001.1" acha por checkoutSession e dispara a releitura; "AC-001.3" checkout desconhecido vira cliente_desconhecido sem linha nova; "AC-001.6" sem checkoutSession mantém o descarte de hoje (~35 min) {AC-001.1, AC-001.3, AC-001.6} deps: T-001
- [x] T-004 [IMPL] Webhook: quando provedor_cliente_id não acha, buscar a organização por checkout_provedor_id e só acordar a releitura (~30 min) {AC-001.1, AC-001.2, AC-001.3, AC-001.6} deps: T-002, T-003
- [x] T-005 [TEST-INT] Testes "AC-001.4" aviso forjado só relê o Asaas e a conta continua suspensa; "AC-001.7" token em tempo constante, nunca gravado, estado só pela API (~35 min) {AC-001.4, AC-001.7} deps: T-004
- [x] T-006 [TEST-INT] Teste "AC-001.5" webhook, retorno e conciliação em qualquer ordem geram uma só assinatura e uma só reativação (~35 min) {AC-001.5} deps: T-004
- [x] T-007 [IMPL] Ajustes que T-005 e T-006 exigirem, se falharem, e log do motivo do achado sem dado pessoal (~20 min) {AC-001.4, AC-001.5, AC-001.7} deps: T-005, T-006

### Fatia 2: o hub explica a espera
- [x] T-008 [TEST-UI] Testes do hub: "AC-002.1" mostra "Estamos confirmando o seu pagamento" com a orientação de 1 hora; "AC-002.2" mantém "Já paguei"; "AC-002.3" sem checkout em confirmando mostra o aviso de sempre (~30 min) {AC-002.1, AC-002.2, AC-002.3}
- [x] T-009 [TEST-UNIT] Testes "AC-002.4" conta reativada não mostra a mensagem; "AC-002.5" textos em pt-BR, en e es vêm do dicionário, sem texto fixo de marca (~20 min) {AC-002.4, AC-002.5}
- [x] T-010 [IMPL] Mensagem de confirmação em `app/account-suspended` e textos em `lib/i18n` (pt-BR, en, es) (~30 min) {AC-002.1, AC-002.2, AC-002.3, AC-002.4, AC-002.5} deps: T-008, T-009

### Fatia 3: o cadastro não afirma um envio que não aconteceu
- [x] T-011 [TEST-INT] Testes de signUp: "AC-003.1" falha de envio libera a reserva e a nova tentativa envia; "AC-003.2" envio com sucesso mantém o bloqueio de 60 s; "AC-003.4" falha mostra a mensagem de falha e nunca "Já enviamos" (~35 min) {AC-003.1, AC-003.2, AC-003.4}
- [x] T-012 [TEST-INT] Testes de signUp: "AC-003.3" dois cliques juntos pedem um só e-mail; "AC-003.5" e-mail já existente continua indistinguível do sucesso (~35 min) {AC-003.3, AC-003.5}
- [x] T-013 [IMPL] Liberar a reserva de reenvio só quando o envio falha (`email_nao_enviado`), mantendo anti-enumeração (~30 min) {AC-003.1, AC-003.2, AC-003.3, AC-003.4, AC-003.5} deps: T-011, T-012

### Fatia 4: prova na hml
- [ ] T-014 [TEST-E2E] Conta nova na marca de teste paga no sandbox sem voltar ao site: reativada em menos de 1 minuto e `conferir-pagamento-hml.mjs` passa A1 a A4 e B1 a B4 (~50 min) {AC-004.2} deps: T-007, T-010
- [ ] T-015 [TEST-E2E] Captura do hub na espera, em `evidence/011-atrito/` (~50 min) {AC-004.3} deps: T-010
- [ ] T-016 [DOCS] Fragmento em `.changes/`, nota na jornada da hml e linha no mapa de jornadas (~15 min) deps: T-014

### Fechamento
- [ ] T-017 [REFACTOR] Limpeza com testes verdes, suíte `pnpm test:unit` sem caminho, typecheck e lint (~20 min) deps: T-007, T-010, T-013

## Estimativa

| Tarefa | Tipo | Descrição | Status | Estimativa |
| :-- | :-- | :-- | :-: | --: |
| T-001 | TEST-INT | Pagar um checkout de teste no sandbox pela hml sem voltar ao site e registrar em `evidence/011-atrito/` se o corpo do webhook traz `checkoutSession` (sem token nem dado pessoal) | ⬜ | 35min |
| T-002 | TEST-UNIT | Teste "AC-001.2: sem cliente gravado, acha a empresa pelo checkout_provedor_id" falhando | ⬜ | 25min |
| T-003 | TEST-INT | Testes da rota do webhook: "AC-001.1" acha por checkoutSession e dispara a releitura; "AC-001.3" checkout desconhecido vira cliente_desconhecido sem linha nova; "AC-001.6" sem checkoutSession mantém o descarte de hoje | ⬜ | 35min |
| T-004 | IMPL | Webhook: quando provedor_cliente_id não acha, buscar a organização por checkout_provedor_id e só acordar a releitura | ⬜ | 30min |
| T-005 | TEST-INT | Testes "AC-001.4" aviso forjado só relê o Asaas e a conta continua suspensa; "AC-001.7" token em tempo constante, nunca gravado, estado só pela API | ⬜ | 35min |
| T-006 | TEST-INT | Teste "AC-001.5" webhook, retorno e conciliação em qualquer ordem geram uma só assinatura e uma só reativação | ⬜ | 35min |
| T-007 | IMPL | Ajustes que T-005 e T-006 exigirem, se falharem, e log do motivo do achado sem dado pessoal | ⬜ | 20min |
| T-008 | TEST-UI | Testes do hub: "AC-002.1" mostra "Estamos confirmando o seu pagamento" com a orientação de 1 hora; "AC-002.2" mantém "Já paguei"; "AC-002.3" sem checkout em confirmando mostra o aviso de sempre | ⬜ | 30min |
| T-009 | TEST-UNIT | Testes "AC-002.4" conta reativada não mostra a mensagem; "AC-002.5" textos em pt-BR, en e es vêm do dicionário, sem texto fixo de marca | ⬜ | 20min |
| T-010 | IMPL | Mensagem de confirmação em `app/account-suspended` e textos em `lib/i18n` (pt-BR, en, es) | ⬜ | 30min |
| T-011 | TEST-INT | Testes de signUp: "AC-003.1" falha de envio libera a reserva e a nova tentativa envia; "AC-003.2" envio com sucesso mantém o bloqueio de 60 s; "AC-003.4" falha mostra a mensagem de falha e nunca "Já enviamos" | ⬜ | 35min |
| T-012 | TEST-INT | Testes de signUp: "AC-003.3" dois cliques juntos pedem um só e-mail; "AC-003.5" e-mail já existente continua indistinguível do sucesso | ⬜ | 35min |
| T-013 | IMPL | Liberar a reserva de reenvio só quando o envio falha (`email_nao_enviado`), mantendo anti-enumeração | ⬜ | 30min |
| T-014 | TEST-E2E | Conta nova na marca de teste paga no sandbox sem voltar ao site: reativada em menos de 1 minuto e `conferir-pagamento-hml.mjs` passa A1 a A4 e B1 a B4 | ⬜ | 50min |
| T-015 | TEST-E2E | Captura do hub na espera, em `evidence/011-atrito/` | ⬜ | 50min |
| T-016 | DOCS | Fragmento em `.changes/`, nota na jornada da hml e linha no mapa de jornadas | ⬜ | 15min |
| T-017 | REFACTOR | Limpeza com testes verdes, suíte `pnpm test:unit` sem caminho, typecheck e lint | ⬜ | 20min |
| **TOTALIZADOR GERAL** | | **17 tarefas (0 concluídas, 0%)** | | **8h 50min** (restante: 8h 50min) |
