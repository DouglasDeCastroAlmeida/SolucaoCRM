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

## Prova manual do pagamento no sandbox (31/10/2026)

O dono pagou o checkout de teste pela página hospedada, com o cartão de teste do sandbox. A página mostrou
"Pagamento confirmado" (texto do Asaas: o cartão foi aceito e a assinatura criada; **não** significa que houve
cobrança). A conferência pela API, feita no mesmo dia:

| O que foi conferido | Resultado |
|---|---|
| Assinatura criada | `ACTIVE`, cartão de crédito, ciclo `MONTHLY`, valor 49,90, próxima cobrança em 07/12/2026 |
| Primeira cobrança | `PENDING`, vencimento **07/11/2026 (hoje + 7)**, sem `paymentDate` e sem `confirmedDate` |
| Cobrança no ato | **Nenhuma.** Nada foi confirmado nem recebido em 31/10/2026 |
| Cliente | Criado pelo próprio Asaas na página (1 cliente), sem `externalReference` nesta corrida |

**V-1 PASSOU** (primeira cobrança em hoje+7, sem cobrar no ato) e **o cartão foi aceito** pelo Checkout hospedado.

**Ressalvas que continuam:**
- O texto "Pagamento confirmado" e o botão "Pagar R$ 49,90" são do Asaas e induzem a achar que houve cobrança:
  a tela **nossa** deve dizer, antes e depois, "você só será cobrado em DD/MM".
- O redirecionamento ao nosso `callback` não foi exercitado nesta corrida (a página terminou na tela do Asaas com o
  botão "Acompanhar meu pedido"); fica para a prova pela tela da Fatia 5.
- `externalReference` não aparece na assinatura nem na cobrança desta corrida: o link manual da sonda não o enviou.
  Provado antes só como eco da resposta do checkout. A Fatia 5 deve confirmar que ele chega ao webhook e à assinatura.
- A nota fiscal (`invoiceSettings`) segue não provada (conta pessoa física).

**Decisão:** T-014 e T-015 (adaptador) passam a concluídas; a Fatia 5 está liberada. A exceção ao AC-010.1 deixa de
ser necessária para o Checkout.

Os registros criados no sandbox (cliente, assinatura e cobrança) ficam até a prova pela tela da Fatia 5; depois
são removidos.

## Limite do trial por documento

Um teste grátis por CPF/CNPJ por marca (AC-003.5 e AC-003.6). A guarda mora em `cobranca_trial_documentos` (só o hash HMAC do documento é gravado).

O que a Fatia 5 faz: a tela de antes (`/cobranca/iniciar`) pede o CPF ou CNPJ quando a organização ainda não tem um documento válido no cadastro. O servidor confere os dígitos verificadores, reserva o trial do documento ANTES de abrir o checkout e, se o documento já usou o teste naquela marca, recusa com `trial_ja_usado` e a mensagem "assine já" (sem abrir cartão). O documento digitado vai para `organizations.cnpj` (a mesma coluna do cadastro), sem log. O documento do cadastro vale mais que o digitado.

**Limite que sobra:** o Checkout hospedado do Asaas pede o CPF/CNPJ de novo, na página deles, e nós não vemos o que a pessoa digita ali. Quem digitar na nossa tela um documento e na página do Asaas outro contorna a regra: o cliente criado pelo Asaas fica com um documento diferente do reservado. Também não há prova de que o documento digitado pertence a quem digita (não há consulta à Receita).

**Pendência para a Fatia 11:** depois da volta do checkout, conferir o `cpfCnpj` do cliente criado pela página com o reservado; se divergir, registrar um aviso na Central da plataforma, sem cancelar nada sozinho. Também não existe ainda o caminho "assinar agora, cobrança imediata sem teste" para quem recebeu `trial_ja_usado`: hoje a mensagem só informa, e o caminho pago depende de decisão do dono.

## Portão de release: externalReference

