# PRD: Canal de e-mail (IMAP/SMTP)

> Mudança `005-canal-de-e-mail-imap-smtp` · porte L · 2026-10-27
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.

## Problema

Boa parte do atendimento de um autônomo (corretor, nutricionista, prestador de serviço) chega por e-mail: pedido de orçamento, dúvida, retorno de proposta. Hoje essa conversa vive numa caixa separada do CRM: o contato não tem histórico completo, a equipe não vê o que foi respondido e a IA não participa. O produto promete WhatsApp **e** e-mail no mesmo inbox. Sem o e-mail, metade da promessa não existe. O custo de errar é duplo: um canal que lota o CRM de newsletter vira lixeira, e um canal que envia demais ou perde a senha pode custar à pessoa a própria conta de e-mail.

## Objetivos e métricas

- Uma pessoa conecta a caixa em menos de 5 minutos, seguindo o assistente, sem ajuda.
- Um e-mail novo aparece como mensagem no inbox em até 3 minutos (consulta de 1 minuto mais margem).
- Zero e-mail lido duas vezes e zero entregue em dobro.
- Zero e-mail automático (newsletter, notificação, no-reply) virando conversa.
- Zero senha de e-mail em log, auditoria, resposta de API ou Sentry.
- Nenhuma conta de cliente bloqueada pelo provedor por culpa do CRM (login repetido ou excesso de envio).

## Personas e cenários

- **Autônomo com Gmail:** cria uma senha de app, cola no assistente, e passa a ver e responder e-mails de clientes no inbox.
- **Autônomo com e-mail da hospedagem do próprio site:** informa servidor, porta, usuário e senha.
- **Atendente da equipe:** responde e-mails de cliente em nome da caixa da empresa, com a assinatura da empresa.
- **Dono da plataforma:** quer um canal que não derrube o worker nem comprometa a conta do cliente.

## Requisitos funcionais

### REQ-001: Conectar uma caixa de e-mail

Como admin da organização, quero conectar meu e-mail com um assistente e saber na hora se funcionou.

- **AC-001.1** Dado o assistente de conexão, quando a pessoa escolhe "Gmail", então os servidores de leitura e envio já vêm preenchidos e a tela mostra os passos para criar a senha de app (verificação em duas etapas, criar senha, copiar).
- **AC-001.2** Dado o assistente de conexão, quando a pessoa escolhe "Outro provedor", então informa servidor, porta, segurança, usuário e senha para leitura e envio.
- **AC-001.3** Dado os dados informados, quando a pessoa clica em "Testar", então o sistema entra de verdade na caixa de entrada e envia um e-mail de teste para a própria caixa, e só então libera "Conectar".
- **AC-001.4** Dado um teste que falha, quando o resultado volta, então a tela mostra a causa em português claro (senha recusada, servidor não encontrado, porta fechada, verificação em duas etapas desligada) e o que fazer.
- **AC-001.5** Dado uma conexão concluída, quando o canal é salvo, então a caixa aparece em Canais com o endereço, o estado e o botão de pausar, e nada do passado é importado.
- **AC-001.6** Dado um usuário sem papel de admin, quando tenta conectar ou alterar uma caixa, então a rota recusa.

### REQ-002: E-mails recebidos viram conversa

Como atendente, quero ver os e-mails de clientes no mesmo inbox do WhatsApp.

- **AC-002.1** Dado uma caixa conectada, quando chega um e-mail novo na caixa de entrada, então em até 3 minutos ele aparece como mensagem na conversa do remetente, com assunto, texto e anexos.
- **AC-002.2** Dado um remetente que ainda não é contato, quando o primeiro e-mail dele chega, então um contato novo é criado com o nome do cabeçalho e o endereço de e-mail.
- **AC-002.3** Dado um remetente que já é contato, quando o e-mail chega, então entra na conversa de e-mail dele, sem criar contato duplicado.
- **AC-002.4** Dado uma resposta a um e-mail anterior, quando chega, então fica na mesma conversa (pelos cabeçalhos de encadeamento) e não abre uma nova.
- **AC-002.5** Dado o mesmo e-mail visto duas vezes (nova rodada, reconexão), quando processado, então existe uma única mensagem no inbox.
- **AC-002.6** Dado a primeira conexão, quando a primeira rodada roda, então só e-mails que chegam depois do momento da conexão são lidos, e spam e lixeira nunca são lidos.

### REQ-003: E-mail automático não vira conversa

Como autônomo, quero que newsletter e notificação não lotem o meu CRM.

