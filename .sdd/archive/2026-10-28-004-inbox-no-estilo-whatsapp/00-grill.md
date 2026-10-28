# Grill: Inbox no estilo WhatsApp

> Mudança `004-inbox-no-estilo-whatsapp` · porte M · 2026-10-27
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

Usuário: "Gostaria de planejar também os outros subprojetos que poderão rodar em paralelo. Assim, implementamos juntos posteriormente." Subprojeto 3 da seção 12 da spec `docs/solucao-crm/specs/2026-10-21-crm-autonomos-design.md`: **Inbox no estilo WhatsApp**, porte M, depende só do 0 (concluído). Escopo: seção 7.1 e decisão D-14. Planejamento antecipado: a implementação só começa quando o dono pedir.

## Contexto levantado no código

- O inbox de 3 painéis **já existe** em `components/inbox/` (48 arquivos): lista de conversas, `ConversationListItem`, `ChatThread`, `MessageBubble`, `Composer` com `composer/AudioRecorder.tsx`, `InboxFilters` (filtro "Minhas"), `CRMSidePanel`, `InboxKeyboardShortcuts`, tags, reatribuição, ações em lote, aviso de janela fechada.
- Já há sinais de: contador de não lidas, reações (`MessageBubble`, `lib/messaging/presenca.ts`), gravação de áudio, ack de mensagens.
- Não encontrei, a confirmar no PRD: respostas rápidas com "/", ícone do canal na lista (existe `ChannelLogo.tsx`), ✓✓ de entregue e lido completos, painel do contato recolhível, filtro "IA", ação "devolver para a IA", tema pelos tokens da marca.
- A SP1 entregou a marca por host; o tema do inbox deve vir de `lib/branding` (D-14), sem texto ou cor fixos de marca (vigiado por `tests/unit/branding.test.ts`).
- O canal de e-mail (mudança 005) vai criar conversas no mesmo inbox: o desenho não pode assumir só WhatsApp.

## Perguntas e respostas

### P1. Reestilizar o inbox atual ou reconstruí-lo?
- Recomendação do agente: **reestilizar e completar o que falta, sem reescrever**. O inbox já tem 48 arquivos com lista, conversa, áudio, reações, filtros, atalhos e testes. Reconstruir joga fora comportamento provado e arrisca regressão num dos pontos mais usados do produto. O subprojeto vira: (1) visual de WhatsApp (balões, ✓✓, prévia, horário, não lidas, foto, ícone do canal) pelos tokens da marca; (2) completar as lacunas da seção 7.1 (respostas rápidas com "/", filtros "Não atribuídas" e "IA", assumir ou devolver para a IA, painel do contato recolhível); (3) manter todos os testes atuais verdes.
- Resposta: aceita a recomendação

### P2. As respostas rápidas (digitar "/" no campo de mensagem) são da organização inteira ou pessoais de cada atendente?
- Recomendação do agente: **da organização, compartilhadas por toda a equipe**, com a lista de atalhos editada por quem tem papel de gerente ou admin e usada por qualquer atendente. O público é de autônomos com equipes pequenas (1, 3 ou poucos atendentes), que querem o mesmo texto de preço, endereço e horário em todo mundo. Cada resposta tem um atalho curto (ex.: "/preco") e aceita variáveis como o nome do contato. Respostas pessoais ficam para depois, se pedirem. Isso exige uma tabela nova com RLS por organização e entra na migration deste subprojeto.
- Resposta: aceita a recomendação

### P3. As cores do inbox copiam o verde do WhatsApp ou usam a cor da marca?
- Recomendação do agente: **a cor da marca (D-14)**, com a estrutura do WhatsApp. Balão enviado na cor de destaque da marca (com texto em contraste legível, mínimo WCAG AA), balão recebido neutro, fundo da conversa discreto, tema claro e escuro. Copiar o verde do WhatsApp faria toda marca parecer a mesma e confundiria com o app oficial; usar `platform_branding` e `organizations.settings.branding` mantém o white-label (cada revendedor com a sua cara) e o `branding.test.ts` continua vigiando cor e nome fixos. Se uma marca escolher uma cor clara demais, o texto do balão troca para escuro automaticamente.
- Resposta: aceita a recomendação

