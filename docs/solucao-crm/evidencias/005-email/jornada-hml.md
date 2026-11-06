# 005 — Jornada do canal de e-mail na homologação (T-044, AC-009.3)

Data: 04/11/2026. Ambiente: `https://marca-a.corretora.io`, organização de teste `[teste-003] Empresa Exemplo`, dono de teste logado pela tela (Playwright, janela 1280 px). Código da hml conferido: `/api/v1/health` devolve `version c9144c8` (o `c9144c893` desta branch); `/` responde 200 e `/app` responde 307.

Servidor de e-mail: o de TESTE da VPS (IMAP 993 e SMTP 465, certificado verificado). O "cliente" externo é a segunda caixa do mesmo servidor, que manda e-mail de verdade por SMTP e confere o que recebe por IMAP. A hml roda o cron real `email-rodada` (1 vez por minuto); nenhum cron foi disparado à mão.

Sonda: `scripts/sondas/jornada-email-hml.mjs` (passos `base`, `conectar`, `receber`, `ignorar`, `responder`, `pausar`, `senha`, `teto`, `limpar`). JSON de cada passo em `evidence/005-email/jornada-hml/`. Fotos com e-mails e campos mascarados; medidas por `scrollWidth` e `getBoundingClientRect` (todas as telas: 0 rolagem lateral, 0 botão fora da janela). Nenhuma senha, e-mail inteiro ou segredo foi impresso ou gravado em arquivo versionado. O banco da hml só foi lido, com filtro por organização (única escrita: o `onboarded_at` da organização de teste, desfeito no fim).

Histórico: a primeira rodada (manhã) parou no Conectar por falta da chave de cifra no banco da hml (`private.app_secrets` vazio). O dono autorizou gravar a chave, e esta é a rodada completa.

## Resultado em uma linha

A jornada de ponta a ponta funciona na hml com servidor real: conectar, receber (com anexo e HTML limpo), ignorar automáticos, responder com encadeamento correto, pausar/retomar, senha errada recusada e teto diário com fila e aviso. Três lacunas de produto confirmadas pela tela: não há tela de ignorados, nem "promover", nem "Não é cliente", nem botão de remover a caixa; e o "Não é cliente" não tira a conversa da lista.

## Tabela dos 8 passos

