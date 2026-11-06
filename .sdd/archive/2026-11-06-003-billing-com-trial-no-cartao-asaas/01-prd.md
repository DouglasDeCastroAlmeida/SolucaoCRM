# PRD: Billing com trial no cartão (Asaas)

> Mudança `003-billing-com-trial-no-cartao-asaas` · porte L · 2026-10-27
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.

## Problema

Quem vende o CRM como marca própria precisa cobrar o autônomo sem fricção: a pessoa testa 7 dias e, se não cancelar, a cobrança acontece sozinha e a nota fiscal sai. Hoje o produto tem uma cobrança por instalação, sem relação com as marcas da SP1: não há planos por marca, o cadastro por uma marca não leva à cobrança e não existe a chave que permita ligar a cobrança numa marca sem afetar as outras. Sem isso, o dono não consegue abrir a venda: cobrar na mão não escala, e cobrar sem trial no cartão derruba a conversão. O custo de errar é alto porque é dinheiro: cobrança em dobro, conta cobrada por engano ou cliente suspenso por falha nossa.

## Objetivos e métricas

- Uma pessoa nova, numa marca com a cobrança ligada, vai do cadastro ao trial ativo em menos de 3 minutos, sem digitar cartão em tela nossa.
- Zero cobrança indevida: nenhuma organização existente é cobrada ou suspensa pela chegada desta mudança (medido na produção e na homologação).
- Zero dado de cartão em banco, log, auditoria ou Sentry.
- Cobrança desligável por marca em menos de 2 minutos, devolvendo o comportamento anterior sem mexer em dados.
- Divergência entre o que o Asaas diz e o que o app mostra corrigida em até 24 h (rotina diária).

## Personas e cenários

- **Autônomo (cliente final):** escolhe o plano no site da marca, cria a conta, cadastra o cartão no checkout do Asaas, testa 7 dias, é avisado antes da cobrança e pode cancelar ou pedir reembolso.
- **Dono da plataforma (admin):** define preços e limites dos planos por marca, liga a cobrança da marca, acompanha contas em teste, atrasadas e suspensas, e devolve reembolsos no painel do Asaas.
- **Conta antiga (cortesia):** organização criada antes desta mudança; continua usando o produto como sempre.

## Requisitos funcionais

### REQ-001: Cobrança ligada por marca, desligada por padrão

Como dono, quero ligar a cobrança marca a marca para abrir a venda sem afetar quem já usa.

- **AC-001.1** Dado uma marca com `cobranca_ligada` falsa (o padrão de toda marca existente e nova), quando alguém se cadastra por ela, então não há checkout, trial nem suspensão: o comportamento é o de antes desta mudança.
- **AC-001.2** Dado uma marca com a cobrança ligada, quando alguém se cadastra por ela escolhendo um plano, então a conta entra no fluxo do trial (REQ-003).
- **AC-001.3** Dado uma marca sem ao menos um plano com preço definido, quando o admin tenta ligar a cobrança, então a tela recusa e explica o que falta.
- **AC-001.4** Dado uma marca com a cobrança ligada, quando o admin a desliga, então novos cadastros voltam a não ter checkout, em até 2 minutos, e nenhuma assinatura existente é apagada.
- **AC-001.5** QUANDO a cobrança de uma marca é ligada ou desligada o sistema DEVE registrar uma entrada de auditoria com quem, quando e o novo valor.

### REQ-002: Organizações existentes ficam como cortesia

Como dono, quero que as contas que já existem nunca sejam cobradas por engano.

- **AC-002.1** Dado uma organização criada antes desta mudança, quando a migration é aplicada, então ela fica marcada como cortesia, sem assinatura, e continua operando.
- **AC-002.2** Dado uma organização de cortesia, quando o job de suspensão, a régua de avisos ou a rotina diária rodam, então ela não é avisada, atrasada nem suspensa.
- **AC-002.3** Dado uma organização de cortesia, quando o admin da plataforma a converte para cobrada pela tela, então ela passa a seguir o fluxo da marca, e a conversão fica auditada.
- **AC-002.4** Dado a produção atual (uma organização na marca padrão), quando a mudança é implantada, então `/` responde 200, `/app` responde 307 e a organização segue operante.

### REQ-003: Trial de 7 dias com cartão no Checkout do Asaas

Como autônomo, quero testar 7 dias com cartão cadastrado, sabendo quando e quanto vão cobrar.

