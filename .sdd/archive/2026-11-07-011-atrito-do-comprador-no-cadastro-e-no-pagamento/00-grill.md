# Grill: Atrito do comprador no cadastro e no pagamento

> Mudança `011-atrito-do-comprador-no-cadastro-e-no-pagamento` · porte M · 2026-11-06
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

Pendências de melhoria da mudança 003 e do cadastro, combinadas com o dono em 06/11/2026: "Vamos adiantando as pendências. Sugira uma solução para cada." e "Vamos seguir com suas recomendações". Os dois itens desta mudança:

1. O cadastro disse "Já enviamos um e-mail" quando o e-mail de confirmação tinha falhado e nada fora enviado.
2. Quem paga o Checkout do Asaas sem voltar logado ao site ficou com a conta suspensa até a conciliação horária reativá-la. O dono confirmou que, ao pagar no sandbox pelo celular, a página do Asaas **não redirecionou** ao nosso site.

## Contexto levantado no código

- `app/actions/auth/signUp.ts:244` chama `reservarEnvioDeAcesso` (`lib/auth/contexto-de-email.ts:60`) **antes** de pedir o e-mail ao GoTrue, para travar o reenvio por 60 s. Nada libera a reserva quando o envio falha. A falha do gancho já é mapeada para `email_nao_enviado` (`signUp.ts`, `SignupForm.tsx`), mas a tentativa seguinte, dentro de 60 s, bate na reserva e mostra "Já enviamos um e-mail há instantes", que é falso. Medido na hml em 06/11/2026: `auth.email_hook_send_failed` com `envio_falhou:send_failed` (endereço `@example.com`), seguido da mensagem de reenvio.
- `app/cobranca/volta/route.ts` já relê o provedor e reativa a conta **sem sessão**, com o selo HMAC da volta (`lib/billing-trial/retorno.ts`). Só que depende de o navegador voltar ao site.
- A documentação do Asaas diz que o `callback` do Checkout controla só o redirecionamento do navegador e que ele não é confirmação de pagamento; a confirmação é o webhook. Não achei flag de redirecionamento automático para o Checkout.
- `lib/billing-trial/conciliar.ts` (rodada horária, `lib/cobranca/rodada.ts:71`) é a rede de segurança que reativou a conta às 19:44Z: acha a assinatura pelo `checkoutSession` (ADR-007) e confirma por `confirmarTrialDoCheckout`.
- `conciliar.ts` registra que o webhook "não tem como achar a empresa" antes da linha conhecer o cliente do Asaas. A assinatura devolvida pela API do Asaas traz o campo `checkoutSession` (visto no sandbox em 06/11/2026), e a linha guarda `checkout_provedor_id`. Falta confirmar se o payload do webhook de assinatura também o traz.

## Perguntas e respostas

### P1. Qual deve ser o caminho principal para reativar a conta quando o navegador não volta do Checkout?
- Recomendação do agente: (A) o webhook de assinatura do Asaas passa a achar a empresa pelo `checkoutSession` e reativa em segundos, pelo mesmo `confirmarTrialDoCheckout`; a conciliação horária fica como rede de segurança, sem mudar. É o caminho que a documentação do Asaas indica. A alternativa (B) é só encurtar a conciliação para 10 minutos, sem mexer no webhook, mais simples e com espera de até 10 minutos; e (C) é fazer as duas.
- Resposta: A — o webhook acha a empresa pelo `checkoutSession` e reativa em segundos; a conciliação horária fica como rede de segurança, sem mudar.


### P2. O webhook forjado com um `checkoutSession` alheio pode reativar uma conta que não pagou?
- Fonte: `app/api/v1/webhooks/cobranca/[provedor]/route.ts` e `lib/billing-trial/confirmar.ts` — o webhook só ACORDA a leitura; o estado vem sempre da releitura na API do Asaas, e o corpo do webhook nunca vale como prova. Um aviso forjado (quem tem o token estático) só faria o servidor reler a assinatura do checkout nomeado, e o resultado depende do Asaas. O balde de "cliente desconhecido" e o rate limit existentes continuam valendo para o novo caminho.

### P3. Duas portas ao mesmo tempo (webhook, retorno do navegador e conciliação) podem criar duas assinaturas ou reativar duas vezes?
- Fonte: `lib/billing-trial/confirmar.ts` — a linha ganha provedor, cliente e assinatura por compare-and-set em `pagamento_inicial_pendente`: um grava, o outro só relê; `sincronizar` é a única porta que reativa. Nenhum caminho novo cria assinatura.