Respondidas pelo código, sem perguntar:

### P4. Assumir, devolver para a IA e a aba "IA" já existem?
- Fonte: `supabase/baseline.sql` (CHECK de `conversations_status_check` inclui `claimed` e `ai_handling`; comentário em torno da linha 17372 descreve a aba "IA" por `?status=ai_handling`) e `components/inbox/ConversationHeader.tsx` (ações de assumir e devolver, com `ConversationHeader.acoes.test.tsx`). Portanto o subprojeto **não** cria esse fluxo: reestiliza e confere que funciona; o PRD lista só a diferença real para a seção 7.1.

### P5. Como o inbox lida com mais de um canal (WhatsApp agora, e-mail na mudança 005)?
- Fonte: `components/inbox/ChannelLogo.tsx` e `ConversationListItem.tsx` já mostram o canal; a spec 7.2 diz que os e-mails "viram conversas do contato no mesmo inbox". Decisão: o visual e os componentes novos não assumem WhatsApp (balão, ✓✓ e áudio aparecem conforme o canal da conversa); o desenho de e-mail em si é da mudança 005.

## Decisões

- **D-01** Reestilizar e completar o inbox atual, sem reescrever; todos os testes existentes continuam verdes.
- **D-02** Respostas rápidas por "/", da organização, editadas por gerente ou admin e usadas por qualquer atendente, com atalho curto e variável de nome do contato; tabela nova com RLS por organização, em migration versionada com apêndice no baseline.
- **D-03** Cores pela marca (D-14): balão enviado na cor de destaque da marca com contraste mínimo WCAG AA, balão recebido neutro, tema claro e escuro; nenhuma cor ou nome de marca fixo no código.
- **D-04** Lista de conversas com foto, prévia, horário, contador de não lidas, ícone do canal e filtros "Minhas / Não atribuídas / IA"; conversa com balões e ✓✓ de entregue e lido; painel do contato recolhível. O PRD confere item a item o que já existe e especifica só a diferença.
- **D-05** Assumir e devolver para a IA já existem; entram só reestilizados e conferidos.
- **D-06** Componentes novos não assumem WhatsApp, para o canal de e-mail (mudança 005) entrar sem refazer.
- **D-07** Prova pela tela em ambiente fresco estilo VPS, com evidência visual e medidas por ferramenta (doutrina de QA visual do projeto).

## Fora de escopo

- Respostas rápidas pessoais por atendente.
- App mobile (subprojeto 7); aqui só o web, responsivo como já é.
- O canal de e-mail e qualquer mudança de backend de mensagens (mudança 005).
- Mudar regras de atribuição, roteamento, IA ou anti-banimento.
- Reações novas além das que já existem, chamadas de voz e vídeo, status/stories.

## Riscos e premissas

- **Risco:** regressão em uma das telas mais usadas. Mitigação: testes atuais verdes como piso, prova pela tela antes e depois, mudança visual por tokens e classes, sem mexer em lógica de mensagens.
- **Risco:** contraste ruim com cor de marca clara ou escura demais. Mitigação: cálculo automático da cor do texto e teste de contraste.
- **Risco:** o inbox ocupa muitos arquivos com testes de marcação; a reestilização pode quebrar testes de classe. Mitigação: ajustar o teste só quando o comportamento não mudou, e dizer quando for o caso.
- **Premissa:** os ✓✓ de entregue e lido dependem do que o WAHA devolve; o que não vier do canal não é inventado.
- **Premissa:** o dono aprova o visual pela tela da homologação antes da produção.
