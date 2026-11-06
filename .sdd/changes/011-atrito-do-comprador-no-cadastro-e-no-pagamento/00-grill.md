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
- Resposta: PENDENTE

## Decisões

<!-- PREENCHA: decisões fechadas, uma por linha:
- **D-01** ...
- **D-02** ...
-->

## Fora de escopo

<!-- PREENCHA: o que está explicitamente PROIBIDO nesta mudança. -->

## Riscos e premissas

<!-- PREENCHA: o que ainda é incerto e o que estamos assumindo como verdade. -->