**NENHUMA marca pode ter a cobrança ligada em produção antes de a Fatia 11 provar**, com pagamento real no sandbox pela nossa rota (hml), duas coisas: (1) que o `externalReference` enviado ao Checkout chega à assinatura criada pela página do Asaas; (2) que a conta é reativada com UMA assinatura só.

Por quê: se o Asaas não propagar o `externalReference`, `acharAssinaturaDoCheckout` devolve nada, a volta com `ok` não liga a conta e quem clicasse de novo em "Cadastrar cartão" abriria um segundo checkout (duas assinaturas, cobrança em dobro). Hoje o código segura isso: a volta com `ok` sem assinatura achada marca a linha como "confirmando" por 24 horas (url do checkout nula, sessão guardada e validade no futuro, sem coluna nova) e `iniciar` não abre outro checkout nesse prazo; depois do prazo, só com "Tentar de novo" explícito. Isso reduz o risco, não prova o contrato.

O `ligar-cobrança` (`faltasParaLigar` em `lib/brands/cobranca-repo.ts`) não consegue checar isso: é prova de ambiente, não dado do banco. O portão está escrito em T-045 de `03-tasks.md` e a execução é do dono do produto na hml.

## AC-005.6: PARCIAL (decisão do dono, Fatia 6)

Conta cancelada depois de pagar: o acesso termina no fim do período pago (régua: aviso final de 48 h e suspensão por cobrança) e os dados ficam preservados, nada é apagado nem anonimizado. **Não há exclusão nem anonimização automática.** Passados 90 dias do fim do período pago (`proximo_vencimento`), ou do fim do teste para quem cancelou nele (`vencida_desde`/`trial_ate`), a plataforma recebe UM aviso, uma vez só, em Admin › Incidentes (tipo `cobranca.conta_cancelada_revisar_exclusao`, ação `revisar_exclusao`; o nome da empresa aparece só ali, para o admin da plataforma). A exclusão é decisão manual por `excluirOrganizacao` (`lib/tenants/exclusao.ts`). Código: `lib/cobranca/exclusao-pendente.ts`, chamado pela rodada horária; o dia é o civil de São Paulo. Sem coluna nova nem migration.

## Pendência: entrada abandonada nunca expira

Conta `trial_com_cartao` com entrada pendente abandonada (criou a conta, nunca informou o cartão) nunca expira: a régua não limpa nem avisa essa conta. É fail-safe, pois ela nunca ganha acesso sem cartão (a org nasce suspensa por cobrança e só a confirmação do Checkout a reativa). Tratar na Fatia 8 ou 11.

## Cenário da prova do externalReference (hml)

Preparado em 31/10/2026 SÓ na homologação (hml.corretora.io, imagem 868148f51). Nada em produção. Tudo marcado `[teste-003]`. Para a limpeza depois da prova, este é o inventário completo.

**O que NÃO foi simulado.** A organização nasceu pelo caminho real do cadastro por marca: usuário criado e confirmado pelo GoTrue, `/login/continuar` (o mesmo botão do e-mail de confirmação) e `ensureTenantForUser` com a marca A. O gatilho `fn_trial_na_criacao_da_org` gravou a linha de `cobranca_assinaturas` (trial, `trial_com_cartao=true`, `pagamento_inicial_pendente=true`) e suspendeu a organização por cobrança. Nenhum `update` de `brand_id` nem de assinatura foi feito à mão.

**O único atalho.** O e-mail de confirmação não existe (domínio `.invalid`): o link de confirmação foi gerado pela API admin do GoTrue (`generate_link`, service role da hml, só para isso), com `org_name` e `brand_id` nos metadados como o `signUp` real grava. Configuração e dados de cobrança foram escritos só pela API e pela tela do app, com a sessão de platform admin.

**Inventário (o que criar/mudar e como desfazer):**

