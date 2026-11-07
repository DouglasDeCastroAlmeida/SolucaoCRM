# Delta: cobranca-com-trial-no-cartao

> Comportamento ENTREGUE pela mudança 011 (atrito do comprador no cadastro e no pagamento).

## ADICIONADOS

### Requisito: O hub explica a espera enquanto o pagamento é confirmado

O sistema DEVE, na conta suspensa com o Checkout aberto e a linha em "confirmando", mostrar no hub "Confirmando seu pagamento" com a orientação de falar com o suporte se passar de 1 hora, no lugar do aviso de suspensão por falta de pagamento, e manter o botão de verificação ("Verificar agora", a mesma releitura do "Já paguei", sem abrir segundo checkout). O texto DEVE vir do dicionário em pt-BR, en e es, sem marca fixa, e DEVE sumir quando a conta é reativada.

- Cenário: Dado uma conta suspensa em "confirmando", quando a pessoa abre o hub, então vê a mensagem, a orientação de 1 hora e o botão "Verificar agora"; sem o estado "confirmando", vê o aviso de sempre.

### Requisito: O cadastro devolve a reserva de reenvio quando o envio falha

O sistema DEVE, no cadastro, devolver a reserva de 60 s de reenvio somente quando o envio do e-mail de confirmação falha (`email_nao_enviado`), para que a nova tentativa na hora envie de novo e a tela mostre a falha de envio e nunca "Já enviamos". Envio com sucesso DEVE manter a reserva, dois cliques juntos DEVEM pedir um só e-mail, e a devolução NÃO DEVE revelar se o e-mail já tem conta (conta existente segue com sucesso ofuscado, sem passar por esse ramo).

- Cenário: Dado um cadastro cujo envio falhou, quando a pessoa tenta de novo em menos de 1 minuto, então o envio é tentado outra vez; dado um envio que deu certo, a nova tentativa continua bloqueada.

## MODIFICADOS

### Requisito: Confiabilidade do webhook, da conciliação e da idempotência

O sistema DEVE aceitar o webhook do Asaas somente com o token correto (comparação em tempo constante), nunca gravar o token, gravar só o ponteiro `{id, tipo}` do evento, tratar duplicata de forma idempotente e decidir o estado SEMPRE pela releitura na API do Asaas (o corpo do webhook nunca vale como prova). A assinatura DEVE ser achada pelo `checkoutSession`, porque o Asaas não propaga o `externalReference`. Quando o cliente do Asaas ainda não está gravado na linha (a coluna `provedor` é NULA nesse momento), o webhook DEVE achar a empresa pelo `checkoutSession` do aviso (`checkout_provedor_id`, com `provedor` nulo ou o do aviso), antes do limite de avisos de clientes desconhecidos, e só acordar a releitura; o consumidor do sinal DEVE, para conta `trial_com_cartao` com pagamento inicial pendente, confirmar pelo mesmo caminho da conciliação (`confirmarTrialDoCheckout`), de modo que quem paga sem o navegador voltar é reativado em segundos. Aviso sem `checkoutSession` ou com um que não é nosso segue descartado como `cliente_desconhecido`. A rodada horária DEVE continuar conciliando checkouts pagos cujo retorno não voltou, e duas assinaturas para o mesmo checkout NÃO DEVEM ser escolhidas (viram aviso na Central); webhook, retorno e conciliação, em qualquer ordem, geram uma só assinatura e uma só reativação.

- Cenário: Dado um pagamento cujo retorno do navegador não chegou, quando o aviso do Asaas chega, então a empresa é achada pelo checkout e a conta é reativada em segundos (medido na hml: cerca de 14 s), com uma só assinatura.
- Cenário: Dado um aviso forjado com o token correto e o checkout de quem não pagou, quando ele chega, então só há releitura e a conta continua suspensa.
