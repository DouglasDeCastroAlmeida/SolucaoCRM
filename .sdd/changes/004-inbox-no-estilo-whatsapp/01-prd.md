# PRD: Inbox no estilo WhatsApp

> Mudança `004-inbox-no-estilo-whatsapp` · porte M · 2026-10-27
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.

## Correção ao Grill (verificada no código depois da aprovação)

A decisão **D-02 do Grill (tabela nova de respostas rápidas) cai**. O menu "/" já existe: `components/inbox/composer/TemplateMenu.tsx`, alimentado por `hooks/inbox/useMessageTemplates.ts` e `/api/v1/message-templates` (templates **pessoais e compartilhados**, com atalho e imagens, editados em Configurações). Este subprojeto **não cria tabela, rota nem migration**: só reestiliza o menu e confere que funciona. As demais decisões do Grill seguem de pé. Também ficou claro que o balão enviado já usa o token `bg-primary`, então parte do tema pela marca já funciona; o trabalho é garantir contraste e acabamento.

## Problema

O inbox é onde o autônomo passa o dia, e hoje ele tem cara de painel de CRM, não de conversa. Quem vem do WhatsApp pessoal precisa reaprender onde olhar: o que não foi lido, quem respondeu por último, se a mensagem chegou e foi lida. Num produto vendido a autônomos que não são técnicos, estranhar a tela principal é abandono. O custo de não resolver é perder a primeira impressão de uma marca nova, justamente na tela que mais pesa na decisão de pagar depois do trial.

## Objetivos e métricas

- Quem usa WhatsApp reconhece a lista e a conversa sem explicação: prova com um leigo seguindo o roteiro da jornada de inbox, sem ajuda.
- Contraste mínimo WCAG AA (4,5:1) no texto de todo balão, para qualquer cor de marca, nos temas claro e escuro.
- Nenhuma regressão: todos os testes atuais do inbox verdes e nenhuma ação (enviar, assumir, devolver, anexar, gravar áudio, reagir) perde função.
- Lista com 500 conversas rola sem travar (medido por ferramenta no navegador).
- Zero cor ou nome de marca fixo no código novo (`tests/unit/branding.test.ts` continua verde).

## Personas e cenários

- **Autônomo atendendo sozinho:** abre o inbox, vê quem espera resposta, responde pelo celular ou computador, usa atalhos "/" para preço e endereço.
- **Atendente de equipe pequena:** pega conversas da fila, assume, devolve para a IA quando termina.
- **Dono da plataforma (revendedor):** vê o inbox na cor da sua marca, sem rastro de outra marca.

## Requisitos funcionais

### REQ-001: Lista de conversas estilo WhatsApp

Como atendente, quero ler a lista num relance para saber o que pede resposta.

- **AC-001.1** Dado uma conversa na lista, quando ela é exibida, então mostra foto (ou iniciais quando não há foto), nome, prévia da última mensagem e horário curto.
- **AC-001.2** Dado a última mensagem enviada por nós, quando a prévia é exibida, então ela começa com "Você:" e mostra o ícone de status (enviada, entregue, lida).
- **AC-001.3** Dado a última mensagem que é mídia (imagem, áudio, documento), quando a prévia é exibida, então mostra o ícone e o rótulo do tipo, nunca o endereço do arquivo.
- **AC-001.4** Dado uma conversa com mensagens não lidas, quando a lista é exibida, então mostra o contador na cor da marca e o nome em destaque; ao abrir a conversa o contador some.
- **AC-001.5** Dado o horário da última mensagem, quando a lista é exibida, então mostra a hora se for de hoje, "Ontem" se for de ontem, o dia da semana se for da última semana e a data nos demais casos, no fuso da organização.
- **AC-001.6** Dado uma conversa de canal diferente, quando exibida, então mostra o ícone do canal sem assumir WhatsApp.
- **AC-001.7** Dado o filtro por abas, quando o atendente escolhe, então as abas se chamam "Minhas", "Não atribuídas" e "IA", com contagem, e cada uma lista só o que o nome diz.

### REQ-002: Conversa estilo WhatsApp

Como atendente, quero ver o fio da conversa como num app de mensagens.

- **AC-002.1** Dado mensagens seguidas do mesmo lado em menos de 2 minutos, quando exibidas, então se agrupam (cauda do balão só na última, espaçamento menor).
- **AC-002.2** Dado mensagens de dias diferentes, quando exibidas, então há um separador de data ("Hoje", "Ontem" ou a data).
- **AC-002.3** Dado uma mensagem enviada, quando seu estado muda, então o balão mostra relógio (enviando), ✓ (enviada), ✓✓ (entregue) e ✓✓ na cor de destaque (lida), conforme o que o canal informou; sem informação do canal, nada é inventado.
- **AC-002.4** Dado uma mensagem que falhou, quando exibida, então mostra a falha de forma visível e a ação de tentar de novo que já existe continua funcionando.
- **AC-002.5** Dado o horário de cada mensagem, quando exibido, então fica dentro do balão, em tamanho pequeno, no fuso da organização.
- **AC-002.6** Dado a barra da conversa, quando exibida, então mantém "Assumir" e "Devolver para a IA" com o mesmo comportamento de hoje, só reestilizados.