| O quê | Identificação | Desfazer |
|---|---|---|
| Módulo "Cobrança dos seus clientes" LIGADO na instalação | `/admin/sistema` | desligar o interruptor (estava desligado) |
| Provedor Asaas SANDBOX conectado (chave `$aact_hmlg_`, webhook criado automaticamente no Asaas) | `POST /api/v1/admin/cobranca/conexao` | reconectar com outra chave ou apagar o aviso no painel do Asaas sandbox |
| Marca A (`marca-a`, id `c55c58d8-f74f-48bc-8147-4bb99cf93a44`) com `cobranca_ligada=true` | PATCH `/admin/brands/{id}/cobranca` | `{"cobranca_ligada": false}` |
| Marca A com `cadastro_aberto=true` (estava `false`) | PATCH `/admin/brands/{id}` | `{"cadastro_aberto": false}` |
| Plano `[teste-003] Plano de teste` (R$ 49,90/mês, 7 dias, padrão no cadastro), id `139983a5-c10a-44bb-8937-71a95771144e` | `/admin/brands/{id}/planos-cobranca` | arquivar (`arquivado: true`) |
| Organização `[teste-003] Empresa Exemplo`, id `96260062-bcb0-4fb0-9a58-523768a8751f`, marca A | `organizations` | apagar a organização (ou anonimizar) depois de cancelar a assinatura no Asaas sandbox |
| Usuário dono da organização | e-mail `dono.teste003.<timestamp>@exemplo-003.invalid` (valor só em `~/.secrets/teste-003-hml.env`) | apagar em Auth |
| Cliente, checkout e assinatura no Asaas sandbox | `externalReference` = id da organização | cancelar/apagar no painel do sandbox |

O modo de cadastro da instalação foi aberto por segundos para o passo de confirmação e VOLTOU a "somente convite" no mesmo comando (conferido relendo a tela).

**Rodar a prova:**

1. `node scripts/sondas/preparar-checkout-hml.mjs` refaz a abertura do checkout (login como dono pela marca A, hub, `/cobranca/iniciar`, POST) e salva a URL em `~/.secrets/teste-003-checkout-url.txt`. O checkout vale 60 minutos.
2. O dono abre a URL no navegador e paga com cartão de teste do sandbox (o reCAPTCHA barra robôs).
3. `node scripts/sondas/conferir-pagamento-hml.mjs` imprime PASSOU/FALHOU por item (A1 a A4 no Asaas, B1 a B4 no banco da hml).

Telas nossas (e-mail e CPF mascarados): [hub de conta suspensa](evidence/003-billing/pagamento-hml/01-hub-conta-suspensa.png), [aviso e pedido do documento](evidence/003-billing/pagamento-hml/02-iniciar-aviso-e-documento.png), [documento preenchido](evidence/003-billing/pagamento-hml/03-iniciar-documento-preenchido.png) e [depois do clique](evidence/003-billing/pagamento-hml/04-iniciar-apos-clicar.png).

**Achado da preparação (defeito real, fora do escopo desta preparação): o navegador não segue o redirecionamento do "Continuar para o cartão".** A página de aviso de `/cobranca/iniciar` responde com CSP `form-action 'self'` (`lib/billing-trial/pagina.ts`, linha da CSP). O Chrome aplica `form-action` também ao redirecionamento 303 do formulário para `sandbox.asaas.com`: o POST chega ao servidor (o checkout é criado), mas o navegador o bloqueia ("Sending form data ... violates ... form-action 'self'") e a pessoa fica parada na mesma tela. Evidência: [04-iniciar-apos-clicar.png](evidence/003-billing/pagamento-hml/04-iniciar-apos-clicar.png) e a linha `AVISO` do script. Quem paga hoje precisa abrir a URL do checkout por fora. O conserto provável é incluir o host do checkout do Asaas na `form-action` (ou responder com uma página/GET intermediária); fica para a Fatia 11 e para uma tarefa nova.