### P4. Quando o envio do e-mail de confirmação falha, o cadastro deve liberar o bloqueio de 60 s de reenvio?
- Fonte: `app/actions/auth/signUp.ts:244` e `lib/auth/contexto-de-email.ts:60` — a reserva (`reservarEnvioDeAcesso`) é feita ANTES do envio porque também protege contra clique duplo, então não dá para armá-la só depois do sucesso. A solução coerente é liberar a reserva quando o envio falha (`email_nao_enviado`), mantendo-a quando o envio deu certo. A falha de envio já é mapeada para `email_nao_enviado` em `signUp.ts`.

### P5. O que a pessoa vê enquanto o pagamento ainda não foi confirmado na conta?
- Recomendação do agente: com o webhook, a espera típica cai de até 1 hora para segundos. Para o resto (webhook atrasado ou falho), o hub da conta suspensa mostra uma mensagem honesta no lugar do aviso de pagamento pendente: "Recebemos o seu pagamento? Estamos confirmando; isso leva alguns minutos. Se passar de 1 hora, fale com o suporte." A mensagem aparece quando a linha tem o checkout aberto e o estado "confirmando", já existente. A alternativa é não mostrar nada novo e depender do botão "Já paguei" que o hub já tem.
- Resposta: aceita a recomendação ("Vamos seguir com o recomendado"): mensagem honesta no hub enquanto o checkout está aberto e a linha em "confirmando"; o botão "Já paguei" continua.

### P6. E se o payload do webhook de assinatura não trouxer o `checkoutSession`?
- Fonte: `lib/billing-trial/conciliar.ts` — a conciliação horária continua como rede de segurança e acha a assinatura pelo `checkoutSession` lendo a API do Asaas. Sem o campo no webhook, o comportamento é o de hoje (aviso ignorado como `cliente_desconhecido`, conta reativada na rodada). A primeira tarefa mede o payload real antes de construir.

### P7. Como reverter em menos de 2 minutos?
- Fonte: o desenho não muda dado nem contrato: é ler um campo a mais no webhook, liberar uma reserva no cadastro e mostrar uma mensagem no hub. Reverter é voltar a imagem anterior (`APP_IMAGE`), sem migration a desfazer. Se for preciso um índice em `checkout_provedor_id`, ele é aditivo e inofensivo ao voltar a imagem.

## Decisões

- **D-01** O webhook de assinatura do Asaas passa a achar a empresa também pelo `checkoutSession` (campo `checkout_provedor_id` da linha) quando o cliente do Asaas ainda não é conhecido, e só ACORDA a releitura pelo mesmo `confirmarTrialDoCheckout`; o estado continua vindo da API do Asaas. A conciliação horária segue como rede de segurança, sem mudar de frequência.
- **D-02** O hub da conta suspensa mostra, enquanto o checkout está aberto e a linha em "confirmando", uma mensagem honesta ("Estamos confirmando o seu pagamento…, fale com o suporte se passar de 1 hora"); o botão "Já paguei" continua.
- **D-03** O cadastro libera a reserva de reenvio de 60 s quando o envio do e-mail de confirmação falha (`email_nao_enviado`), e a mantém quando o envio dá certo; a tela nunca diz "Já enviamos" sem ter enviado.
- **D-04** A primeira tarefa mede o payload real do webhook do Asaas para confirmar que ele traz o `checkoutSession`; sem o campo, o item vira só a mensagem do hub e o ajuste do cadastro, e a reativação segue pela conciliação horária.


## Fora de escopo

- Mudar a frequência da conciliação horária.
- Trocar o provedor ou o fluxo do Checkout, e qualquer mudança de preço, plano ou cobrança.
- Confirmar o pagamento pelo corpo do webhook (continua proibido: o estado vem da API).
- Os itens do e-mail e a rodada 2 da jornada (mudança separada).


## Riscos e premissas

- Risco: o payload do webhook pode não trazer o `checkoutSession`. Mitigação: D-04 e a conciliação horária.
- Risco: um aviso forjado com um `checkoutSession` alheio. Mitigação: o webhook só acorda a releitura; o limite de desconhecidos e o rate limit seguem valendo.
- Risco: liberar a reserva do cadastro reabrir o clique duplo. Mitigação: só libera na falha de envio, não no sucesso.
- Premissa: o `checkout_provedor_id` da linha é gravado antes de a pessoa pagar (visto na hml em 06/11/2026).

