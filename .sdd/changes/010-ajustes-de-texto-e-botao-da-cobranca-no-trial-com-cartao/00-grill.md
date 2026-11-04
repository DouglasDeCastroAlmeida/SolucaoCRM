# Grill rápido: Ajustes de texto e botao da cobranca no trial com cartao

> Mudança `010-ajustes-de-texto-e-botao-da-cobranca-no-trial-com-cartao` · porte S · 2026-11-04
> Para ajustes pequenos (poucos arquivos, comportamento claro). Sem PRD nem design:
> os critérios de aceite ficam aqui mesmo.

## Pedido original

Achados 3 e 4 da jornada hml da 003 (`docs/solucao-crm/evidencias/003-billing/jornada-hml.md`), com a decisão do dono em 04/11/2026
("Ok" às recomendações do agente):

1. O texto promete "Troque o cartão em Plano e cobrança", mas a tela não tem troca de cartão. Corrigir o texto agora; a troca de verdade fica como mudança separada, antes de ligar a cobrança real.
2. O painel do plano mostra "Pagar agora" ao lado de "1ª cobrança agendada". Esconder o botão enquanto a cobrança está agendada e em dia; mostrar só com atraso ou pendência.
3. (Onboarding antes da faixa.) **Já é o comportamento atual** (achado 2 da jornada: a faixa só aparece depois do onboarding). Nada a construir; sai do escopo.

## Contexto levantado no código

- `lib/cobranca/avisos.ts` (linhas ~61 e ~85): textos dos avisos `venceu` e `suspende_em_breve` com origem `cartao` dizem "Troque o cartão em Plano e cobrança". Cobertos por `lib/cobranca/avisos.test.ts:100-101`.
- `lib/cobranca/regua.ts:62` comenta o texto "Troque o cartão". Os e-mails de atraso usam `lib/cobranca/emails.ts` (botão "Pagar agora" com o link da fatura, que fica).
- `components/cobranca/AcoesDaAssinatura.tsx` (~261-267): o botão do link da fatura. Em Asaas "ativa" já vira "Adiantar a próxima mensalidade"; no trial com cartão ainda aparece "Pagar agora".
- `lib/cobranca/central.ts`: "Pagar agora" nos avisos da Central é pedido do dono (link de pagamento em todo aviso). **Não muda.**

## Perguntas e respostas

### P1. Corrigir o texto ou construir a troca de cartão agora?
- Recomendação do agente: corrigir o texto agora; construir a troca como mudança própria antes de ligar a cobrança real.
- Resposta: aceita a recomendação ("Ok", 04/11/2026)

### P2. O que o aviso passa a dizer, sem a troca de cartão?
- Recomendação do agente: mandar pagar pelo link da fatura ("Pague pelo link para manter o acesso"), que é o caminho que existe e que o botão do aviso já oferece.
- Resposta: aceita a recomendação ("Ok", 04/11/2026)

### P3. "Pagar agora" no painel durante o trial com cartão
- Recomendação do agente: esconder enquanto a 1ª cobrança está agendada e em dia; mostrar com atraso ou pendência.
- Resposta: aceita a recomendação ("Ok", 04/11/2026)

### P4. Onboarding antes da faixa
- Fonte: `docs/solucao-crm/evidencias/003-billing/jornada-hml.md` achado 2 — a faixa só aparece depois do onboarding; já é o comportamento.
- Resposta: nada a mudar (corrige a recomendação anterior do agente, que tratou como defeito).

### P5. Rollback
- Fonte: mudança só de texto e de exibição, sem banco nem contrato; reverter o commit basta.

## Critérios de aceite

- **AC-001.1** Dado uma conta com cobrança de cartão em atraso (`venceu`), quando o aviso é montado, então o texto não manda "trocar o cartão" e indica pagar pelo link da fatura.
- **AC-001.2** Dado uma conta com cartão cuja suspensão se aproxima (`suspende_em_breve`), quando o aviso é montado, então o texto não manda "trocar o cartão" e indica pagar pelo link da fatura.
- **AC-002.1** Dado uma conta em teste grátis com cartão e a 1ª cobrança agendada em dia, quando o painel do plano é exibido, então não há botão "Pagar agora".
- **AC-002.2** Dado uma conta com cobrança em atraso ou pendente, quando o painel do plano é exibido, então o botão "Pagar agora" aparece com o link da fatura.
- **AC-002.3** Dado um aviso da Central ou um e-mail de atraso, quando é montado, então o botão "Pagar agora" com o link da fatura continua presente.

## Decisões

- **D-01** Texto corrigido agora; troca de cartão real é mudança separada, a abrir antes de ligar a cobrança real.
- **D-02** "Pagar agora" some só no painel do trial em dia; avisos e e-mails não mudam.
- **D-03** Item de onboarding/faixa descartado: já funciona assim.

## Fora de escopo

- Construir a troca de cartão (mudança própria).
- Mudar a ordem do onboarding ou da faixa.
- Mexer em avisos da Central, e-mails, régua de atraso ou tolerância.
- Banco, migration, contrato de API.
