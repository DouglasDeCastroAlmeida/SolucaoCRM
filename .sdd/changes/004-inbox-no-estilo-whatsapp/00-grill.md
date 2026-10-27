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
- Resposta: PENDENTE

## Decisões

<!-- PREENCHA ao fechar o Grill. -->

## Fora de escopo

<!-- PREENCHA ao fechar o Grill. -->

## Riscos e premissas

<!-- PREENCHA ao fechar o Grill. -->
