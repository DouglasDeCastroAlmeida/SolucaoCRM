# Grill: Canal de e-mail (IMAP/SMTP)

> Mudança `005-canal-de-e-mail-imap-smtp` · porte L · 2026-10-27
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

Usuário: "Combinado. Vamos para a 5" (planejamento antecipado; a implementação só começa quando o dono pedir). Subprojeto 4 da seção 12 da spec `docs/solucao-crm/specs/2026-10-21-crm-autonomos-design.md`: **Canal de e-mail (IMAP/SMTP)**, porte L, depende só do 0 (concluído). Escopo: seção 7.2, decisão D-05 e validação V-6. Os e-mails viram conversas do contato no mesmo inbox.

## Contexto levantado no código

- Os canais ficam em `lib/channels/` com adaptadores em `lib/channels/adapters/` (`waha.ts`, `meta-cloud.ts`, `zernio.ts`, `datafy.ts`), uma matriz de capacidades (`lib/channels/capabilities.ts`, tipos `ProviderDeMensagem` e `ChannelProvider`) e a doutrina `docs/doctrine/restricao-de-canal.md`: nenhuma feature pergunta "com quem falamos", pergunta "o que o canal permite"; capacidade sem consumidor é reprovada por teste de matriz.
- A entrada de mensagens hoje é **por webhook** (`lib/channels/inbound.ts`). IMAP não tem webhook: é preciso **buscar** (consulta periódica ou conexão mantida aberta). Há um processo `pnpm worker` separado do Next e um agendador (`docker/scheduler/entrypoint.sh`) para os crons.
- Já existe `nodemailer` (`package.json`) e `lib/email/{smtp,resend,roteador}.ts`, mas é o e-mail **transacional da plataforma** (avisos, acesso), não um canal de conversa. **Não há biblioteca IMAP** no projeto.
- A SP1 entregou a marca por host; o inbox da mudança 004 foi planejado para não assumir só WhatsApp.
- A spec D-05 exclui a API do Gmail por OAuth (escopo restrito e auditoria de segurança paga); o caminho é IMAP/SMTP com "senha de app". V-6 (senha de app continua disponível para contas comuns e Workspace) é validação desta mudança.
- Credenciais por organização já têm precedente criptografado em `ai_provider_credentials`; a regra é que chave/senha nunca aparece em log ou resposta de API (só os 4 últimos caracteres).

## Perguntas e respostas

### P1. Quais provedores de e-mail o MVP promete funcionar?
- Recomendação do agente: **Gmail (com senha de app) e "outro provedor IMAP" genérico** (servidor, porta, usuário e senha), com **testes reais dos dois** antes de liberar. Outlook/Microsoft entra pelo caminho genérico só se a senha de app funcionar na prática; a Microsoft vem desligando senha simples em várias contas, então **não prometemos** Outlook até a sonda provar (V-6). Nada de OAuth neste subprojeto (D-05 e fora de escopo da spec). Em cada provedor, o assistente de conexão mostra o passo a passo com os servidores já preenchidos para Gmail, e para os demais a pessoa informa os dados do provedor dela (a maioria dos autônomos usa Gmail ou o e-mail da hospedagem do próprio site).
- Resposta: aceita a recomendação

### P2. Como o sistema busca os e-mails novos: consulta periódica ou conexão mantida aberta?
- Recomendação do agente: **consulta periódica a cada 1 minuto**, feita pelo worker, lendo só o que chegou depois da última leitura (controle pelo número de série da mensagem no servidor, o UID) e com teto de mensagens por rodada. É simples, aguenta queda de rede (a próxima rodada continua de onde parou), não segura uma conexão aberta por organização (cada conexão é memória e um ponto de falha numa VPS única) e é rápida o bastante para e-mail, onde 1 minuto de atraso é normal. A conexão aberta (IDLE) fica para um segundo momento, se a espera incomodar. Cada rodada tem prazo máximo, nunca lê duas vezes a mesma mensagem e, se o provedor recusar a senha, pausa o canal e avisa a pessoa em vez de insistir (insistir pode bloquear a conta dela).
- Resposta: aceita a recomendação