### REQ-003: Tema pela marca, com contraste garantido

Como revendedor, quero o inbox na cor da minha marca e sempre legível.

- **AC-003.1** Dado uma marca com cor de destaque, quando o inbox abre, então o balão enviado, o contador de não lidas e os destaques usam essa cor.
- **AC-003.2** Dado qualquer cor de destaque, quando o balão é desenhado, então o texto escolhido tem contraste de pelo menos 4,5:1 com o fundo do balão.
- **AC-003.3** Dado o tema claro ou escuro, quando o inbox abre, então o fundo da conversa, o balão recebido e a lista seguem o tema, também com contraste mínimo.
- **AC-003.4** Dado a marca padrão ou nenhuma cor definida, quando o inbox abre, então usa as cores padrão do produto, sem erro.

### REQ-004: Campo de mensagem

Como atendente, quero enviar texto, áudio e respostas prontas sem fricção.

- **AC-004.1** Dado o campo vazio, quando exibido, então mostra o botão de gravar áudio; com texto digitado, mostra o botão de enviar.
- **AC-004.2** Dado o texto começando por "/", quando digitado, então o menu de respostas rápidas abre listando título, atalho e prévia do texto, filtrando enquanto se digita.
- **AC-004.3** Dado uma resposta escolhida no menu, quando confirmada, então o texto entra no campo para revisão antes de enviar, e as imagens do template seguem o comportamento atual.
- **AC-004.4** Dado o atendente sem permissão de ver templates, quando digita "/", então o menu não abre e o "/" segue como texto.

### REQ-005: Painel do contato recolhível

Como atendente, quero ver o contexto do contato sem perder espaço da conversa.

- **AC-005.1** Dado o painel do contato, quando o atendente o recolhe, então a conversa ocupa a largura liberada e o painel mostra só o fio de reabrir.
- **AC-005.2** Dado que o atendente recolheu o painel, quando troca de conversa ou recarrega a página, então o estado se mantém.
- **AC-005.3** Dado o painel aberto, quando exibido, então mostra etapa no funil, tags, próximos compromissos e notas, como hoje, com o novo acabamento visual.

### REQ-006: Funciona para qualquer canal

Como dono, quero que o e-mail (mudança 005) entre no mesmo inbox sem refazer o visual.

- **AC-006.1** Dado uma conversa de um canal sem recibo de leitura ou sem áudio, quando exibida, então não mostra ✓✓ nem botão de áudio que o canal não suporta.
- **AC-006.2** Dado uma mensagem longa com várias linhas (estilo e-mail), quando exibida, então o balão quebra e rola sem estourar a coluna.
- **AC-006.3** Dado uma conversa de canal desconhecido, quando exibida, então usa o ícone genérico e não quebra.

### REQ-007: Qualidade, acessibilidade e desempenho

- **AC-007.1** QUANDO o inbox é navegado só pelo teclado o sistema DEVE permitir percorrer a lista, abrir a conversa, enviar e usar os atalhos existentes, com foco visível.
- **AC-007.2** Dado 500 conversas na lista, quando o atendente rola, então a rolagem não perde quadros de forma perceptível (medido por ferramenta, não a olho).
- **AC-007.3** Dado a tela em largura de celular, quando o inbox abre, então lista e conversa se alternam sem rolagem horizontal.
- **AC-007.4** QUANDO o código novo de inbox é lido pelo teste de marca o sistema DEVE passar sem cor ou nome de marca fixo.
- **AC-007.5** Dado que o texto novo do inbox é exibido, quando o idioma é en ou es, então aparece traduzido pelo dicionário.

## Requisitos não funcionais

- **Compatibilidade:** nenhum contrato de API, tabela ou migration muda; a reestilização é só de apresentação.
- **Segurança:** nenhum dado novo exposto; o inbox continua filtrando por organização e permissão.
- **Observabilidade:** nada novo; erros seguem pelo registro atual.
- **Idioma:** pt-BR, en e es pelo dicionário; sem texto fixo.

## Fora de escopo

- Respostas rápidas novas ou pessoais (já existem templates pessoais e compartilhados).
- Tabela, rota ou migration nova.
- App mobile (subprojeto 7).
- O canal de e-mail em si (mudança 005).
- Regras de atribuição, roteamento, IA e anti-banimento.
- Reações novas, chamadas, status/stories.

## Dependências e riscos

- **Risco de regressão** numa das telas mais usadas. Mitigação: testes atuais como piso, prova pela tela antes e depois.
- **Testes de marcação:** a reestilização pode quebrar testes que checam classes; ajusto só quando o comportamento não mudou, e digo quando for o caso.
- **Rótulo "Fila" → "Não atribuídas":** a aba hoje se chama "Fila" (o significado mudou deliberadamente em outra issue). Conferir a razão antes de renomear; se houver motivo, o rótulo da spec entra como subtítulo.
- **✓✓ lido** depende do que o canal devolve (WAHA); o que não vier não é inventado.
- **Dono:** aprovar o visual pela homologação antes da produção.
