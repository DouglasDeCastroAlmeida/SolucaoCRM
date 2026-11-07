# Verificação: Atrito do comprador no cadastro e no pagamento

> Mudança `011-atrito-do-comprador-no-cadastro-e-no-pagamento` · porte M · 2026-11-07
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.

## Evidências

Executadas pelo auditor (`sdd-auditor`) nesta sessão, sobre o código da main `1587b98` (PRs #75 e #76):
- testes focados (`lib/cobranca`, `lib/billing-trial`, `app/api/v1/webhooks`, `app/account-suspended`, `app/actions/auth`, `lib/auth`, `tests/unit/hub-confirmando-i18n.test.ts`) → 76 arquivos, 1168 testes passaram, 0 falhas
- `eslint` nos 7 arquivos de produção tocados → exit 0, sem avisos
- `typecheck` → 3 erros, todos em `lib/channels/email/html-seguro.ts` (`sanitize-html` ausente na junction local, mudança 005); nenhum em código desta mudança
- suíte completa local → NÃO executada: a rodada local foi interrompida e não vale; a evidência da suíte completa é o CI verde dos PRs #75 e #76 (`verify-parte` 1 a 4, `invariants`, `build-and-size`, `imagens-ok`)
- e2e e cobertura (`coverageMin` não configurado) → não verificados localmente
- prova na hml (07/11/2026): conta nova pela tela da marca de teste, pagamento no Checkout do sandbox sem voltar ao site; aviso do Asaas às 13:18:25Z, empresa achada pelo checkout, `tenant.reactivated` às 13:18:39Z (cerca de 14 s, antes da conciliação horária); `conferir-pagamento-hml.mjs` A1 a A4 e B1 a B4 PASSOU, uma só assinatura (`evidence/011-atrito/conferir-pagamento.txt`)

## Rastreabilidade

`sdd trace` mistura IDs de outras mudanças porque os IDs se repetem; o auditor NÃO a usou como prova. Conferência manual por citação de ID dentro do escopo da 011:
- AC-001.1, .2, .3, .4, .6, .7: `app/api/v1/webhooks/cobranca/[provedor]/route.test.ts`, bloco "webhook do Asaas achando a empresa pelo checkout (mudança 011, AC-001)"; o consumidor em `lib/cobranca/sinal.handler.test.ts`
- AC-001.5: `lib/billing-trial/conciliar.test.ts` ("AC-001.5: retorno gravou primeiro; webhook e duas conciliações depois não criam outra assinatura nem reativam de novo")
- AC-002.1 a .5: `app/account-suspended/hub-trial.test.tsx` e `tests/unit/hub-confirmando-i18n.test.ts`
- AC-003.1 a .5: `app/actions/auth/envio-de-acesso-da-marca.test.ts` e `lib/auth/contexto-de-email.test.ts`
- AC-004.1: `evidence/011-atrito/conferir-pagamento.txt` (payload traz o `checkoutSession`, log `tem_checkout_session: true`) e a seção "Mudança 011" de `docs/solucao-crm/evidencias/003-billing/jornada-hml.md`
- AC-004.2: o mesmo `conferir-pagamento.txt` (A1 a A4 e B1 a B4)
- AC-004.3: `evidence/011-atrito/hub-confirmando.png`
Todas as 17 tarefas estão `[x]`. Sem teste automatizado, por natureza: AC-004.1 a AC-004.3 (provas em ambiente real).

## Revisão de código

Revisão independente das fatias 1 a 3 (`sdd-reviewer`), aprovada com uma ressalva, tratada: o consumidor do sinal mandava toda conta `trial_com_cartao` (inclusive as já confirmadas, nas cobranças mensais) pelo caminho novo, que engole falha transitória; passou a valer só com `pagamento_inicial_pendente`, com teste. Também tratado: busca por checkout com `.limit(1)` (a coluna não tem unicidade). A prova na hml achou um defeito que nenhum teste pegou (a coluna `provedor` é nula antes de o cliente do Asaas ser gravado, e a busca filtrava por ela): corrigido no PR #76, com o teste que exigia o filtro errado trocado.

## Segurança

Lido pelo auditor no código, coberto por teste: aviso forjado só emite `cobranca.sinal` e o consumidor decide pelo estado lido no Asaas, nunca pelo corpo; token comparado em tempo constante e nunca gravado; os logs novos trazem só `organization_id`, `provedor` e um booleano (sem token, e-mail ou documento); a busca por `checkout_provedor_id` não vaza entre organizações (o valor interpolado no `.or()` é fixo, `asaas`) e vem antes do balde de desconhecidos, que segue valendo; anti-enumeração do cadastro preservada (a reserva só é devolvida no ramo de falha do gancho, nunca no sucesso nem no sucesso ofuscado de conta existente). Sem dependência nova e sem migration.

## Desvios de escopo

- Nada fora do "Fora de escopo" do PRD foi tocado.
- Aceito e ajustado no PRD: o AC-002.2 fala "Verificar agora" no lugar de "Já paguei" (o hub esconde o "Já paguei" nesse estado para não abrir segundo checkout).
- Pequeno: o título da tela é "Confirmando seu pagamento" e a frase "Estamos confirmando o seu pagamento..." do AC-002.1 está no corpo.
- Aquém do pedido, por limitação de prova: REQ-003 (cadastro) provado só por teste de unidade, não pela tela na hml; o hub foi capturado com o estado "confirmando" reproduzido por escrita na linha de teste (a janela real dura cerca de 14 s).
- Fora do escopo, registrado: o worker avisou `cobranca.nota_nao_pedida` com `parse_error` logo após a reativação, a investigar.
- `.sdd/bin/lib.mjs` e `.sdd/bin/sdd.mjs` aparecem modificados na árvore por sincronização do plugin; não são desta mudança e não entram no commit.

## Specs vivas

`specs/cobranca-com-trial-no-cartao.md`: 2 requisitos ADICIONADOS (hub explica a espera; cadastro devolve a reserva de reenvio na falha) e 1 MODIFICADO (Confiabilidade do webhook, da conciliação e da idempotência).

## Parecer

**APROVADO** com ressalvas. Nenhum achado bloqueante. Ressalvas: suíte completa, e2e e RLS entre marcas provados pelo CI e não localmente; REQ-003 provado só por unidade; hub capturado em estado reproduzido; um aviso do worker (`nota_nao_pedida`) a investigar fora desta mudança. A reativação sem retorno do navegador foi medida na hml: cerca de 14 s, contra até 1 hora antes.