| # | Passo (AC) | Resultado | Evidência |
|---|---|---|---|
| 0 | Hml no commit certo, org sem caixa, e-mail ANTIGO deixado no servidor antes da conexão | PASSOU | [01-base.json](evidence/005-email/jornada-hml/01-base.json) |
| 1 | **Conectar** (AC-001.1 a 001.5): aba E-mail com assistente; Gmail traz 3 passos e servidores; Conectar travado até o Testar; Testar entra na caixa e envia o e-mail de teste ("Deu certo" em ~2 s); Conectar grava a caixa (cartão "Conectada", limites, Pausar; senha só ••••últimos4); nenhum e-mail antigo importado após 2,5 min de rodadas | PASSOU | [aba vazia](evidence/005-email/jornada-hml/02-conectar-01-aba-vazia.png), [Gmail](evidence/005-email/jornada-hml/02-conectar-02-gmail.png), [preenchido](evidence/005-email/jornada-hml/02-conectar-03-preenchido.png), [testado](evidence/005-email/jornada-hml/02-conectar-04-testado.png), [cartão](evidence/005-email/jornada-hml/02-conectar-05-cartao.png), [inbox sem o antigo](evidence/005-email/jornada-hml/02-conectar-06-inbox-sem-antigo.png) |
| 2 | **Receber** (AC-002.*, 004.*, 008.5): e-mail do cliente vira conversa no Inbox pelo cron real (21 a 58 s), com assunto e texto; ícone do canal E-mail; contato criado; sem botão de áudio nem texto de recibo; HTML só sob clique, em iframe `sandbox=""` sem `<script>` nem imagem remota; anexo baixa com o conteúdo enviado | PASSOU | [conversa](evidence/005-email/jornada-hml/03-receber-01-conversa-de-email.png), [HTML sob demanda](evidence/005-email/jornada-hml/03-receber-02-html-sob-demanda.png), [anexo baixado](evidence/005-email/jornada-hml/03-receber-anexo-baixado.txt), [03-receber.json](evidence/005-email/jornada-hml/03-receber.json) |
| 3 | **Ignorar** (AC-003.*): lista de inscrição/em massa e resposta automática de remetente NOVO não viram conversa (AC-003.1); automático de remetente CONHECIDO vira conversa (AC-003.5); após "Não é cliente" o próximo e-mail do remetente é ignorado (AC-003.4, por API). **Pela tela: não existe** lista de ignorados, promover nem "Não é cliente" | PASSOU nas regras (via API para promover e não-cliente); **FALHOU** na existência de tela (AC-003.3) e do botão (AC-003.4) | [inbox sem os ignorados](evidence/005-email/jornada-hml/04-ignorar-01-inbox-sem-os-ignorados.png), [promovido](evidence/005-email/jornada-hml/04-ignorar-02-promovido.png), [após não é cliente](evidence/005-email/jornada-hml/04-ignorar-03-apos-nao-cliente.png), [lista pela API](evidence/005-email/jornada-hml/04-ignorados-api.json) |
| 4 | **Responder** pelo Composer (AC-004.*): o cliente RECEBEU pelo servidor real; assunto `Re:` + original; `In-Reply-To` e `References` com o Message-ID do último e-mail do cliente; texto e assinatura no corpo; sem cabeçalho de recibo de leitura; Message-ID próprio | PASSOU | [composer](evidence/005-email/jornada-hml/05-responder-01-composer-preenchido.png), [após enviar](evidence/005-email/jornada-hml/05-responder-02-apos-enviar.png), [cabeçalhos](evidence/005-email/jornada-hml/05-cabecalhos-da-resposta.json) |
| 5 | **Pausar/retomar** (AC-008.1/2): cartão mostra "Pausada" em 5 s sem recarregar; e-mail mandado durante a pausa NÃO é lido em 2,5 min; ao Retomar ele aparece (10 a 53 s) uma só vez; nada antigo reimportado | PASSOU | [antes](evidence/005-email/jornada-hml/06-pausar-01-antes.png), [logo após pausar](evidence/005-email/jornada-hml/06-pausar-02-logo-apos-pausar.png), [pausada](evidence/005-email/jornada-hml/06-pausar-03-pausada.png), [inbox durante a pausa](evidence/005-email/jornada-hml/06-pausar-04-inbox-durante-pausa.png), [retomada](evidence/005-email/jornada-hml/06-pausar-05-retomada.png), [apareceu](evidence/005-email/jornada-hml/06-pausar-06-apareceu-apos-retomar.png) |
| 6 | **Senha recusada** (AC-001.4): Configurar com senha errada é recusado com "O servidor recusou o usuário ou a senha… use a senha de app" e nada é salvo (Conectada, mesmos ••••últimos4) | PASSOU | [configurar](evidence/005-email/jornada-hml/07-senha-01-configurar-senha-errada.png), [recusada](evidence/005-email/jornada-hml/07-senha-02-senha-recusada.png) |
| 6b | Aviso na Central por senha recusada pela RODADA | NÃO MEDIDO | exigiria trocar a senha no servidor de teste, vetado pela tarefa |
| 7 | **Teto** (AC-005.*): teto reduzido a 1 pela tela; duas respostas ficaram `queued`, cada uma com o aviso "Limite do dia da caixa atingido. Esta mensagem sai amanhã, a partir das 00:00."; a Central ganhou o aviso "A caixa de e-mail atingiu o limite de envios do dia"; teto e intervalo restaurados (200 / 30 s) | PASSOU | [teto 1](evidence/005-email/jornada-hml/08-teto-01-teto-1.png), [duas respostas sob teto](evidence/005-email/jornada-hml/08-teto-02-duas-respostas-sob-teto.png), [restaurado](evidence/005-email/jornada-hml/08-teto-03-teto-restaurado.png), [saídas no banco](evidence/005-email/jornada-hml/08-saidas-no-banco.json) |
| 8 | **Limpeza**: não há botão de remover na tela; a caixa foi arquivada pela rota do produto (`DELETE /channel-sessions/[id]`, status STOPPED); onboarding da organização restaurado | PASSOU com ressalva (sem botão) | [aba após limpar](evidence/005-email/jornada-hml/09-limpar-01-aba-apos-limpar.png) |