- **AC-003.1** Dado um e-mail com cabeçalho de lista de inscrição, de envio em massa ou de resposta automática, quando chega, então não vira conversa e é contado como "ignorado" com o motivo.
- **AC-003.2** Dado um remetente "no-reply" ou um aviso de falha de entrega, quando chega, então é ignorado do mesmo modo.
- **AC-003.3** Dado a lista de ignorados, quando a pessoa a abre, então vê remetente, assunto, data e motivo, e pode promover um ignorado a conversa.
- **AC-003.4** Dado uma conversa de e-mail, quando a pessoa marca "não é cliente", então os próximos e-mails daquele remetente passam a ser ignorados e a conversa sai da lista.
- **AC-003.5** Dado um remetente que já é contato com conversa, quando chega um e-mail dele que parece automático, então é tratado como conversa (contato conhecido nunca é ignorado).

### REQ-004: Responder por e-mail

Como atendente, quero responder o cliente por e-mail sem sair do inbox.

- **AC-004.1** Dado uma conversa de e-mail, quando a pessoa envia uma resposta, então sai pela caixa conectada com assunto "Re:" e cabeçalhos de encadeamento que a mantêm na mesma conversa na caixa do cliente.
- **AC-004.2** Dado uma resposta, quando enviada, então cita a mensagem anterior e inclui a assinatura configurada para aquela caixa.
- **AC-004.3** Dado anexos escolhidos, quando enviados, então chegam ao destinatário, respeitando o limite de tamanho do provedor, e acima do limite a tela recusa antes de enviar.
- **AC-004.4** Dado uma mensagem enviada, quando o provedor aceita, então o inbox mostra "enviada" e nada além (sem recibo de leitura inventado).
- **AC-004.5** Dado o agente de IA numa conversa de e-mail, quando ele redige uma resposta, então ela fica aguardando aprovação de uma pessoa antes de sair.
- **AC-004.6** Dado uma conversa de e-mail, quando a pessoa tenta iniciar contato com quem nunca escreveu, então o sistema recusa: só se responde dentro de conversa.

### REQ-005: Proteger a conta de e-mail do cliente

Como dono, quero que o CRM nunca leve a conta do cliente a ser bloqueada.

- **AC-005.1** Dado uma caixa com teto diário (padrão 200, configurável), quando o teto é atingido, então os próximos envios ficam na fila para o dia seguinte e a conversa mostra o aviso.
- **AC-005.2** Dado dois envios seguidos da mesma caixa, quando agendados, então respeitam o intervalo mínimo configurado.
- **AC-005.3** Dado o teto do dia, quando o dia vira no fuso da organização, então o contador zera e a fila volta a sair.
- **AC-005.4** Dado qualquer recurso do CRM de envio em lote (campanha, follow-up em massa), quando aponta para uma conversa de e-mail, então é recusado.

### REQ-006: Falhas sem estrago

Como dono, quero que erros de rede ou de senha não derrubem nada nem insistam.

- **AC-006.1** Dado a senha recusada pelo provedor, quando a rodada detecta, então a caixa fica pausada, a pessoa é avisada na Central e por e-mail, e nenhuma nova tentativa de login é feita até ela atualizar a senha.
- **AC-006.2** Dado rede ou servidor de e-mail indisponível, quando a rodada falha, então a próxima rodada continua de onde parou, sem perder nem repetir mensagens.
- **AC-006.3** Dado um e-mail malformado ou grande demais, quando lido, então é pulado com registro do motivo, e o resto da rodada segue.
- **AC-006.4** Dado uma rodada que demora além do prazo, quando atinge o limite, então é encerrada e retomada na seguinte, sem travar o worker.
- **AC-006.5** Dado uma falha de envio, quando o provedor recusa, então a mensagem aparece como falha com a causa, e a ação de tentar de novo funciona.

### REQ-007: Segurança do segredo e do conteúdo

Como dono, quero que a senha e o conteúdo dos e-mails não virem brecha.

- **AC-007.1** Dado a senha de uma caixa, quando salva, então fica criptografada e nunca volta inteira em tela, resposta de API, log, auditoria ou Sentry (só os 4 últimos caracteres).
- **AC-007.2** Dado uma resposta de API ou um log do worker, quando examinados nos testes, então não contêm a senha nem o texto bruto dos e-mails.
- **AC-007.3** Dado um e-mail em HTML, quando exibido, então é higienizado: sem scripts, sem formulários, sem imagens remotas carregadas automaticamente.
- **AC-007.4** Dado uma tentativa de conectar uma caixa de outra organização ou ler conversa de outra organização, quando feita, então a RLS e o filtro de organização impedem.
- **AC-007.5** Dado qualquer rota mutante nova, quando chamada, então declara requireSupportWrite antes do efeito, valida com Zod e gera auditoria.

