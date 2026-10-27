# Tarefas: Canal de e-mail (IMAP/SMTP)

> Mudança `005-canal-de-e-mail-imap-smtp` · porte L · 2026-10-27
> Fatias verticais e testáveis, derivadas dos critérios de aceite. Teste antes da implementação.

## Formato

Cada tarefa ocupa uma linha:

`- [ ] T-001 [P] [TIPO] Descrição objetiva (~20 min) {AC-001.1} deps: T-000`

- **Tipos:** SETUP, TEST-CONTRACT, TEST-UNIT, TEST-INT, TEST-UI, TEST-E2E, CHECK-SMOKE, IMPL, REFACTOR, DOCS
- **[P]:** pode rodar em paralelo (não toca os mesmos arquivos de outra tarefa [P] pendente)
- **{AC-...}:** critérios de aceite cobertos. Todo critério precisa de pelo menos uma tarefa TEST-*.
- **deps:** tarefas que precisam terminar antes
- **(~XX min):** estimativa. Pisos por tipo em `.sdd/config.json > estimates`.

## Tarefas

### Fatia 1: Prova de leitura e envio em contas reais, antes de qualquer código (REQ-009)
- [ ] T-001 [TEST-INT] Sonda real (credenciais do dono em C:\Users\Douglas\.secrets\): numa conta Gmail com senha de app e numa conta de outro provedor, entrar por IMAP, ler a caixa de entrada, enviar por SMTP e ver a mensagem chegar; grava evidência (~60 min) {AC-009.1}
- [ ] T-002 [DOCS] Registrar o resultado em docs/solucao-crm/evidencias/005-email/ e decidir: passou segue; falhou para a esteira e volta ao design (V-6) (~20 min) {AC-009.1} deps: T-001

### Fatia 2: Banco aditivo, provider na matriz e isolamento (REQ-007, REQ-008, REQ-009)
- [ ] T-003 [TEST-INT] Invariante: CHECKs aceitam provider email e canal email, única por (organização, endereço), isolamento entre 2 organizações nas tabelas novas, funções novas sem EXECUTE para PUBLIC e anon, senha sem coluna legível ao cliente (~55 min) {AC-007.4, AC-009.2} deps: T-002
- [ ] T-004 [TEST-UNIT] Matriz de capacidades: provider email declara todas as capacidades, as três novas (envioEmLote, iniciaConversa, iaSoComAprovacao) têm consumidor, falha fechada para provider desconhecido (~40 min) {AC-008.4, AC-004.5, AC-004.6, AC-005.4} deps: T-002
- [ ] T-005 [SETUP] Reservar o número da migration com pnpm checar:colisao-de-migration e criar o arquivo com cabeçalho -- manifest: (~10 min) deps: T-002
- [ ] T-006 [IMPL] Migration aditiva + apêndice idempotente no baseline.sql: CHECKs ampliados (drop+add), colunas da caixa, fn_upsert_email_conversation, email_sync_estado, email_ignorados, email_remetentes_ignorados, email_envios_dia, kinds novos da Central (~60 min) {AC-007.4, AC-009.2} deps: T-003, T-005
- [ ] T-007 [IMPL] ChannelProvider, capacidades novas, ADAPTERS, session-ref, presentation, canais-de-conversa, inbound e health com o provider email e adaptador ainda mínimo (~60 min) {AC-008.4, AC-004.5, AC-004.6, AC-005.4} deps: T-004, T-006
- [ ] T-008 [CHECK-SMOKE] pnpm test:db em instalação nova e em atualização, pnpm lint:channels e o teste de matriz verdes (~20 min) deps: T-006, T-007