## Achados

1. **Não há tela de ignorados, "promover" nem "Não é cliente" (AC-003.3, AC-003.4) — confirmado pela tela.** A sonda percorreu Conexões › E-mail, Inbox e Configurações atrás do texto "ignorad" (nada) e a conversa de e-mail não oferece nenhum botão "Não é cliente"/"promover" (0 botões). O motor funciona (a API lista os ignorados com `remetente, assunto, recebido_em, motivo` — motivo `lista_de_inscricao` —, promover devolve a conversa e "não é cliente" passa a ignorar o remetente), mas só quem chama a API alcança. Código: nenhuma chamada a `app/api/v1/channels/email/ignorados`, `.../promover` ou `.../remetentes` em `components/` ou `app/` (só as rotas).
2. **"Não é cliente" não tira a conversa da lista (AC-003.4).** Marcado o remetente promovido, a conversa dele segue na Fila com a etiqueta "Bloqueado" (a API respondeu `conversas_arquivadas: 0`, porque foi chamada por endereço; só o modo por `conversation_id` arquiva). Como a tela não tem o botão, a conversa fica na fila de quem atende.
3. **Não há botão para remover/desconectar a caixa.** O cartão tem só Pausar e Configurar (Retomar quando pausada); a única saída é `DELETE /api/v1/channel-sessions/[id]` (genérico), que arquiva (STOPPED). Conversas e mensagens ficam (2 conversas e 10 mensagens na organização de teste).
4. **O erro do Conectar era técnico e contraditório (não reconfirmável agora).** Na rodada de manhã a tela mostrou "cifra indisponível nesta instalação — a chave não foi gravada" com o aviso verde "Deu certo…" visível ao mesmo tempo (`components/connections/email/AssistenteDeConexao.tsx`: `conectar()` não zera `testado` ao falhar). Com a chave gravada o erro não ocorre, então a foto antiga foi retirada; o achado vale por leitura do código e por esse registro.
5. **Subir o teto não solta a fila do dia.** Com o teto restaurado a 200, as duas respostas seguiram `queued` (ficam para "amanhã 00:00"), conforme a mensagem. É coerente com AC-005.1, mas quem sobe o teto pensando em liberar o envio não vê isso dito na tela de Configurar.
6. **Latência de envio com intervalo de 30 s:** a primeira resposta levou 161 s para chegar ao cliente (intervalo mínimo + cron de 1 min). Dentro do desenhado; vale saber ao calibrar o intervalo padrão.
7. **Confusão de leitura, não bug:** o cliente é UM contato e UMA conversa, então a prévia da lista mostra o assunto do ÚLTIMO e-mail; a resposta se encadeia ao último e-mail do cliente (`In-Reply-To`/`References`), não ao primeiro. A sonda foi calibrada para isso.
8. **Mensagem de recusa de senha só em aviso passageiro (toast).** Ela some em poucos segundos; fica a critério do produto manter uma mensagem fixa no cartão. O Salvar mantém o formulário aberto.
9. O contato criado a partir do e-mail tem `name` vazio no banco (a tela mostra um texto de identificação). Não verificado se é intencional.

## O que NÃO foi medido

- Aviso na Central por senha recusada pela rodada, e o aviso por e-mail ao admin (trocar a senha no servidor de teste foi vetado).
- Segundo provedor real (Gmail com senha de app, Outlook): só o servidor de teste da VPS foi usado.
- Virada do dia (o teto zerar à meia-noite no fuso da organização) e a saída da fila no dia seguinte (AC-005.3); o intervalo mínimo entre dois envios (AC-005.2) não foi medido isoladamente.
- Variável `EMAIL_CANAL=desligado` (AC-008.3) e rota recusando não-admin (AC-001.6) pela tela.
- Layout em celular (só 1280 px) e acessibilidade.
- Anexos grandes (limite de tamanho), e-mail malformado e conteúdo com acentos/HTML complexo.
- A resposta do passo 4 foi conferida contra a caixa do cliente numa segunda execução do passo; a primeira execução mediu o tempo (161 s) e a segunda reaproveitou o e-mail já entregue.