### P3. Que e-mails viram conversa? A caixa pessoal do autônomo tem newsletter, cobrança e notificação.
- Recomendação do agente: **só a caixa de entrada, só o que chega depois de conectar, e sem e-mail automático.** Ao conectar, nada do passado é importado (importar meses de e-mail lotaria o CRM de contatos que não são clientes). A partir daí, cada e-mail novo da caixa de entrada vira mensagem na conversa do remetente (contato novo se não existir). Mensagens claramente automáticas ficam de fora e entram só em uma contagem "ignorados", com o motivo: as que trazem cabeçalho de lista de inscrição (`List-Unsubscribe`), `Precedence: bulk/list`, `Auto-Submitted`, remetente "no-reply", e avisos de falha de entrega. Spam e lixeira nunca são lidos. A pessoa pode, na própria conversa, marcar um remetente como "não é cliente" (some e vira regra) ou promover um ignorado a conversa. Assim o inbox não vira lixeira e quem usa o e-mail pessoal não precisa separar uma caixa só para o CRM.
- Resposta: aceita a recomendação

### P4. O que o sistema pode ENVIAR por e-mail no MVP?
- Recomendação do agente: **só respostas e mensagens dentro de uma conversa, enviadas por uma pessoa ou pelo agente de IA, nunca disparo em massa.** O envio mantém o encadeamento (cabeçalhos `In-Reply-To` e `References`, assunto "Re:"), cita a mensagem anterior e leva anexos. Sem campanhas, sem follow-up automático em lote e sem "começar conversa fria" por e-mail: o risco é o provedor (Gmail, Hostinger) marcar a conta da pessoa como spam e bloqueá-la, e quem paga é o cliente. Para proteger a conta dele, há um teto diário por caixa conectada (padrão 200 mensagens, bem abaixo do limite do Gmail comum, configurável), intervalo mínimo entre envios e, ao bater o teto, o envio fica na fila para o dia seguinte com aviso. O agente de IA por e-mail começa sempre no modo "aprovar antes de enviar" (seção 7.4 da spec). A assinatura e o texto do rodapé são da pessoa (campo por caixa), nunca da marca do CRM.
- Resposta: aceita a recomendação

Respondidas pelo código e pelas doutrinas do projeto, sem perguntar:

### P5. Como não duplicar um e-mail lido duas vezes ou entregue em dobro?
- Fonte: `CLAUDE.md` (Idempotência) — mensagens externas têm `unique (organization_id, external_id)` e o INSERT captura `23505`. Para e-mail, o `external_id` é o `Message-ID` do cabeçalho (com a pasta e o UID como apoio quando o `Message-ID` faltar). Releitura da mesma rodada é inofensiva por construção.

### P6. Onde e como ficam a senha do e-mail e o que aparece nas telas?
- Fonte: precedente `ai_provider_credentials` (credenciais por organização, criptografadas) e regra da spec 7.4/CLAUDE.md: segredo nunca em log, resposta de API, auditoria ou Sentry, só os 4 últimos caracteres. A forma exata da criptografia e a chave são decididas no design, reaproveitando o que o projeto já usa.

### P7. A caixa de e-mail é por organização ou por pessoa?
- Fonte: spec 7.2 e modelo de canais (`channels`/sessões por organização): é um canal da **organização**, conectado por um admin; o atendente responde em nome dessa caixa. Várias caixas por organização são permitidas, cada uma com seu teto e assinatura.

### P8. Como desligar o canal se der problema?
- Fonte: doutrina de rollback do projeto — chave de desligamento sem apagar dados. Canal de e-mail desligável por caixa (pausar) e globalmente (variável de instalação); pausar não apaga conversas.

## Decisões