- **AC-003.1** Dado uma marca com cobrança ligada, quando a pessoa cria a conta e escolhe o plano mensal ou anual, então é levada ao Checkout hospedado do Asaas para cadastrar o cartão, com a primeira cobrança marcada para hoje + 7 dias e sem cobrança no ato.
- **AC-003.2** Dado o retorno do Checkout com sucesso, quando a pessoa volta ao app, então a conta está em teste, com acesso completo e a data do fim do teste visível.
- **AC-003.3** Dado que a pessoa volta do Checkout sem concluir (fechou, cartão recusado), quando abre o app, então a conta fica sem acesso operacional, com a opção de refazer o cadastro do cartão sem perder o cadastro.
- **AC-003.4** QUANDO o checkout é criado o sistema DEVE guardar só referências do Asaas (cliente, assinatura, sessão), nunca número, validade ou código do cartão.
- **AC-003.5** Dado um CPF/CNPJ que já teve trial na mesma marca, quando a pessoa tenta um novo trial, então o sistema recusa o trial e oferece assinar já, com cobrança imediata.
- **AC-003.6** Dado o mesmo CPF/CNPJ em outra marca, quando a pessoa se cadastra, então o trial é concedido (a regra é por marca).
- **AC-003.7** Dado dois cliques simultâneos em "Assinar" ou dois retornos do Checkout, quando processados, então existe uma única assinatura no Asaas e uma única linha no app.

### REQ-004: Avisos antes da cobrança

Como autônomo, quero ser avisado antes de ser cobrado.

- **AC-004.1** QUANDO faltam 2 dias para a primeira cobrança o sistema DEVE avisar por e-mail e dentro do app, com o valor e a data.
- **AC-004.2** QUANDO falta 1 dia para a primeira cobrança o sistema DEVE avisar de novo, pelos dois canais, com o valor e a data.
- **AC-004.3** Dado que a pessoa cancelou antes do aviso, quando o dia chega, então ela não recebe o aviso.
- **AC-004.4** Dado que o aviso já foi enviado, quando a rotina roda de novo, então não há aviso duplicado.
- **AC-004.5** QUANDO um aviso é enviado o sistema DEVE sair em nome da marca da organização (nome, remetente e link no host da marca).

### REQ-005: Estados da conta e consequências

Como dono, quero que o acesso acompanhe o pagamento, sem cortar ninguém por falha nossa.

- **AC-005.1** Dado que a cobrança do dia 8 é confirmada, quando o Asaas avisa, então a conta passa de em teste para ativa e a nota fiscal é pedida (REQ-007).
- **AC-005.2** Dado uma cobrança que falha, quando o Asaas avisa, então a conta passa a pagamento atrasado, mantém acesso completo por 3 dias de tolerância e mostra aviso, por e-mail e no app, para trocar o cartão.
- **AC-005.3** Dado que a tolerância acabou sem pagamento, quando a rotina roda, então a conta fica suspensa: somente leitura, agente de IA e envio de mensagens parados, sessão do WhatsApp mantida conectada.
- **AC-005.4** Dado uma conta suspensa, quando o pagamento é confirmado, então ela volta a ativa sem ação do admin.
- **AC-005.5** Dado uma conta que cancelou durante o trial, quando o teste acaba, então nada é cobrado, o acesso segue até o fim dos 7 dias e depois vira cancelada.
- **AC-005.6** Dado uma conta cancelada depois de pagar, quando o período pago acaba, então o acesso termina e os dados são mantidos por 90 dias, depois anonimizados conforme a LGPD.

### REQ-006: Cancelamento, troca de plano e reembolso de arrependimento

Como autônomo, quero cancelar, mudar de plano e pedir reembolso de forma simples.

- **AC-006.1** Dado uma conta em teste ou ativa, quando a pessoa cancela pela tela de cobrança, então o cancelamento é registrado no Asaas e na conta, e a tela mostra até quando o acesso vale.
- **AC-006.2** Dado uma conta ativa, quando a pessoa troca para outro plano, então a troca usa a pró-rata existente e a data de renovação se mantém.
- **AC-006.3** Dado uma conta até 7 dias após a primeira cobrança paga, quando a pessoa clica em "Pedir reembolso", então o pedido vira um item na Central da plataforma, uma entrada de auditoria, e a conta passa a cancelada.
- **AC-006.4** Dado uma conta fora dessa janela, quando a tela é aberta, então o botão de reembolso não aparece, e a chamada direta à rota é recusada.
- **AC-006.5** Dado um segundo pedido de reembolso da mesma cobrança, quando enviado, então não cria outro item.

### REQ-007: Nota fiscal pelo Asaas

Como dono, quero que a nota saia sozinha sem eu construir lógica fiscal.

- **AC-007.1** QUANDO a assinatura é criada o sistema DEVE pedir ao Asaas a emissão de NFS-e na confirmação de cada pagamento.
- **AC-007.2** Dado uma nota emitida, quando a pessoa abre a tela de cobrança, então vê o link da nota.
- **AC-007.3** Dado que o Asaas não consegue emitir a nota (conta sem dados fiscais, município recusado), quando o pagamento é confirmado, então a conta fica ativa normalmente e o dono é avisado na Central.

### REQ-008: Confiabilidade: webhook, conciliação e idempotência

Como dono, quero que dinheiro e acesso nunca divirjam por falha de rede ou evento repetido.

