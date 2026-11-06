# PRD: Atrito do comprador no cadastro e no pagamento

> Mudança `011-atrito-do-comprador-no-cadastro-e-no-pagamento` · porte M · 2026-11-06
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.

## Problema

Quem compra o produto na marca que cobra passa por dois momentos em que o sistema diz uma coisa e faz outra, ou deixa a pessoa sem resposta:

1. **No cadastro**, quando o e-mail de confirmação falha, a tentativa seguinte dentro de 1 minuto mostra "Já enviamos um e-mail", embora nada tenha sido enviado. A pessoa fica esperando um e-mail que não existe. Medido na hml em 06/11/2026.
2. **No pagamento**, quando o navegador não volta do Checkout do Asaas ao nosso site, a conta fica suspensa até a conciliação horária, ou seja, **até 1 hora depois de a pessoa já ter pago**, sem nenhuma mensagem. Medido na hml em 06/11/2026: o dono pagou pelo celular, a página do Asaas não redirecionou, e a conta só reativou às 19:44Z. O webhook do Asaas, que é a confirmação certa segundo a documentação do provedor, chegou mas foi descartado como `cliente_desconhecido`.

Custo de não resolver: o comprador que acabou de pagar vê a conta bloqueada, pensa que o pagamento falhou, paga de novo ou abandona. É a primeira impressão do produto vendido.

## Objetivos e métricas

- Conta reativada **em segundos** (alvo: menos de 1 minuto depois da confirmação do Asaas) quando o navegador não volta do Checkout, sem esperar a conciliação horária.
- Zero mensagem falsa de envio no cadastro: nenhuma tela diz "Já enviamos" sem que um e-mail tenha saído.
- Zero tela muda no intervalo entre o pagamento e a reativação: a pessoa sempre vê o que está acontecendo.
- Nenhuma assinatura duplicada e nenhuma reativação indevida (a jornada de pagamento da hml continua passando A1 a A4 e B1 a B4).

## Personas e cenários

- **Comprador novo (corretor, nutricionista, etc.)**, que se cadastra numa marca que cobra e paga no celular: pode fechar a aba do Asaas, não ser redirecionado ou voltar sem sessão.
- **Dono da instalação**, que precisa que a primeira impressão do produto vendido não deixe o cliente com a conta bloqueada depois de pagar.
- **Cenário A:** o comprador paga e o navegador não volta ao site; a conta reativa sozinha.
- **Cenário B:** o comprador paga e o aviso do Asaas atrasa ou falha; o hub explica a espera.
- **Cenário C:** o e-mail de confirmação falha no cadastro; a pessoa pode tentar de novo na hora e vê a mensagem correta.

## Requisitos funcionais

### REQ-001: O aviso de pagamento do Asaas reativa a conta mesmo com o navegador fora

Como comprador que acabou de pagar, quero que a minha conta volte sozinha, sem depender de o navegador retornar ao site, para não ficar bloqueado depois de pagar.

- **AC-001.1** Dado um checkout aberto de uma organização suspensa e um aviso de assinatura do Asaas cujo `checkoutSession` é o id desse checkout, quando o webhook chega com o token correto, então a organização é achada por esse id e a releitura da assinatura é disparada, e a conta é reativada com uma só assinatura.
- **AC-001.2** QUANDO o aviso chega e o cliente do Asaas ainda não está gravado na linha, o sistema DEVE tentar achar a empresa pelo id do checkout antes de descartar o aviso como `cliente_desconhecido`.
- **AC-001.3** Dado um aviso cujo `checkoutSession` não corresponde a nenhum checkout nosso, quando o webhook chega, então ele é descartado como `cliente_desconhecido`, sem gravar linha nova além do limite já existente, e nenhuma conta muda.
- **AC-001.4** Dado um aviso forjado com o token correto e o `checkoutSession` de uma organização que não pagou, quando o webhook chega, então o sistema só relê a assinatura no Asaas, não encontra pagamento, e a conta continua suspensa.
- **AC-001.5** Dado o aviso do webhook, o retorno do navegador e a conciliação horária chegando em qualquer ordem ou ao mesmo tempo, quando os três confirmam o mesmo checkout, então existe uma só assinatura e a conta é reativada uma só vez.
- **AC-001.6** Dado um webhook que não traz o `checkoutSession`, quando ele chega, então o comportamento é o de hoje (descartado como `cliente_desconhecido`) e a conciliação horária reativa a conta na rodada seguinte.
- **AC-001.7** QUANDO o webhook do Asaas chega o sistema DEVE comparar o token em tempo constante, nunca gravá-lo, e decidir o estado SEMPRE pela releitura na API do Asaas, nunca pelo corpo do aviso.

### REQ-002: O hub explica a espera enquanto o pagamento é confirmado

Como comprador que acabou de pagar, quero ver uma mensagem clara enquanto a conta é liberada, para saber que o pagamento foi recebido e não pagar de novo.

