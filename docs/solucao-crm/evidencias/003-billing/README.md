# Evidência da mudança 003 (T-001 e T-002): sonda do Checkout do Asaas no sandbox

Data: 30/10/2026. Ambiente: somente `https://api-sandbox.asaas.com/v3` (a sonda aborta se a chave não começar com `$aact_hmlg_`). Nenhuma chave, token ou id completo foi gravado aqui.

Sonda versionada: `scripts/sondas/asaas-checkout-sandbox.mjs`
(`node scripts/sondas/asaas-checkout-sandbox.mjs [--navegador] [--saida=arquivo.json]`).
Respostas brutas, já mascaradas: `sonda-sandbox.json`.

## Veredito

| Validação | Resultado |
|---|---|
| V-1: Checkout aceita assinatura recorrente com 1ª cobrança em hoje+7 | **PARCIAL**. O Asaas ACEITA criar (200) e a página mostra "Primeira cobrança 06/11/2026". **Não foi provado** que nada é cobrado no ato, porque não foi possível concluir o pagamento (veja abaixo). |
| V-2: aceita anual e mensal, callback de sucesso/cancelamento | **PASSOU na API**: MONTHLY e YEARLY aceitos, com `successUrl`, `cancelUrl` e `expiredUrl`. **Não provado**: o redirecionamento de volta e a validação do cartão (mesmo bloqueio). |

**Decisão: a esteira NÃO deve dar V-1 como "PASSOU, segue" ainda.** Falta um único passo humano de uns 3 minutos (abaixo). Nada indica que vá falhar (o contrato aceita o que o desenho precisa), mas a pergunta "cobra no ato?" é a de maior risco financeiro e só se responde pagando de verdade no sandbox. O plano B (tokenização própria) **não** é acionado: nada falhou.

### O bloqueio

Ao enviar o cartão na página hospedada, a chamada `POST /checkoutSession/pay` responde `200` com `success:false` e a mensagem "Tente novamente e verifique o recaptcha." (reCAPTCHA Enterprise). Aconteceu no Chromium do Playwright e também no Chrome instalado, com janela visível. Não tentei contornar o reCAPTCHA (seria burlar a proteção do provedor); então o cartão de teste nunca foi aceito nem recusado, e nenhuma cobrança nasceu.

### Passo humano que fecha V-1 e V-2

1. `node scripts/sondas/asaas-checkout-sandbox.mjs --link-manual` imprime um link de checkout do sandbox (vale 60 min, 1ª cobrança em hoje+7, mensal).
2. Abra no navegador de sempre. Preencha e-mail, nome, um CPF válido de teste, celular e CEP/número. No cartão use o de teste do sandbox do Asaas `5162306219378829`, validade futura, CVV `318`.
3. Confira: (a) foi redirecionado para `https://example.invalid/cobranca/volta?ok=1`; (b) no painel do sandbox (ou `GET /v3/payments?customer=...`) existe uma cobrança `PENDING` com vencimento em hoje+7, e **nenhuma** `CONFIRMED`/`RECEIVED` hoje; (c) anote se a página cobrou 1 real/validação. Repita com `cycle: YEARLY` se quiser.
4. Apague o que nasceu (assinatura, cobrança, cliente) no painel do sandbox.

## O que foi provado (chamadas reais)

- `POST /v3/checkouts` com `billingTypes:["CREDIT_CARD"]`, `chargeTypes:["RECURRENT"]`, `subscription:{cycle, nextDueDate:"AAAA-MM-DD 00:00:00"}`, `items`, `callback` e `minutesToExpire`:
  - MONTHLY: 200. YEARLY: 200. (QUARTERLY também; a resposta devolve `nextDueDate` como `...T03:00:00Z`, ou seja, meia-noite no horário de Brasília.)
  - `nextDueDate` no passado: 400 "A data de vencimento não pode ser anterior a hoje."
  - Sem `callback`: 400 "O campo callback deve ser informado." (**o callback é obrigatório**).
  - `callback` com `http://` foi aceito (200): a regra de https tem de ser nossa.
  - A resposta traz `id` e `link` (`https://sandbox.asaas.com/<conta>/checkoutSession/show/<uuid>`). `customer` vem `null` até alguém pagar.