- **D-01** Provedores do MVP: Gmail (senha de app) e "outro IMAP/SMTP" genérico, com dados do servidor informados pela pessoa; Outlook/Microsoft só quando a sonda (V-6) provar; sem OAuth.
- **D-02** Entrada por consulta periódica de 1 minuto no worker, incremental por UID, com teto por rodada e prazo; conexão aberta (IDLE) fica para depois.
- **D-03** Só a caixa de entrada, só o que chega após conectar (nada do passado), spam e lixeira nunca lidos; e-mails automáticos (lista de inscrição, bulk, auto-resposta, no-reply, falha de entrega) não viram conversa e são contados como "ignorados" com o motivo; a pessoa pode marcar "não é cliente" ou promover um ignorado.
- **D-04** Saída só dentro de conversa, por pessoa ou pelo agente de IA com "aprovar antes de enviar"; encadeamento correto, citação e anexos; sem campanha, sem follow-up em lote, sem conversa fria.
- **D-05** Proteção da conta da pessoa: teto diário por caixa (padrão 200, configurável), intervalo mínimo entre envios, fila para o dia seguinte com aviso ao bater o teto.
- **D-06** Idempotência por `Message-ID` com `unique (organization_id, external_id)`.
- **D-07** Senha criptografada, nunca em log, auditoria, resposta ou Sentry; senha recusada pausa a caixa e avisa a pessoa, sem insistir.
- **D-08** Canal da organização, várias caixas permitidas, cada uma com assinatura e teto próprios; desligável por caixa e globalmente sem apagar dados.
- **D-09** O adaptador entra na matriz de capacidades de canal (`lib/channels/capabilities.ts`) com as diferenças reais do e-mail (sem recibo de leitura, sem áudio, texto longo, anexos, sem janela de 24 h), respeitando a doutrina de restrição de canal; código isolado em `lib/canais/email`.
- **D-10** O assistente de conexão (passos numerados, teste real no final, erro em português claro) é desta mudança para o e-mail, no padrão único da seção 7.5; o painel de saúde geral é o subprojeto 6.

## Fora de escopo

- Leitura de e-mail por OAuth/API do Gmail ou da Microsoft.
- Importar histórico de e-mail anterior à conexão.
- Campanhas, follow-up em lote e primeira abordagem por e-mail.
- Conexão aberta (IDLE) em tempo real.
- Pastas além da caixa de entrada (enviados, rascunhos, marcadores) e sincronizar "lido/não lido" de volta ao provedor.
- Painel de saúde geral das conexões (subprojeto 6) e e-mail transacional da plataforma (já existe).
- Calendário ou convites (`.ics`) tratados como evento da agenda.

## Riscos e premissas

- **Premissa (V-6):** a senha de app do Google continua disponível para contas comuns e Workspace. Mitigação: sonda real na implementação; se falhar, o plano é oferecer outros provedores e planejar a auditoria do Gmail (já previsto na spec).
- **Risco:** conta da pessoa bloqueada pelo provedor por login repetido ou envio em excesso. Mitigação: pausa ao primeiro erro de senha, teto diário e intervalo entre envios.
- **Risco:** e-mail malformado, anexo enorme ou codificação estranha derrubar o worker. Mitigação: limites de tamanho, prazo por mensagem, falha de uma mensagem não para a rodada, e registro do que foi pulado.
- **Risco:** vazamento de senha. Mitigação: criptografia, nenhum log, teste que varre resposta e log.
- **Risco:** conteúdo HTML malicioso exibido no inbox. Mitigação: higienizar o HTML e bloquear imagens remotas e scripts; texto simples como padrão.
- **Risco:** o worker único vira gargalo com muitas caixas. Mitigação: teto por rodada e rodízio entre caixas; medição no design.
- **Dependência do dono:** uma conta Gmail com senha de app e uma conta de outro provedor para a sonda da implementação (credenciais em `C:\Users\Douglas\.secrets\`, nunca no chat).
- **Dependência:** o inbox estilo WhatsApp (mudança 004) foi planejado para aceitar este canal; os dois podem entrar em qualquer ordem.
