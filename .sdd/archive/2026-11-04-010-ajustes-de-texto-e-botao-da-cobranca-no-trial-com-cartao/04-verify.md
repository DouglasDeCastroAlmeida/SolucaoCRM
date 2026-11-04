# Verificação: Ajustes de texto e botao da cobranca no trial com cartao

> Mudança `010-ajustes-de-texto-e-botao-da-cobranca-no-trial-com-cartao` · porte S · 2026-11-04
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.

## Evidências

- `npx vitest run lib/cobranca lib/i18n` → 36 arquivos, 716 testes passaram, 0 falhas.
- `tsc --noEmit -p tsconfig.typecheck.json` → 0 erros nos arquivos da 010. (Neste Windows aparecem 3 erros em `lib/channels/email/html-seguro.ts`, da 005, porque `sanitize-html` não está instalado neste checkout; o CI da `main` passou com o pacote.)
- eslint em `avisos.ts`, `pagar-agora.ts` e `AcoesDaAssinatura.tsx` → 0 avisos.
- CI do PR #58 (código) e do #60 (prova pela tela): todos os checks obrigatórios verdes (verify, invariants, build-and-size, imagens-ok).
- Prova pela tela na hml (commit `08f85e427`): ver `docs/solucao-crm/evidencias/010-cobranca-ajustes/prova-pela-tela.md`. Teste em dia sem "Pagar agora" (PASSOU), atraso com "Pagar agora" (PASSOU), medidas por ferramenta sem rolagem lateral.
- Não rodado: `test:db` e e2e (a 010 não toca banco).

## Rastreabilidade

| Critério | Tarefas | Teste / prova |
|---|---|---|
| AC-001.1 | T-001, T-002 | `lib/cobranca/avisos.test.ts` (aviso `venceu` com origem cartão) |
| AC-001.2 | T-001, T-002 | `lib/cobranca/avisos.test.ts` (aviso `suspende_em_breve`), `lib/cobranca/sincronizar.test.ts` |
| AC-002.1 | T-003, T-004, T-005 | `lib/cobranca/pagar-agora.test.ts`; prova pela tela `02-trial-aviso-plano.png` |
| AC-002.2 | T-003, T-004, T-005 | `lib/cobranca/pagar-agora.test.ts` (atraso, cancelada, ativa); prova pela tela `05-atraso-plano.png` |
| AC-002.3 | T-003 | `lib/cobranca/emails.test.ts`, `lib/cobranca/central.test.ts` (botão com link, sem alteração) — cobertos por existência; `central.ts` e `emails.ts` não foram tocados |

## Revisão de código

`sdd-reviewer` (revisão final): APROVADO, sem bloqueante. Sugestão aplicada: o hub de conta suspensa (`noHub`) sempre mostra "Pagar agora". Segunda sugestão (passar `temLink: link !== null`) aplicada junto.

## Segurança

Sem segredo, entrada nova nem dependência nova. O botão só é escondido quando Asaas + teste + `temProvedor` + `assinaturasVivas > 0` valem juntos; em atraso, cancelada, hub de suspensão ou sem assinatura viva o caminho de pagamento permanece.

## Desvios de escopo

- `lib/cobranca/sincronizar.test.ts`: asserção do texto do aviso ajustada (consequência direta do AC-001.1).
- Tradução em inglês: as frases antigas "Troque o cartão…" ainda estavam em `lib/i18n/traducoes/en.json`; trocadas pelas novas (achado do auditor). Sem `zh-CN` com essas frases.
- Fora de escopo mantido: troca de cartão real (mudança separada) e ordem onboarding × faixa (já era o comportamento).

## Specs vivas

N/A — porte S: ajuste de texto e de exibição, sem capacidade nova nem mudança de contrato.

## Parecer

**APROVADO.** Os cinco critérios têm teste e implementação, a prova pela tela passou na hml e o escopo ficou dentro do pedido.