- **Não existe `GET /v3/checkouts/{id}`** (404). Não dá para reler a situação do checkout pelo id; a releitura do desenho (`lerSituacao`) tem de ir pela **assinatura/cobrança** do cliente depois que o webhook ou a volta avisar. Cancelar existe: `POST /v3/checkouts/{id}/cancel` (200).
- A página hospedada (aberta no navegador) mostra recorrência "Mensal", "Primeira cobrança" na data enviada, total, e pede em 3 etapas: identificação (e-mail, nome completo, CPF/CNPJ, celular), endereço (CEP, número, bairro, complemento) e pagamento (número, nome no cartão, validade, CVV). O botão se chama **"Pagar R$ 49,90"** mesmo com a primeira cobrança no futuro: o texto pode confundir o cliente e vale conferir no passo humano o que acontece de fato. Para a nossa tela de preparação, avisar "você só será cobrado em DD/MM".
- O nome do titular da conta aparece no topo da página (não vai para o repositório).

## NFS-e: onde é configurada

- Por API só se alcança o que é da conta PJ: `GET /v3/fiscalInfo/municipalOptions` respondeu 400 "Essa funcionalidade só está disponível para pessoa jurídica". O sandbox do dono é pessoa física, então **não foi possível testar** a configuração fiscal. `/v3/fiscalInfo` e `/v3/customerFiscalInfo` dão 404 (rota não existe nesse formato). `GET /v3/invoices` existe (200, lista vazia).
- Conclusão: a emissão de NFS-e é configurada **na conta Asaas (PJ), pelo painel** (inscrição municipal, serviço, alíquota); a API só agenda/consulta notas (`/v3/invoices`) e, por assinatura, as configurações de nota (`/v3/subscriptions/{id}/invoiceSettings`; essa rota não pôde ser testada sem uma assinatura real). Isto confirma o desenho ("configurada no Asaas, não por nós; roda depois que a assinatura existe"). **Pendente**: provar com conta PJ ou depois do passo humano.

## O que o webhook exige

- `POST /v3/webhooks` com `name`, `url`, `enabled`, `apiVersion:3`, `authToken`, `sendType`, `events`.
- `url` precisa ser válida e **alcançável por DNS de verdade**: `https://example.invalid/...` foi recusada ("A url informada é inválida"); `https://example.com/...` (desligado, `enabled:false`) foi aceita. Teste de integração precisa de domínio resolvível.
- `authToken`: mínimo 32 caracteres e **no máximo 4 caracteres iguais consecutivos**. O token volta mascarado na resposta (`hasAuthToken:true`).
- Não aceita duas configurações com os mesmos eventos ("Já existe uma configuração para os eventos com os mesmos atributos"): um webhook por conjunto de eventos.
- Eventos aceitos e usados na sonda: `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_CREATED`, `CHECKOUT_PAID`. O evento `CHECKOUT_PAID` existe para o Checkout. O token é o que o Asaas devolve no header `asaas-access-token` (formato da documentação oficial; não exercitado, pois nada foi entregue).
- A conta nasceu sem nenhum webhook (lista vazia).

## O que NÃO foi provado

- Que não há cobrança no ato (V-1) e a validação do cartão (aceite/recusa), o redirecionamento ao callback, o webhook de volta e as cobranças geradas (tudo depende do pagamento na página, barrado pelo reCAPTCHA).
- NFS-e por conta (sandbox é PF).
- Entrega real do webhook (não criei webhook apontando para URL nossa).

## O que foi criado e removido no sandbox