## Estado em que a organização de teste ficou

- Caixa de e-mail: arquivada (STOPPED) pelo produto; sem senha em lugar nenhum do repositório.
- Resíduos que o produto não apaga: 2 conversas de e-mail, 10 mensagens (duas respostas `queued` que nunca serão enviadas), 2 contatos, linhas de auditoria e avisos da Central (`email_teto_atingido` e outros da hml). Anexos recebidos podem estar no Storage.
- `onboarded_at` da organização voltou ao valor original (`null`).
- No servidor de e-mail de teste ficaram as mensagens da sonda nas duas caixas.

---

# Rodada 2 (após a Fatia 7)

Data: 05/11/2026. Ambiente: o mesmo da rodada 1 (`https://marca-a.corretora.io`, organização `[teste-003] Empresa Exemplo`). `/api/v1/health` devolve `version 9bbf7a4` (main com a Fatia 7); `/` responde 200 e `/app` responde 307.

## Resultado em uma linha

**A rodada 2 NÃO foi concluída.** Só o passo 0 (base) rodou inteiro. O passo Conectar foi medido em parte (as telas e dois erros), e a partir daí o servidor de e-mail de teste da VPS passou a recusar as conexões vindas da hml, de modo que nenhum passo que precise de uma caixa conectada pôde rodar. Nada foi provado na hml sobre a lista de ignorados, "Não é cliente", "Remover caixa" e o celular. O script foi atualizado para isso, mas essas partes dele **nunca foram executadas** (só checagem de sintaxe).

## O que aconteceu

1. O passo Conectar rodou três vezes. Na 1ª, a tela mostrou os erros novos corretamente (abaixo). Logo depois, o Testar com a senha certa deixou de dar "Deu certo".
2. Diagnóstico (só leitura, sem tocar na VPS): a rota `POST /api/v1/channels/email/testar` da hml responde 422 com `causa: desconhecida, etapa: leitura` para as **duas** caixas de teste, com a senha certa. Controle: o mesmo Testar para `imap.gmail.com` com senha inventada devolve `senha_recusada` (a hml alcança a internet), e o login IMAP direto, do computador de quem testa, com a senha certa funciona. Conclusão provável: o servidor de e-mail de teste deixou de aceitar a hml. A causa não foi vista (pode ser bloqueio depois de senha errada; não confirmado, porque a VPS é proibida).
3. Esperei 5 tentativas com 90 s de pausa e depois cerca de 1 hora com uma sondagem a cada 3 minutos; o resultado não mudou. Pela regra da tarefa é problema de ambiente, não defeito do produto, e não foi forçado.
4. A organização de teste ficou como estava: sem caixa ativa (a caixa arquivada da rodada 1 segue arquivada), `onboarded_at` voltou a `null`, nenhuma senha no repositório.

## Tabela

| # | Passo (AC) | Resultado | Evidência |
|---|---|---|---|
| 0 | Hml na versão 9bbf7a4, `/` 200 e `/app` 307, sem caixa ATIVA (sobra a arquivada da rodada 1, com 2 conversas), e-mail ANTIGO deixado no servidor | PASSOU | [01-base.json](evidence/005-email/jornada-hml-2/01-base.json) |
| 1 | Conectar (AC-001.*): aba E-mail com assistente, Gmail com 3 passos, Conectar travado até o Testar, sem rolagem lateral em 1280 px | PASSOU nas telas; **não concluído** (Testar/Conectar reais bloqueados pelo ambiente) | [02-conectar-parcial.json](evidence/005-email/jornada-hml-2/02-conectar-parcial.json) |
| 1b | Erro do Testar (achado 4 da rodada 1): senha errada e servidor inválido mostram aviso de erro, **sem** "Deu certo", em português simples | PASSOU (2 de 2 casos no Testar) | idem |
| 1c | Erro do **Conectar** (a falha que antes deixava o "Deu certo" verde) | NÃO MEDIDO (depende de um Testar bem-sucedido; o script está pronto, no passo `erros`) | |
| 2 | Receber (AC-002.*, 004.*, 008.5) | NÃO EXECUTADO (bloqueio de ambiente) | |
| 3 | Ignorar: lista na tela, "Abrir como conversa", "Não é cliente" com confirmação e arquivamento (AC-003.*) | NÃO EXECUTADO (bloqueio de ambiente) | |
| 4 | Responder (AC-004.*) | NÃO EXECUTADO (bloqueio de ambiente) | |
| 5 | Pausar/retomar (AC-008.*) | NÃO EXECUTADO (bloqueio de ambiente) | |
| 6 | Senha recusada pelo Configurar (AC-001.4) | NÃO EXECUTADO (bloqueio de ambiente) | |
| 7 | Teto diário e fila (AC-005.*) | NÃO EXECUTADO (bloqueio de ambiente) | |
| 8 | Celular 375x812: aba E-mail, lista de ignorados, cartão da caixa | NÃO EXECUTADO (precisa de caixa e de itens ignorados) | |
| 9 | Remover caixa pela tela, senha some, conversas ficam, reconectar o mesmo endereço | NÃO EXECUTADO (precisa de caixa conectada) | |