### Fatia 3: Conectar a caixa com segurança (REQ-001, REQ-007)
- [ ] T-009 [TEST-UNIT] Destino seguro: recusa loopback, link-local, metadata, RFC1918, CGNAT e multicast, aceita só as portas 143, 993, 465 e 587, fixa o IP resolvido com o servername original, DNS que resolve para IP especial é recusado (~45 min) {AC-001.4}
- [ ] T-010 [IMPL] lib/channels/email/destino-seguro.ts (~40 min) {AC-001.4} deps: T-009
- [ ] T-011 [TEST-UNIT] Conexão com servidores simulados: sucesso entra e envia o e-mail de teste, senha recusada, servidor não encontrado, porta fechada, verificação em duas etapas desligada, cada causa em português claro (~50 min) {AC-001.3, AC-001.4}
- [ ] T-012 [IMPL] lib/channels/email/conexao.ts com imapflow e nodemailer, TLS verificado e IP fixado, mensagens a partir de lib/net/alcance.ts (~60 min) {AC-001.3, AC-001.4} deps: T-010, T-011, T-008
- [ ] T-013 [TEST-UNIT] Senha cifrada, só os 4 últimos em claro, nunca em resposta de API, log, auditoria ou Sentry (varredura de respostas e do log do worker) (~40 min) {AC-007.1, AC-007.2}
- [ ] T-014 [IMPL] lib/channels/email/segredo.ts com encryptWebhookSecret e decryptWebhookSecret (~35 min) {AC-007.1, AC-007.2} deps: T-013, T-008
- [ ] T-015 [TEST-UNIT] Rotas de testar, conectar e alterar a caixa: Zod, só admin recusa o resto, requireSupportWrite antes do efeito, auditoria, nada importado ao conectar (~50 min) {AC-001.5, AC-001.6, AC-007.5}
- [ ] T-016 [IMPL] Rotas /api/v1/channels/email (testar, criar, PATCH), erros canônicos e ações de auditoria novas (~60 min) {AC-001.5, AC-001.6, AC-007.5} deps: T-012, T-014, T-015
- [ ] T-017 [TEST-UI] Assistente de conexão: Gmail com servidores preenchidos e passos da senha de app, outro provedor com os campos, testar antes de conectar, erro claro (~45 min) {AC-001.1, AC-001.2}
- [ ] T-018 [IMPL] components/connections/email/AssistenteDeConexao.tsx, CanalEmailClient.tsx e aba nova em ConexoesShell (~60 min) {AC-001.1, AC-001.2} deps: T-016, T-017

### Fatia 4: Receber e-mails como conversa (REQ-002, REQ-003, REQ-006, REQ-007)
- [ ] T-019 [TEST-UNIT] Regra de e-mail automático: lista de inscrição, bulk, auto-resposta, no-reply e falha de entrega ignorados com motivo; contato conhecido nunca ignorado (~40 min) {AC-003.1, AC-003.2, AC-003.5}
- [ ] T-020 [IMPL] lib/channels/email/automatico.ts (~30 min) {AC-003.1, AC-003.2, AC-003.5} deps: T-019
- [ ] T-021 [TEST-UNIT] Leitura de MIME (texto, anexos com limite, Message-ID, In-Reply-To, References, assunto) e HTML malicioso sem script, formulário, iframe, estilo ou imagem remota (~50 min) {AC-007.3}
- [ ] T-022 [IMPL] parse.ts e html-seguro.ts, com mailparser e sanitize-html pinados no package.json (~55 min) {AC-007.3} deps: T-021
- [ ] T-023 [TEST-UNIT] Ingestão com servidor IMAP simulado: aparece como mensagem com assunto, texto e anexos; remetente novo cria contato, conhecido reaproveita; resposta fica na mesma conversa; só o que chegou depois da conexão; spam e lixeira nunca lidos (~55 min) {AC-002.1, AC-002.2, AC-002.3, AC-002.4}
- [ ] T-024 [TEST-INT] Invariante: o mesmo e-mail visto duas vezes gera uma só mensagem, cursor por UID avança, UIDVALIDITY mudou não reimporta o passado (~45 min) {AC-002.5, AC-002.6} deps: T-008
- [ ] T-025 [IMPL] lib/channels/email/ingest.ts: contato por e-mail, fn_upsert_email_conversation, INSERT com 23505 como duplicado, marcarConversaComMensagem, aplicarEfeitosPosEntrada (~60 min) {AC-002.1, AC-002.2, AC-002.3, AC-002.4, AC-002.5, AC-002.6} deps: T-020, T-022, T-023, T-024, T-008
- [ ] T-026 [TEST-UNIT] Lista de ignorados com remetente, assunto, data e motivo; promover relê pelo UID e vira conversa; "não é cliente" ignora os próximos e tira a conversa da lista (~45 min) {AC-003.3, AC-003.4}
- [ ] T-027 [IMPL] Rotas de ignorados e de remetentes, poda dos ignorados no cron data-retention (~50 min) {AC-003.3, AC-003.4} deps: T-025, T-026
- [ ] T-028 [TEST-UNIT] Rodada: senha recusada pausa a caixa, avisa na Central e por e-mail e não tenta de novo; falha de rede retoma de onde parou; e-mail malformado ou grande pulado com motivo; prazo encerra a rodada; EMAIL_CANAL desligado não lê nem envia (~55 min) {AC-006.1, AC-006.2, AC-006.3, AC-006.4, AC-008.3}
- [ ] T-029 [IMPL] lib/channels/email/rodada.ts com trava por caixa e rodízio, rota app/api/v1/cron/email-rodada, linha no docker/scheduler/entrypoint.sh e EMAIL_CANAL em lib/env.ts e .env.example (~60 min) {AC-006.1, AC-006.2, AC-006.3, AC-006.4, AC-008.3} deps: T-025, T-028

