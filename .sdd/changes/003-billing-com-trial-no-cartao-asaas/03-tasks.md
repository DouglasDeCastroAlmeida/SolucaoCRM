# Tarefas: Billing com trial no cartão (Asaas)

> Mudança `003-billing-com-trial-no-cartao-asaas` · porte L · 2026-10-27
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

### Fatia 1: Prova do Checkout no sandbox, antes de qualquer código (REQ-010)
- [x] T-001 [TEST-INT] Sonda no sandbox do Asaas (credencial do dono em C:\Users\Douglas\.secrets\asaas-sandbox.env): Checkout hospedado aceita 1ª cobrança em hoje+7 sem cobrar no ato, aceita ciclo anual, valida o cartão, devolve ao callback, e onde a NFS-e é configurada; grava evidência (~60 min) {AC-010.1}
- [x] T-002 [DOCS] Registrar o resultado em docs/solucao-crm/evidencias/003-billing/ e decidir: passou segue; falhou para a esteira e volta ao design (~20 min) {AC-010.1} deps: T-001

### Fatia 2: Banco aditivo, cortesia por padrão e isolamento (REQ-001, REQ-002, REQ-010)
- [x] T-003 [TEST-INT] Invariante de migração: toda marca com cobranca_ligada falsa, nenhuma assinatura criada para organização existente, gatilho com marca desligada idêntico ao de hoje, instalação nova e atualização com dados (~50 min) {AC-001.1, AC-002.1} deps: T-002
- [x] T-004 [TEST-INT] Invariante de isolamento e grants: 2 marcas, planos de uma não vazam para a outra, único por (marca, hash do documento), único por pedido de reembolso, funções novas sem EXECUTE para PUBLIC e anon (~50 min) {AC-010.2, AC-003.5, AC-006.5} deps: T-002
- [x] T-005 [SETUP] Reservar o número da migration com pnpm checar:colisao-de-migration e criar o arquivo com cabeçalho -- manifest: (~10 min) deps: T-002
- [x] T-006 [IMPL] Migration aditiva + apêndice idempotente no baseline.sql: brands.cobranca_ligada, cobranca_planos.brand_id, cobranca_assinaturas.trial_com_cartao, CHECK de avisos ampliado, cobranca_trial_documentos, cobranca_reembolsos (~60 min) {AC-001.1, AC-002.1, AC-010.2, AC-003.5, AC-006.5} deps: T-003, T-004, T-005
- [x] T-007 [IMPL] Ramo novo de fn_trial_na_criacao_da_org e fn_create_tenant_with_owner só para marca com cobrança ligada, com revoke de PUBLIC e anon (~60 min) {AC-001.1, AC-010.2} deps: T-006
- [x] T-008 [CHECK-SMOKE] pnpm test:db verde em instalação nova e em atualização (~15 min) deps: T-006, T-007

### Fatia 3: Chave e planos por marca no painel (REQ-001, REQ-009)
- [x] T-009 [TEST-UNIT] Rota de liga/desliga da cobrança da marca: recusa sem plano com preço ou sem provedor, desligar não apaga assinatura, auditoria, requireSupportWrite antes do efeito (~40 min) {AC-001.3, AC-001.4, AC-001.5, AC-009.4}
- [x] T-010 [TEST-UNIT] Rotas e repositório dos planos cobráveis da marca: CRUD, Zod, só admin da plataforma, auditoria (~40 min) {AC-009.1, AC-009.4}
- [x] T-011 [IMPL] Rotas admin de cobrança da marca e planos, erros canônicos e ações de auditoria novas (~60 min) {AC-001.3, AC-001.4, AC-001.5, AC-009.1, AC-009.4} deps: T-008, T-009, T-010
- [x] T-012 [TEST-UI] Aba Cobrança do editor de marcas: planos, chave, mensagem do que falta para ligar (~35 min) {AC-009.1, AC-001.3}
- [x] T-013 [IMPL] Aba Cobrança no editor de marcas; planos da marca passam a ler e gravar cobranca_planos (ADR-002); ajustar testes e telas da SP1 que tocavam brand_plans (~60 min) {AC-009.1} deps: T-011, T-012

