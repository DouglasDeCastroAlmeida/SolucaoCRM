# Delta: cobranca-com-trial-no-cartao

> Comportamento ENTREGUE pela mudança 003 (cobrança com trial de 7 dias no cartão, Asaas).

## ADICIONADOS

### Requisito: Cobrança ligada por marca, desligada por padrão

O sistema DEVE tratar a cobrança como chave da MARCA, desligada por padrão. Marca com a cobrança desligada se comporta exatamente como antes. Ligar exige conexão do provedor, plano e a marca escolhida pelo dono da instalação; o interruptor da tela NÃO prova a jornada de pagamento (essa prova é do portão de release).

- Cenário: Dado uma marca com a cobrança desligada, quando alguém se cadastra, então nada de cobrança aparece e a organização nasce ativa como sempre.

### Requisito: Organizações existentes ficam como cortesia

O sistema NÃO DEVE suspender nem cobrar organizações criadas antes da cobrança; elas seguem como cortesia até decisão do dono.

- Cenário: Dado uma organização anterior à cobrança, quando a régua roda, então ela não é suspensa nem avisada.

### Requisito: Trial de 7 dias com cartão no Checkout do Asaas

O sistema DEVE, na marca que cobra, criar a organização suspensa com `trial_com_cartao` e `pagamento_inicial_pendente`, levar a pessoa por `/cobranca/iniciar` (aviso "Você só será cobrado em DD/MM", pedido de CPF ou CNPJ, uma reserva de trial por documento) ao Checkout hospedado do Asaas, e NUNCA tocar no número do cartão. A primeira cobrança vence ao fim do teste.

- Cenário: Dado uma conta nova na marca que cobra, quando a pessoa conclui o Checkout, então existe uma assinatura ACTIVE com a primeira cobrança PENDING no fim do teste.

### Requisito: Avisos antes da cobrança

O sistema DEVE avisar na Central e por e-mail antes da primeira cobrança (aviso de dias antes e de véspera) e, em caso de atraso, do vencimento, do aviso final e da suspensão.

- Cenário: Dado o fim do teste em 2 dias, quando a régua roda, então o aviso "cobrado em 2 dias" aparece uma única vez.

### Requisito: Estados da conta e consequências

O sistema DEVE manter os estados do trial, em dia, em atraso (com tolerância de 7 dias, ajustável de 3 a 30), aviso final de 48 h e suspensão por cobrança, e DEVE reativar a conta suspensa pelo caminho único `sincronizar`, com UMA só assinatura. Cancelar depois de pagar encerra o acesso no fim do período pago e preserva os dados.

- Cenário: Dado uma conta suspensa por cobrança, quando o pagamento é confirmado, então ela volta ao normal com uma assinatura.

### Requisito: Cancelamento, troca de plano e reembolso de arrependimento

O sistema DEVE permitir cancelar a assinatura, trocar de plano e pedir reembolso dentro dos 7 dias de arrependimento (feito no painel do Asaas, sem reembolso por API).

- Cenário: Dado um pagamento há menos de 7 dias, quando o admin pede reembolso, então o pedido é registrado e o acesso é encerrado.

### Requisito: Nota fiscal pelo Asaas

O sistema NÃO DEVE emitir nota fiscal; a emissão (NFS-e) é obrigação do dono como prestador, configurada na conta Asaas de pessoa jurídica.

- Cenário: Dado uma cobrança paga, quando o dono quiser a nota, então ela é emitida pelo painel do Asaas, não pelo sistema.

### Requisito: Confiabilidade do webhook, da conciliação e da idempotência

O sistema DEVE aceitar o webhook do Asaas somente com o token correto (comparação em tempo constante), nunca gravar o token, gravar só o ponteiro `{id, tipo}` do evento, tratar duplicata de forma idempotente e decidir o estado SEMPRE pela releitura na API do Asaas (o corpo do webhook nunca vale como prova). A assinatura DEVE ser achada pelo `checkoutSession`, porque o Asaas não propaga o `externalReference`. A rodada horária DEVE conciliar checkouts pagos cujo retorno não voltou, e duas assinaturas para o mesmo checkout NÃO DEVEM ser escolhidas (viram aviso na Central).

- Cenário: Dado um pagamento cujo retorno do navegador não chegou, quando a rodada horária roda, então a assinatura é achada pelo checkout e a conta é reativada.

### Requisito: Painel de cobrança do dono

O sistema DEVE oferecer ao dono da instalação a conexão do provedor (chave conferida com o Asaas, webhook cadastrado automaticamente), os planos por marca e a régua, sem nunca devolver segredo inteiro à tela.

- Cenário: Dado uma chave de API salva, quando o painel é aberto, então só os 4 últimos caracteres aparecem.

### Requisito: Prova, qualidade e liberação segura

O sistema DEVE só ligar a cobrança numa marca em produção depois de a homologação provar, com pagamento no sandbox pela nossa rota, que a assinatura é achada pelo `checkoutSession` e que a conta é reativada com uma assinatura; e DEVE ser implantado em produção com todas as marcas desligadas, com a sonda mostrando o resultado igual ao de antes.

- Cenário: Dado produção com todas as marcas desligadas, quando a sonda roda, então `/` responde 200, `/app` 307 e nenhuma marca, suspensão ou assinatura de cobrança existe.