- **AC-002.1** Dado uma conta suspensa com o checkout aberto e a linha em "confirmando", quando a pessoa abre o hub da conta suspensa, então vê "Estamos confirmando o seu pagamento" com a orientação de falar com o suporte se passar de 1 hora, no lugar do aviso de pagamento pendente.
- **AC-002.2** Dado a mesma conta, quando a pessoa abre o hub, então o botão de verificação que já existe nesse estado ("Verificar agora", a mesma releitura do "Já paguei", sem abrir segundo checkout) continua disponível.
- **AC-002.3** Dado uma conta suspensa que NÃO tem checkout em "confirmando", quando a pessoa abre o hub, então vê o aviso de pagamento pendente de sempre, sem a mensagem nova.
- **AC-002.4** Dado a conta reativada, quando a pessoa abre o app, então a mensagem de confirmação não aparece mais.
- **AC-002.5** QUANDO o texto novo é exibido o sistema DEVE tirá-lo do dicionário em pt-BR, en e es, sem texto fixo de marca.

### REQ-003: O cadastro não afirma um envio que não aconteceu

Como pessoa que se cadastra, quero poder tentar de novo logo depois de uma falha de envio e ver a mensagem verdadeira, para não esperar um e-mail que não saiu.

- **AC-003.1** Dado um cadastro cujo envio do e-mail de confirmação falhou (`email_nao_enviado`), quando a pessoa tenta de novo em menos de 1 minuto, então a nova tentativa não é bloqueada pelo reenvio e o envio é tentado outra vez.
- **AC-003.2** Dado um cadastro cujo envio deu certo, quando a pessoa tenta enviar de novo em menos de 1 minuto, então continua bloqueada, com o aviso de "já enviamos" (que agora é verdadeiro).
- **AC-003.3** Dado dois cliques seguidos no botão de cadastrar, quando as requisições chegam juntas, então só um e-mail é pedido ao provedor.
- **AC-003.4** Dado uma falha de envio, quando a tela responde, então mostra a mensagem de falha de envio ("Não conseguimos enviar o e-mail agora. Tente de novo em instantes.") e nunca a de "Já enviamos".
- **AC-003.5** Dado um e-mail que já tem conta, quando a pessoa se cadastra sem convite, então a resposta continua indistinguível da de sucesso, e a liberação da reserva em falha de envio não revela se o e-mail existe.

### REQ-004: Prova no ambiente de teste

Como dono do produto, quero ver o caso real funcionando na homologação, para ligar a cobrança com confiança.

- **AC-004.1** Dado um pagamento de teste no sandbox pela hml, quando o webhook do Asaas chega, então a primeira tarefa registra em `evidence/` se o payload traz o `checkoutSession`, e esse resultado decide se o REQ-001 é construído como está ou reduzido (D-04 do Grill).
- **AC-004.2** Dado uma conta nova na marca de teste que paga no Checkout do sandbox sem voltar ao site, quando o aviso do Asaas chega, então a conta é reativada em menos de 1 minuto, antes da conciliação horária, e `conferir-pagamento-hml.mjs` passa A1 a A4 e B1 a B4.
- **AC-004.3** Dado a mesma conta, quando o hub é aberto durante a espera, então a mensagem de confirmação aparece (captura de tela em `evidence/`).

## Requisitos não funcionais

- **Segurança:** o aviso do Asaas só acorda a releitura; nunca concede nada por si (AC-001.4, AC-001.7). O limite de avisos de clientes desconhecidos e o rate limit existentes continuam valendo no caminho novo.
- **Idempotência:** três portas (webhook, retorno, conciliação) convergem para o mesmo caminho de confirmação, com uma só assinatura (AC-001.5).
- **Compatibilidade:** sem mudança de dado nem de contrato público; voltar a imagem anterior desfaz tudo. Se um índice em `checkout_provedor_id` for preciso, ele é aditivo, com migration versionada e apêndice no baseline.
- **Observabilidade:** o webhook que acha a empresa pelo checkout grava o motivo do achado no log, sem token, e-mail ou documento.
- **Acessibilidade:** a mensagem do hub é texto simples, com contraste e leitura por leitor de tela como o restante do hub.

## Fora de escopo

- Mudar a frequência da conciliação horária.
- Trocar o provedor ou o fluxo do Checkout, e qualquer mudança de preço, plano ou cobrança.
- Confirmar o pagamento pelo corpo do webhook (continua proibido).
- Os itens do e-mail e a rodada 2 da jornada de e-mail (mudança separada).
- Ligar a cobrança numa marca em produção (depende do CNPJ e do roteiro `docs/runbooks/cobranca-ligar-marca.md`).

## Dependências e riscos

- Asaas: o payload do webhook pode não trazer o `checkoutSession` (mitigação: AC-001.6 e AC-004.1, com a conciliação horária como rede de segurança).
- Aviso forjado com o token do Asaas (mitigação: só acorda a releitura, AC-001.4).
- Liberar a reserva do cadastro pode reabrir o clique duplo (mitigação: só libera na falha de envio, AC-003.3).
- Premissa: `checkout_provedor_id` é gravado antes de a pessoa pagar (visto na hml em 06/11/2026).
- O ambiente da hml depende do provedor de e-mail aceitar o endereço de teste usado para os cadastros.