### Fatia 4: Adaptador do Asaas e hash do documento (REQ-003)
- [x] T-014 [TEST-CONTRACT] Adaptador iniciarTrialComCartao com fetch simulado: corpo do checkout (só cartão, 1ª cobrança em hoje+trial_dias, URLs na marca, assinatura recorrente), nenhum dado de cartão, erro do provedor sem texto livre, pedido de NFS-e (~50 min) {AC-003.1, AC-003.4, AC-008.4, AC-007.1} deps: T-002
- [x] T-015 [IMPL] Método no contrato e no adaptador do Asaas por /v3/checkouts, com releitura antes de criar (~60 min) {AC-003.1, AC-003.4, AC-007.1, AC-008.4} deps: T-014
- [x] T-016 [TEST-UNIT] Hash HMAC do CPF/CNPJ normalizado: determinístico, distinto por chave, nunca devolve o documento (~25 min) {AC-003.5, AC-003.6}
- [x] T-017 [IMPL] lib/billing-trial/documento-hash.ts e a chave derivada de segredo de servidor (se não houver segredo adequado, env nova em .env.example e lib/env.ts) (~35 min) {AC-003.5, AC-003.6} deps: T-016, T-008

### Fatia 5: Cadastro, Checkout e trial de 7 dias (REQ-001, REQ-003, REQ-005)
- [x] T-018 [TEST-UNIT] Cadastro por marca com cobrança ligada: planos da marca, organização nasce suspensa por entrada paga, marca desligada intacta, trial repetido do mesmo documento recusado na mesma marca e concedido em outra (~50 min) {AC-001.1, AC-001.2, AC-003.5, AC-003.6} deps: T-008, T-017
- [x] T-019 [TEST-UNIT] iniciar e confirmar: sucesso vira trial e reativa a org, volta sem concluir mantém suspensa e permite refazer, clique duplo e retorno duplo, checkout vivo reaproveitado, Asaas fora do ar com mensagem clara (~55 min) {AC-003.2, AC-003.3, AC-003.7, AC-005.1, AC-008.4} deps: T-015
- [x] T-020 [TEST-INT] Invariante: dois retornos concorrentes geram uma assinatura; pagamento confirmado reativa org suspensa por cobrança (~40 min) {AC-003.7, AC-005.4} deps: T-008
- [x] T-021 [IMPL] signUp, provision e cadastro.ts leem os planos da marca e repassam marca e plano; espelho TypeScript do gatilho (~60 min) {AC-001.1, AC-001.2, AC-003.5, AC-003.6} deps: T-018, T-007
- [x] T-022 [IMPL] lib/billing-trial/iniciar.ts, confirmar.ts, rota /cobranca/iniciar e ajuste de /cobranca/volta (~60 min) {AC-003.2, AC-003.3, AC-003.7, AC-005.1, AC-005.4, AC-008.4} deps: T-019, T-020, T-015, T-021

### Fatia 6: Régua, avisos e estados (REQ-004, REQ-005)
- [x] T-023 [TEST-UNIT] Régua pura com relógio injetado: aviso 2 dias e 1 dia antes da 1ª cobrança, sem aviso se cancelou, sem duplicar, atraso com tolerância de 3 dias, suspensão com aviso final de 48 h, cancelamento no trial sem cobrança (~50 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.4, AC-005.2, AC-005.3, AC-005.5}
- [x] T-024 [TEST-UNIT] E-mails e avisos na Central: nome, remetente e link no host da marca, pt/en/es pelo dicionário, sem texto fixo de marca (~40 min) {AC-004.5, AC-010.4}
- [x] T-025 [IMPL] Avisos novos no vocabulário, régua, avisos e e-mails com host da marca; piso da tolerância de 5 para 3 sem mudar valores já configurados (~60 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.4, AC-004.5, AC-005.2, AC-005.3, AC-005.5, AC-010.4} deps: T-023, T-024, T-008
- [x] T-026 [TEST-INT] Conta cancelada depois de pagar: acesso até o fim do período e dados mantidos 90 dias antes de anonimizar (~40 min) {AC-005.6} deps: T-008
- [x] T-027 [IMPL] Conferir e, se faltar, ligar o prazo de 90 dias e a anonimização da conta cancelada (~45 min) {AC-005.6} deps: T-026

