# Tarefas: Ajustes de texto e botao da cobranca no trial com cartao

> Mudança `010-ajustes-de-texto-e-botao-da-cobranca-no-trial-com-cartao` · porte S · 2026-11-04
> Fatias verticais e testáveis, derivadas dos critérios de aceite. Teste antes da implementação.

### Fatia 1: Aviso de atraso sem "trocar o cartão"
- [x] T-001 [TEST-UNIT] avisos `venceu` e `suspende_em_breve` com origem cartão não contêm "Troque o cartão" e mandam pagar pelo link da fatura; ajusta as asserções de lib/cobranca/avisos.test.ts:100-101 (~20 min) {AC-001.1, AC-001.2}
- [x] T-002 [IMPL] lib/cobranca/avisos.ts: trocar os dois textos (e o comentário de lib/cobranca/regua.ts:62) e registrar a frase nova em lib/i18n/dicionario.ts (~20 min) {AC-001.1, AC-001.2} deps: T-001

### Fatia 2: "Pagar agora" só quando há o que pagar
- [x] T-003 [TEST-UNIT] função pura `mostrarPagarAgora`: Asaas em trial com assinatura viva e cobrança agendada = não mostra; em atraso, pendente, trial sem assinatura viva ou link ausente = mostra conforme o caso; avisos da Central e e-mails continuam com o botão (lib/cobranca/central.test.ts, emails.test.ts) (~30 min) {AC-002.1, AC-002.2, AC-002.3}
- [x] T-004 [IMPL] lib/cobranca/pagar-agora.ts e uso em components/cobranca/AcoesDaAssinatura.tsx (~25 min) {AC-002.1, AC-002.2} deps: T-003
- [ ] T-005 [TEST-E2E] prova pela tela na hml: painel do plano em trial com cartão sem o botão e conta em atraso com o botão, com captura em evidence/010-cobranca-ajustes/ (~40 min) {AC-002.1, AC-002.2} deps: T-004

### Fechamento
- [x] T-006 [DOCS] fragmento em .changes/ (nada_mudou para o operador) e nota no jornada-hml.md de que os achados 3 e 4 foram tratados (~15 min) {AC-001.1, AC-002.1} deps: T-002, T-004