### Fatia 5: Responder por e-mail com a conta protegida (REQ-004, REQ-005, REQ-006)
- [ ] T-030 [TEST-UNIT] Adaptador de envio com SMTP simulado: assunto "Re:", In-Reply-To e References da última mensagem, citação, assinatura da caixa, anexos dentro do limite e recusa acima dele, enviada sem recibo de leitura, falha com causa e tentar de novo (~55 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.4, AC-006.5}
- [ ] T-031 [IMPL] lib/channels/email/adapter.ts e campos novos de RecipientInput e OutboundEnvelope; handler lê o e-mail do contato (~60 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.4, AC-006.5} deps: T-030, T-012, T-007
- [ ] T-032 [TEST-UNIT] Limite com relógio injetado: teto diário (padrão 200) manda para a fila do dia seguinte com aviso, intervalo mínimo entre envios, o contador zera na virada do dia no fuso da organização (~45 min) {AC-005.1, AC-005.2, AC-005.3}
- [ ] T-033 [IMPL] limite.ts, adapter.admitir, status queued com hora de retomada no handler e drenagem da fila na rodada (~60 min) {AC-005.1, AC-005.2, AC-005.3} deps: T-032, T-031, T-029
- [ ] T-034 [TEST-UNIT] Guardas: IA em canal de e-mail só envia pelo fluxo de aprovação, campanha e follow-up em lote recusam e-mail, iniciar conversa com quem nunca escreveu é recusado (~45 min) {AC-004.5, AC-004.6, AC-005.4}
- [ ] T-035 [IMPL] Consumidores das capacidades em campanhas, follow-up, PainelIniciarConversa, conversa-nova e before-send (~55 min) {AC-004.5, AC-004.6, AC-005.4} deps: T-034, T-007

### Fatia 6: Inbox e operação da caixa (REQ-008)
- [ ] T-036 [TEST-UI] Conversa de e-mail no inbox: ícone do canal, assunto, texto, HTML limpo sob demanda, sem botão de áudio nem recibo de leitura (~45 min) {AC-008.5}
- [ ] T-037 [IMPL] ChannelLogo, ConversationHeader e ListItem, MessageBubble e Composer por capacidade (~55 min) {AC-008.5} deps: T-036, T-007
- [ ] T-038 [TEST-UI] Várias caixas com assinatura, teto e estado próprios; pausar para a leitura e o envio sem perder conversas e retomar do ponto em que parou (~45 min) {AC-008.1, AC-008.2}
- [ ] T-039 [IMPL] Pausar, retomar e configurar por caixa na aba e nas rotas (~45 min) {AC-008.1, AC-008.2} deps: T-038, T-018, T-029
- [ ] T-040 [TEST-INT] Varredura dos fluxos que presumem telefone (pré-liberação do canal, duplicidade, pós-entrada) com sessão de e-mail, e regressão do WhatsApp (~45 min) {AC-002.2} deps: T-025
- [ ] T-041 [IMPL] Ajustes dos fluxos achados em T-040, sem mudar o comportamento do WhatsApp (~50 min) {AC-002.2} deps: T-040

### Fechamento
- [ ] T-042 [TEST-UNIT] Textos novos em pt-BR, en e es pelo dicionário e a varredura de marca sem nome ou cor fixos (~30 min) {AC-009.5}
- [ ] T-043 [IMPL] Entradas do dicionário com a chave en/es e ajustes até a varredura de marca passar (~30 min) {AC-009.5} deps: T-042, T-018, T-037
- [ ] T-044 [TEST-E2E] Jornada pela tela na homologação com servidor de e-mail real: conectar, receber, ignorar, responder, pausar, senha recusada (~60 min) {AC-009.3} deps: T-039, T-033, T-041
- [ ] T-045 [TEST-E2E] Sonda de produção sem nenhuma caixa conectada: resultado igual ao de antes e nenhuma conexão de e-mail feita pelo worker (~30 min) {AC-009.4}
- [ ] T-046 [DOCS] Runbook e roteiro do dono: criar a senha de app do Gmail, outros provedores, limites, o que fazer se a senha for recusada (~40 min) deps: T-044
- [ ] T-047 [CHECK-SMOKE] Implantar na homologação e rodar a jornada com servidor de e-mail real (~30 min) deps: T-044
- [ ] T-048 [CHECK-SMOKE] Implantar em produção sem caixas conectadas e rodar a sonda (~30 min) deps: T-047, T-045
- [ ] T-049 [REFACTOR] Limpeza com testes verdes (~25 min) deps: T-048

## Estimativa

<!-- Gerada por `sdd estimate`. Sempre com a linha TOTALIZADOR GERAL. -->