## Frases de erro vistas na tela (passo 1b)

- Senha errada (servidor respondendo): "O servidor recusou o usuário ou a senha. Confira os dois e tente de novo. Em provedores como o Gmail, use a senha de app, não a senha normal da conta."
- Servidor inexistente: "Não encontramos esse servidor. Confira o endereço do servidor (por exemplo, imap.seudominio.com) e tente de novo."
- Servidor de e-mail inalcançável pela hml (estado em que a rodada travou): "Não foi possível concluir a conexão e não identificamos a causa. Confira os dados e tente de novo." É honesta, mas não ajuda quem erra.

## Achados novos

Nenhum defeito do produto foi provado nesta rodada. Uma observação, não confirmada: quando o servidor de e-mail recusa a conexão por um motivo que o imapflow não nomeia, a tela cai na causa `desconhecida`. Não dá para dizer se falta mapeamento (por exemplo, conexão fechada pelo servidor) sem ver o erro cru no log da hml, o que a tarefa não permite.

## O que continua não medido (e por quê)

- Tudo marcado NÃO EXECUTADO/NÃO MEDIDO na tabela: bloqueio de ambiente. Para retomar: liberar a hml no servidor de teste (ou esperar o desbloqueio) e rodar, na ordem, `base, conectar, receber, ignorar, responder, pausar, senha, teto, celular, limpar, erros`. O `erros` vai por último de propósito, porque senhas erradas parecem ser o gatilho do bloqueio.
- Por decisão da tarefa (igual à rodada 1): aviso na Central por senha recusada pela rodada (exigiria trocar a senha no servidor de teste), virada do dia, `EMAIL_CANAL=desligado` (exige mudar a variável na VPS; já tem teste automatizado) e segundo provedor real (Gmail/Outlook: o dono fará pela tela dele).

## O que mudou no script (`scripts/sondas/jornada-email-hml.mjs`) e NÃO foi executado

- Passo `ignorar`: usa a seção "E-mails que não viraram conversa" da aba E-mail (remetente, assunto, data, motivo), "Abrir como conversa" e "Não é cliente" (com confirmação, arquivamento da conversa e e-mail seguinte ignorado) pela tela, com remetentes novos por rodada. A API ficou só como diagnóstico dos campos.
- Passo `limpar`: "Remover caixa" pela tela (cancelar, depois confirmar), confere senha apagada, caixa arquivada e conversas mantidas; reconecta o mesmo endereço, confere que a linha volta com as conversas; remove de novo e devolve `onboarded_at`.
- Passos novos `celular` (375x812: sem rolagem lateral, botões >= 44 px, fonte >= 12 px, diálogos e assistente) e `erros` (erro no Conectar, com a senha trocada no corpo da requisição; senha errada e servidor inválido no Testar).
- Ajustes para a organização já ter conversas da rodada 1 (casar pela etiqueta da rodada; não contar fila e avisos antigos).
- Esses trechos podem ter erros de seletor que só aparecem ao rodar.
