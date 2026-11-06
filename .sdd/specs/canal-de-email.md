# canal-de-email

## Requisitos

### Requisito: Conectar uma caixa de e-mail

O sistema DEVE permitir que um admin conecte uma caixa pelo assistente (Gmail com servidores preenchidos, ou outro provedor com servidor, porta, segurança, usuário e senha), testando de verdade a entrada e o envio antes de salvar, e mostrando a causa de falha em português claro. Rotas de conexão DEVEM recusar quem não é admin e só falar com destinos públicos nas portas 143, 993, 465 e 587.

- Cenário: Dado o assistente, quando o Testar falha por senha recusada, então a tela mostra a frase de senha recusada e o Conectar continua travado.

### Requisito: E-mails recebidos viram conversa

O sistema DEVE ler a caixa de entrada a cada rodada, criar ou reaproveitar o contato do remetente, manter respostas na mesma conversa pelos cabeçalhos de encadeamento, gravar cada e-mail uma única vez e, na primeira conexão, ler só o que chega depois dela, sem spam nem lixeira.

- Cenário: Dado o mesmo e-mail visto em duas rodadas, quando processado, então existe uma única mensagem.

### Requisito: E-mail automático não vira conversa

O sistema DEVE ignorar e-mails de lista, envio em massa, resposta automática, no-reply e falha de entrega, contando-os numa lista de ignorados com remetente, assunto, data e motivo, da qual a pessoa pode promover um item a conversa. A marcação "não é cliente" DEVE ignorar os próximos e-mails do remetente. Remetente que já é contato com conversa NÃO DEVE ser ignorado.

- Cenário: Dado um aviso no-reply, quando chega, então aparece na lista de ignorados e não vira conversa.

### Requisito: Responder por e-mail

O sistema DEVE enviar respostas pela caixa conectada, com "Re:", cabeçalhos de encadeamento, citação da mensagem anterior, assinatura da caixa e anexos dentro do limite do provedor; DEVE mostrar apenas "enviada" sem recibo de leitura; DEVE recusar iniciar contato com quem nunca escreveu; e rascunhos do agente de IA DEVEM aguardar aprovação humana.

- Cenário: Dado um rascunho do agente numa conversa de e-mail, quando gerado, então fica aguardando aprovação.

### Requisito: Proteger a conta de e-mail do cliente

O sistema DEVE respeitar teto diário por caixa (padrão 200) e intervalo mínimo entre envios, deixando o excedente na fila para o dia seguinte no fuso da organização, e DEVE recusar campanhas e envios em lote que apontem para conversa de e-mail.

- Cenário: Dado o teto atingido, quando há novo envio, então ele espera na fila até o dia virar.

### Requisito: Falhas sem estrago

O sistema DEVE pausar a caixa quando a senha é recusada e avisar na Central e por e-mail; continuar a rodada seguinte de onde parou após falha de rede; pular e-mail malformado ou grande demais com o motivo registrado; encerrar rodada que passa do prazo; e mostrar falha de envio com a causa e a ação de tentar de novo.

- Cenário: Dado servidor indisponível, quando a rodada falha, então a seguinte continua sem perder nem repetir mensagens.

### Requisito: Segurança do segredo e do conteúdo

O sistema DEVE guardar a senha cifrada e nunca devolvê-la inteira em tela, API, log, auditoria ou Sentry; higienizar o HTML recebido (sem script, formulário nem imagem remota automática); isolar dados por organização (RLS e filtro); e toda rota mutante DEVE declarar requireSupportWrite, validar com Zod e auditar.

- Cenário: Dado uma resposta de API da caixa, quando examinada, então não contém a senha.

### Requisito: Operação, várias caixas e integração ao inbox

O sistema DEVE aceitar várias caixas por organização com assinatura, teto e estado próprios; pausar e retomar sem perder o ponto; permitir remover uma caixa pela tela (arquiva, fecha o aviso de pausa e mantém as conversas); desligar todo o canal por variável de instalação; e declarar na matriz de canais as capacidades reais do e-mail.

- Cenário: Dado EMAIL_CANAL desligado, quando o worker roda, então nenhuma caixa é lida nem enviada.

### Requisito: Anonimização LGPD alcança o e-mail

A cascata de anonimização de contato DEVE enfileirar para remoção TODOS os anexos de e-mail da pessoa (inclusive do 2º anexo em diante) antes do passo irreversível que zera os metadados, e DEVE redigir o conteúdo de e-mail.

- Cenário: Dado uma mensagem com três anexos, quando o contato é anonimizado, então os três caminhos entram na fila de remoção.

### Requisito: Liberação segura

A mudança de schema DEVE sair como migration versionada com apêndice idempotente no baseline; textos novos DEVEM vir do dicionário (pt-BR e es); e com produção sem caixas conectadas a sonda DEVE medir resultado igual ao de antes e nenhuma conexão de e-mail pelo worker.

- Cenário: Dado produção sem caixas, quando a sonda roda após o deploy, então os 9 itens passam.