### Fatia 7: Cortesia e conversão (REQ-002)
- [ ] T-028 [TEST-INT] Cortesia: cron, rodada, régua e webhook não avisam, atrasam nem suspendem org sem assinatura (~40 min) {AC-002.2} deps: T-008
- [ ] T-029 [TEST-UNIT] Rota de conversão de cortesia em cobrada: só admin da plataforma, auditoria, requireSupportWrite (~30 min) {AC-002.3, AC-009.4}
- [ ] T-030 [IMPL] Rota de conversão e estado "cortesia" derivado para o painel (~45 min) {AC-002.2, AC-002.3, AC-009.4} deps: T-028, T-029

### Fatia 8: Cancelar, trocar, reembolso e nota (REQ-006, REQ-007)
- [ ] T-031 [TEST-UNIT] Cancelar no trial e ativa mostrando até quando vale; trocar de plano com pró-rata mantendo a data de renovação (~40 min) {AC-006.1, AC-006.2}
- [ ] T-032 [TEST-UNIT] Reembolso: janela de 7 dias após a 1ª cobrança paga, pedido único por pagamento, fora da janela recusado na rota e sem botão (~45 min) {AC-006.3, AC-006.4, AC-006.5}
- [ ] T-033 [TEST-UNIT] Link da NFS-e lido do Asaas e falha de emissão que não trava o pagamento e avisa a Central (~35 min) {AC-007.2, AC-007.3}
- [ ] T-034 [IMPL] lib/billing-trial/reembolso.ts, rota, item na Central, cancelamento da conta e botão Pedir reembolso (~60 min) {AC-006.3, AC-006.4, AC-006.5} deps: T-032, T-008
- [ ] T-035 [IMPL] lib/billing-trial/nota.ts, link da nota na tela e ajustes de cancelar e trocar (~55 min) {AC-006.1, AC-006.2, AC-007.2, AC-007.3} deps: T-031, T-033, T-015

### Fatia 9: Confiabilidade do webhook e da conciliação (REQ-008)
- [ ] T-036 [TEST-UNIT] Webhook com token inválido recusado, evento repetido ou fora de ordem com o mesmo estado final, conciliação corrige webhook perdido, divergência sem solução abre aviso e não muda acesso (~50 min) {AC-008.1, AC-008.2, AC-008.3, AC-008.5}
- [ ] T-037 [IMPL] Ajustes de sincronizar e rodada para o trial com cartão e aviso de divergência na Central (~55 min) {AC-008.1, AC-008.2, AC-008.3, AC-008.5} deps: T-036, T-022

### Fatia 10: Painel de contas (REQ-009)
- [ ] T-038 [TEST-UI] Painel de contas: filtro por estado e por marca, detalhes com plano, datas e link do Asaas (~40 min) {AC-009.2, AC-009.3}
- [ ] T-039 [IMPL] Filtros e detalhes no PainelDeContas (~50 min) {AC-009.2, AC-009.3} deps: T-038, T-030

### Fatia 11: Prova pela tela e liberação segura (REQ-002, REQ-010)
- [ ] T-040 [TEST-E2E] Jornada pela tela na homologação com o sandbox: cadastro, Checkout, trial, aviso, cobrança, atraso, suspensão e reativação, com evidência em evidence/ (~60 min) {AC-010.3} deps: T-022, T-025, T-034
- [ ] T-041 [TEST-E2E] Sonda de produção com todas as marcas desligadas: resultado igual ao de antes (~30 min) {AC-002.4, AC-010.5}
- [ ] T-042 [DOCS] Runbook e roteiro do dono: conta Asaas de produção, dados fiscais com o contador, V-3, texto do arrependimento com advogado, como ligar a marca (~40 min) deps: T-040
- [ ] T-043 [CHECK-SMOKE] Implantar na homologação e rodar a jornada com o sandbox (~30 min) deps: T-040
- [ ] T-044 [CHECK-SMOKE] Implantar em produção com todas as marcas desligadas e rodar a sonda (~30 min) deps: T-043, T-041
- [ ] T-045 [REFACTOR] Limpeza com testes verdes e marcação de brand_plans como supersedida (~25 min) PORTÃO DE RELEASE: nenhuma marca liga a cobrança em produção antes de a hml provar, com pagamento real no sandbox pela nossa rota, que o externalReference chega à assinatura e que a conta é reativada com UMA assinatura (o ligar-cobrança não consegue checar isso; ver evidencias/003-billing/README.md) deps: T-044

## Estimativa

<!-- Gerada por `sdd estimate`. Sempre com a linha TOTALIZADOR GERAL. -->