### REQ-008: Operação, várias caixas e integração ao inbox

Como admin, quero controlar cada caixa e ver o canal no inbox.

- **AC-008.1** Dado uma organização, quando conecta mais de uma caixa, então cada uma tem assinatura, teto e estado próprios.
- **AC-008.2** Dado uma caixa, quando a pessoa a pausa, então a leitura e o envio param, as conversas ficam intactas e retomar continua do ponto em que parou.
- **AC-008.3** Dado a variável de instalação que desliga o canal de e-mail, quando ligada, então nenhuma caixa é lida ou enviada e o resto do produto segue igual.
- **AC-008.4** Dado a matriz de canais, quando consultada, então o e-mail declara suas capacidades reais (sem recibo de leitura, sem áudio, texto longo, anexos, sem janela de 24 h) e nenhuma funcionalidade pergunta "é e-mail?".
- **AC-008.5** Dado uma conversa de e-mail no inbox, quando exibida, então mostra o ícone do canal, o assunto e o texto, sem botões que o e-mail não suporta.

### REQ-009: Prova, compatibilidade e liberação segura

Como dono, quero entrar em produção sem risco para o que já funciona.

- **AC-009.1** A primeira tarefa da implementação DEVE provar numa conta Gmail com senha de app e numa conta de outro provedor que leitura e envio funcionam (V-6), com a evidência gravada; antes dela não há código de produção.
- **AC-009.2** A mudança de schema DEVE sair como migration versionada com apêndice idempotente no baseline, funções novas com revoke de PUBLIC e anon, e RLS testada entre duas organizações.
- **AC-009.3** A jornada completa (conectar, receber, responder, ignorar, pausar, senha recusada) DEVE ser provada pela tela num ambiente de homologação com um servidor de e-mail de verdade.
- **AC-009.4** Dado a produção sem nenhuma caixa conectada, quando a sonda roda, então o resultado é igual ao de antes e o worker não faz nenhuma conexão de e-mail.
- **AC-009.5** QUANDO textos novos são exibidos o sistema DEVE tirá-los do dicionário em pt-BR, en e es, sem texto fixo de marca.

## Requisitos não funcionais

- **Desempenho:** cada rodada tem prazo e teto de mensagens; o worker nunca fica preso numa caixa lenta; nenhuma conexão de e-mail dentro de transação de banco nem de renderização de página.
- **Escala:** rodízio entre caixas para que uma caixa grande não atrase as outras.
- **Segurança:** TLS obrigatório na leitura e no envio; senha criptografada; HTML higienizado; sem rede interna alcançável pelo servidor informado (proteção contra uso do conector para atingir endereços internos).
- **Observabilidade:** cada rodada registra caixa, quantidade lida, ignorada e falhas, sem conteúdo; falha repetida abre aviso na Central.
- **Compatibilidade:** instalação sem caixa conectada se comporta como hoje; nenhuma tabela existente muda de contrato.

## Fora de escopo

- Leitura por OAuth ou pela API do Gmail ou da Microsoft.
- Importar histórico anterior à conexão.
- Campanhas, follow-up em lote e primeira abordagem por e-mail.
- Conexão aberta (IDLE) em tempo real.
- Pastas além da caixa de entrada e sincronizar lido/não lido de volta ao provedor.
- Painel de saúde geral das conexões (subprojeto 6) e o e-mail transacional da plataforma.
- Calendário e convites tratados como evento da agenda.

## Dependências e riscos

- **V-6:** a senha de app do Google continua disponível para contas comuns e Workspace. Mitigação: AC-009.1 antes de qualquer código; se falhar, o plano é oferecer outros provedores e planejar a auditoria do Gmail.
- **Bloqueio da conta do cliente** por login repetido ou envio em excesso: coberto por REQ-005 e REQ-006.
- **Servidor informado pela pessoa** pode apontar para endereço interno (SSRF): o design precisa de lista de bloqueio de destinos e teste.
- **Worker único** pode virar gargalo: teto por rodada e rodízio; o design mede.
- **Dono:** uma conta Gmail com senha de app e uma conta de outro provedor, em `C:\Users\Douglas\.secrets\`, para a sonda.
- **Dependência:** o inbox estilo WhatsApp (mudança 004) foi planejado para aceitar este canal; a ordem de entrada é livre.