- Criados: 11 sessões de checkout (sonda + exploração de tela) e 1 webhook de teste desligado (`sonda-003-apagar`, aponta para `example.com`).
- Removidos: todas as sessões de checkout das rodadas finais foram canceladas (`/cancel` = 200) e o webhook apagado (200).
- **Não removido**: uma sessão de checkout de uma rodada de exploração que quebrou antes do cancelamento; ela expira sozinha em 60 minutos, não tem cliente nem cobrança.
- Conferência final por listagem: clientes, assinaturas, cobranças, notas e webhooks = **0**. Nenhum cliente, assinatura ou cobrança chegou a ser criado (o pagamento nunca foi aceito).

## Exceção ao AC-010.1

- **Data:** 30/10/2026. **Decisão do dono do produto**, pedida por ele.
- **O que o AC-010.1 exige:** a sonda no sandbox do Asaas provar o Checkout (V-1, V-2) antes de qualquer código.
- **Exceção:** seguir com as fatias que **não dependem** do comportamento do Checkout do Asaas (banco, planos por marca, vocabulário, régua, painel) enquanto a prova manual do pagamento no sandbox (V-1/V-2) não é feita. O pagamento barra no reCAPTCHA da página hospedada, que só uma pessoa atravessa.
- **Razão:** a sonda parcial (acima) já cobre o que a API alcança; o que falta é um passo humano. Esperar parado bloquearia fatias que não tocam o Checkout.
- **Limite da exceção:** não vale para código que chame o Checkout (`iniciarTrialComCartao`, `/cobranca/iniciar`, `confirmar`, webhook de retorno). Essas fatias só começam depois de V-1/V-2 provados; se a prova falhar, o design volta (ADR-004, tokenização própria).
- **Fatia 2 (migration 0725)** é a primeira feita sob esta exceção: não chama o Asaas.
- **Nota de 30/10/2026:** o adaptador (`lib/cobranca/provedores`) foi escrito antes da prova manual de V-1 e só com `fetch` simulado. T-014 e T-015 só são marcadas concluídas depois da prova; a rota e o `confirmar` (Fatia 5) continuam bloqueados até lá.

## Campos extras do checkout (30/10/2026)

Rodada: `node scripts/sondas/asaas-checkout-sandbox.mjs --campos-extras` (só `api-sandbox.asaas.com`, sem pagamento). Criou um cliente fictício (CPF válido gerado, e-mail `.invalid`), tentou checkouts recorrentes de cartão (MONTHLY, `nextDueDate` hoje+7, callback https), cancelou os checkouts e apagou o cliente (conferido por listagem: 0 clientes, 0 webhooks sobrando).

| Envio no `POST /v3/checkouts` | Resultado |
|---|---|
| `customer` + `externalReference` | **400** `invalid_object`: "O campo phone/address/addressNumber/postalCode/province/city deve existir para o customer informado" |
| só `customer` | **400**, mesmos campos exigidos do cliente |
| só `externalReference` | **200**; a resposta devolve a `externalReference` igual à enviada |
| nenhum dos dois | **200**; `customer` volta `null` (preenchido na página, quando alguém paga) |

Conclusões: (1) `externalReference` é aceita e devolvida: é o elo com a organização. (2) `customer` só vale para cliente com telefone e endereço completos, que não temos antes da página; **o adaptador deixou de enviar `customer`** (testes ajustados). Consequência a tratar na Fatia 5: o cliente criado na página pode não ser o `clienteRef` de `garantirCliente`; o `confirmar` deve casar pela `externalReference` (= org), não pelo cliente.

**NÃO foi provado:** pagamento, cartão, redirecionamento ao callback, cobrança no ato, o webhook de volta e o corpo de `invoiceSettings`. Este último provavelmente exige mais campos (`taxes` e serviço/município municipal); conferir na documentação do Asaas quando houver conta PJ. A falha de `pedirNotaFiscal` é melhor esforço.