- **AC-008.1** Dado um webhook do Asaas com token inválido, quando recebido, então é recusado sem alterar nada.
- **AC-008.2** Dado o mesmo webhook entregue duas vezes ou fora de ordem, quando processado, então o estado final é o mesmo de uma entrega única na ordem certa.
- **AC-008.3** Dado um webhook perdido, quando a rotina diária de conciliação roda, então o estado da conta é corrigido para o que o Asaas informa e a correção fica registrada.
- **AC-008.4** Dado o Asaas fora do ar ou lento, quando a pessoa tenta assinar, então a tela mostra uma mensagem clara de tentar de novo, sem criar assinatura pela metade e sem derrubar o app.
- **AC-008.5** Dado uma divergência que a rotina não consegue resolver, quando detectada, então abre um aviso na Central da plataforma e não altera o acesso da conta.

### REQ-009: Painel de cobrança do dono

Como dono, quero ver e operar a cobrança pela tela.

- **AC-009.1** Dado o painel de marcas, quando o admin abre uma marca, então vê e edita os planos (nome, limites, preço mensal e anual) e a chave de cobrança.
- **AC-009.2** Dado o painel de contas, quando o admin filtra, então vê as contas por estado (cortesia, em teste, ativa, atrasada, suspensa, cancelada) e por marca.
- **AC-009.3** Dado uma conta, quando o admin abre os detalhes, então vê plano, estado, datas e o link para a cobrança no painel do Asaas.
- **AC-009.4** Toda ação de escrita do painel DEVE exigir administrador da plataforma, declarar `requireSupportWrite(` antes do efeito e gerar auditoria.

### REQ-010: Prova, qualidade e liberação segura

Como dono, quero entrar em produção sem risco para o que já funciona.

- **AC-010.1** A primeira tarefa da implementação DEVE provar no sandbox do Asaas que o Checkout aceita a primeira cobrança em D+7 e o ciclo anual (V-1 e V-2), com a evidência gravada; antes dela não há código de produção.
- **AC-010.2** A mudança de schema DEVE sair como migration versionada com apêndice idempotente no baseline, funções novas com `revoke` de PUBLIC e anon, e RLS testada entre duas marcas.
- **AC-010.3** A jornada completa (cadastro, checkout, trial, aviso, cobrança, atraso, suspensão, reativação) DEVE ser provada pela tela num ambiente de homologação com o sandbox do Asaas.
- **AC-010.4** Nenhuma tela ou e-mail novo DEVE conter texto fixo de marca; tudo sai da marca resolvida e do dicionário de idiomas.
- **AC-010.5** Dado a implantação em produção com todas as marcas desligadas, quando a sonda de produção roda, então o resultado é igual ao de antes da mudança.

## Requisitos não funcionais

- **Segurança:** o cartão nunca passa pelo nosso servidor (D-12); chave do Asaas só em segredo do servidor, nunca em query string, log, auditoria ou Sentry; webhook com verificação em tempo constante.
- **Isolamento:** toda tabela nova ou alterada tem RLS; a visão de cobrança de uma marca nunca expõe outra.
- **Desempenho:** nenhuma chamada ao Asaas dentro de transação de banco nem no caminho de renderização de página; indisponibilidade do Asaas não pode derrubar o app.
- **Observabilidade:** erro do provedor vira registro e aviso na Central, sem texto livre do pagador.
- **Compatibilidade:** instalação sem a chave do Asaas configurada continua funcionando como hoje.
- **Idioma e acessibilidade:** textos em pt-BR, en e es pelo dicionário; telas navegáveis por teclado.

## Fora de escopo

- Plano de 2 anos e qualquer cobrança única parcelada.
- Split, subcontas e repasse a parceiros.
- Reembolso automático por API.
- Cálculo ou emissão própria de nota fiscal e a configuração fiscal da conta Asaas.
- Tokenização própria de cartão (só se a sonda de AC-010.1 falhar; então volta ao design).
- Stripe e outros provedores (o adaptador existente fica como está).
- Cobrança por uso de IA ou de tokens.
- Telas do parceiro.

## Dependências e riscos

- **Asaas:** premissa de que o Checkout aceita a primeira cobrança em D+7 e o ciclo anual (V-1, V-2), ainda não provada. Mitigação: AC-010.1 antes de qualquer código. Plano B: tokenização própria, que muda o tamanho do subprojeto.
- **Dono:** credenciais do sandbox em `C:\Users\Douglas\.secrets\asaas-sandbox.env` na implementação; conta Asaas de produção e dados fiscais com o contador antes de cobrar de verdade.
- **Jurídico:** texto e prazo do arrependimento (CDC art. 49) a confirmar com advogado.
- **Negócio:** prazo de recebimento do cartão e custo de split (V-3) afetam só o fluxo de caixa; registrados no roteiro.
- **Risco técnico:** reaproveitar a cobrança por instalação sem regressão para quem já a usa; mitigação: chave por marca desligada e cortesia por padrão, com teste de regressão.
