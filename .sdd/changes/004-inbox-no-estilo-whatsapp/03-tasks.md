# Tarefas: Inbox no estilo WhatsApp

> Mudança `004-inbox-no-estilo-whatsapp` · porte M · 2026-10-27
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

### Fatia 1: Tema pela marca com contraste garantido (REQ-003)
- [x] T-001 [TEST-UNIT] Função de contraste: para qualquer cor de destaque (inclusive muito clara, muito escura e ausente) a cor do texto do balão tem pelo menos 4,5:1, nos temas claro e escuro, e a marca padrão não dá erro (~40 min) {AC-003.2, AC-003.4}
- [x] T-002 [IMPL] lib/inbox/tema-do-balao.ts: escolhe a cor do texto e expõe variáveis CSS a partir dos tokens da marca (~40 min) {AC-003.2, AC-003.4} deps: T-001
- [x] T-003 [TEST-UI] Balão enviado e contador na cor da marca, balão recebido neutro, fundo da conversa e lista seguindo o tema claro e escuro (~35 min) {AC-003.1, AC-003.3} deps: T-002
- [x] T-004 [IMPL] Aplicar o tema no inbox pelos tokens, sem cor ou nome de marca fixo (~45 min) {AC-003.1, AC-003.3} deps: T-003

### Fatia 2: Lista de conversas (REQ-001)
- [x] T-005 [TEST-UNIT] Formatadores: horário curto (hora, "Ontem", dia da semana, data, no fuso da organização) e prévia ("Você:", ícone e rótulo de mídia, nunca o endereço do arquivo) (~40 min) {AC-001.2, AC-001.3, AC-001.5}
- [x] T-006 [IMPL] lib/inbox/formato-da-lista.ts (~35 min) {AC-001.2, AC-001.3, AC-001.5} deps: T-005
- [x] T-007 [TEST-UI] ConversationListItem: foto ou iniciais, nome, prévia, horário, contador de não lidas que some ao abrir, ícone do canal, canal desconhecido com ícone genérico (~45 min) {AC-001.1, AC-001.4, AC-001.6, AC-006.3} deps: T-004, T-006
- [x] T-008 [IMPL] Reestilizar ConversationListItem com os formatadores e o tema (~50 min) {AC-001.1, AC-001.4, AC-001.6, AC-006.3} deps: T-007
- [x] T-009 [TEST-UI] Abas "Minhas", "Não atribuídas" e "IA" com contagem, cada uma listando só o que o nome diz (~30 min) {AC-001.7}
- [x] T-010 [IMPL] Rótulos das abas em InboxFilters, depois de conferir a razão do nome "Fila" (se houver motivo, o rótulo da spec entra como subtítulo) (~30 min) {AC-001.7} deps: T-009

### Fatia 3: Conversa (REQ-002, REQ-006)
- [x] T-011 [TEST-UNIT] Agrupamento de mensagens seguidas do mesmo lado em menos de 2 minutos e separador de data ("Hoje", "Ontem", data) (~35 min) {AC-002.1, AC-002.2}
- [x] T-012 [IMPL] lib/inbox/agrupar-mensagens.ts (~35 min) {AC-002.1, AC-002.2} deps: T-011
- [x] T-013 [TEST-UI] MessageBubble: relógio, ✓, ✓✓ e ✓✓ lido conforme o que o canal informou, nada inventado quando o canal não informa, falha visível com tentar de novo, horário dentro do balão, canal sem recibo ou sem áudio sem esses ícones (~50 min) {AC-002.3, AC-002.4, AC-002.5, AC-006.1}
- [x] T-014 [TEST-UI] Mensagem longa com várias linhas quebra e rola sem estourar a coluna (~25 min) {AC-006.2}
- [x] T-015 [IMPL] MessageBubble e ChatThread: balões com cauda, agrupamento, separador de data, recibos e horário no balão (~60 min) {AC-002.1, AC-002.2, AC-002.3, AC-002.4, AC-002.5, AC-006.1, AC-006.2} deps: T-004, T-012, T-013, T-014
- [x] T-016 [TEST-UI] Barra da conversa mantém "Assumir" e "Devolver para a IA" com o mesmo comportamento de hoje (~30 min) {AC-002.6}
- [x] T-017 [IMPL] Reestilizar ConversationHeader sem mudar as ações (~40 min) {AC-002.6} deps: T-016

### Fatia 4: Campo de mensagem e painel do contato (REQ-004, REQ-005)
- [ ] T-018 [TEST-UI] Composer: botão de gravar áudio com o campo vazio e de enviar com texto; "/" abre o menu com título, atalho e prévia, filtra ao digitar; escolher insere o texto para revisão; sem permissão o "/" segue como texto (~50 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.4}
- [ ] T-019 [IMPL] Composer e TemplateMenu reestilizados, sem mudar a API de templates (~50 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.4} deps: T-004, T-018
- [ ] T-020 [TEST-UI] Painel do contato: recolher mostra só o fio de reabrir, estado mantido ao trocar de conversa e ao recarregar, conteúdo (funil, tags, compromissos, notas) preservado (~40 min) {AC-005.1, AC-005.2, AC-005.3}
- [ ] T-021 [IMPL] Acabamento visual do CRMSidePanel (~40 min) {AC-005.1, AC-005.2, AC-005.3} deps: T-004, T-020

### Fatia 5: Idiomas, teclado, desempenho e marca (REQ-007)
- [ ] T-022 [TEST-UNIT] Textos novos do inbox existem em pt-BR, en e es no dicionário e a varredura de marca não acha cor ou nome fixo no código novo (~30 min) {AC-007.4, AC-007.5}
- [ ] T-023 [IMPL] Entradas do dicionário (com a chave en/es) e ajustes até a varredura de marca passar (~30 min) {AC-007.4, AC-007.5} deps: T-022, T-015, T-019
- [ ] T-024 [TEST-UI] Navegação só pelo teclado: percorrer a lista, abrir a conversa, enviar e usar os atalhos existentes, com foco visível (~40 min) {AC-007.1} deps: T-015, T-019
- [ ] T-025 [TEST-E2E] Medição por ferramenta no navegador: 500 conversas rolam sem perder quadros e em largura de celular não há rolagem horizontal (~50 min) {AC-007.2, AC-007.3} deps: T-008, T-015

### Fechamento
- [ ] T-026 [TEST-E2E] Jornada pela tela num ambiente fresco estilo VPS, com screenshots antes e depois e as medidas por ferramenta, em evidence/ (~50 min) {AC-001.1, AC-002.3, AC-003.2} deps: T-025
- [ ] T-027 [DOCS] Atualizar docs/testing/user-journey-map.md e registrar a prova (~25 min) deps: T-026
- [ ] T-028 [CHECK-SMOKE] Implantar na homologação, o dono aprova o visual pela tela (~30 min) deps: T-026
- [ ] T-029 [CHECK-SMOKE] Implantar em produção e rodar a sonda (/ = 200, /app = 307) (~30 min) deps: T-028
- [ ] T-030 [REFACTOR] Limpeza com testes verdes (~20 min) deps: T-029

## Estimativa

<!-- Gerada por `sdd estimate`. Sempre com a linha TOTALIZADOR GERAL. -->
