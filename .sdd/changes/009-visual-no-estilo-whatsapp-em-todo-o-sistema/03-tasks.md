# Tarefas: Visual no estilo WhatsApp em todo o sistema

> Mudança `009-visual-no-estilo-whatsapp-em-todo-o-sistema` · porte L · 2026-10-29
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

### Fatia 1 (leva 1): Menu recolhido por padrão e escolha por usuário
- [x] T-001 [TEST-UNIT] Testes "AC-001.1/001.3/001.4": sem cookie do usuário o layout entrega menu recolhido; cookie 0 expandido; cookie de outro usuário ignorado; a ação grava com o userId da sessão e não grava sem usuário (~30 min) {AC-001.1,AC-001.3,AC-001.4}
- [x] T-002 [IMPL] Layout lê sidebar_collapsed_<userId> com padrão recolhido e toggleSidebar grava por usuário (~30 min) {AC-001.1,AC-001.3,AC-001.4} deps: T-001

### Fatia 2 (leva 1): Rótulo no foco, item ativo e nenhum destino a menos
- [x] T-003 [TEST-UI] Testes "AC-001.2/001.5/001.6": no recolhido o nome aparece no hover e no foco por teclado, aria-current no item ativo, e todos os destinos de sidebarGroups() são renderizados (~35 min) {AC-001.2,AC-001.5,AC-001.6}
- [x] T-004 [IMPL] Sidebar recolhida com rótulo no foco e no hover, aria-current e botão de expandir sempre visível (~35 min) {AC-001.2,AC-001.5,AC-001.6} deps: T-003
- [x] T-005 [TEST-UNIT] Reforço da cerca de navegação: o recolhido e a gaveta do celular cobrem todo o NAV_CATALOG (~25 min) {AC-006.3} deps: T-004

### Fatia 3 (leva 1): Navegação no celular
- [x] T-006 [P] [TEST-UI] Testes "AC-002.1/002.2": barra de baixo com 4 abas e Mais, e a gaveta lista o restante agrupado (~30 min) {AC-002.1,AC-002.2}
- [x] T-007 [TEST-E2E] Jornada a 390 px: sem rolagem lateral, alvos de 44 px e a barra não cobre o campo com o teclado aberto, medidos por getBoundingClientRect (~45 min) {AC-002.3,AC-002.4} deps: T-006
- [x] T-008 [IMPL] Ajustes de barra de baixo e gaveta aos tokens, sem mudar quais abas aparecem (~30 min) {AC-002.1,AC-002.2,AC-002.3,AC-002.4} deps: T-007

### Fatia 4 (leva 1): Casca global por tokens, nos dois temas
- [x] T-009 [TEST-UNIT] Cercas "AC-003.1/003.3": tailwind-tokens e branding verdes, nenhum hex novo em componente e nenhum verde, logo ou ícone do WhatsApp (~30 min) {AC-003.1,AC-003.3}
- [x] T-010 [TEST-E2E] Jornada: contraste de texto de pelo menos 4,5 nas telas principais, em claro e escuro, por getComputedStyle (~45 min) {AC-003.2} deps: T-009
- [x] T-011 [TEST-UI] Teste "AC-003.4": a caixa de conversas da 004 mantém balões, duplo check e menu barra, dentro da casca nova (~25 min) {AC-003.4}
- [x] T-012 [IMPL] Tokens de superfície, cantos, tipografia e cabeçalho em app/globals.css e no TopBar (~60 min) {AC-003.1,AC-003.2,AC-003.3,AC-003.4} deps: T-009,T-010,T-011

### Fatia 5 (leva 1): Prova na homologação e aprovação do dono
- [x] T-013 [TEST-E2E] Jornada da leva 1 na hml: capturas lado a lado da tela nova, da antiga e do WhatsApp Web, claro e escuro, computador e celular, com medidas (~60 min) {AC-005.1,AC-005.2,AC-007.1} deps: T-002,T-004,T-008,T-012
- [x] T-014 [TEST-UNIT] Suíte completa e diff sem app/api, supabase nem permissões (~30 min) {AC-006.1,AC-006.2} deps: T-013
- [x] T-015 [CHECK-SMOKE] Implantar a leva 1 na hml e, depois da aprovação do dono, em produção só com autorização escrita; sondas / 200 e /app 307 (~40 min) {AC-007.1} deps: T-014
- [x] T-016 [TEST-E2E] Voltar à imagem anterior na hml e medir que o visual antigo volta e que / responde 200 e /app 307 (~30 min) {AC-007.3} deps: T-015

### Fatia 6 (leva 2): Linha de lista e Contatos
- [x] T-017 [TEST-UI] Testes "AC-004.1/004.4": LinhaDeLista com avatar, título, prévia e direita, e os estados vazio, erro e carga (~35 min) {AC-004.1,AC-004.4} deps: T-016
- [x] T-018 [TEST-UI] Testes "AC-004.2/004.3": Contatos busca, filtra, ordena, pagina e seleciona em lote como antes, sem enfraquecer os testes existentes (~45 min) {AC-004.2,AC-004.3} deps: T-017
- [x] T-019 [IMPL] components/ui/linha-de-lista.tsx e Contatos desenhando por ela, mantendo props e handlers (~60 min) {AC-004.1,AC-004.2,AC-004.3,AC-004.4} deps: T-017,T-018

### Fatia 7 (leva 2): Tarefas, Casos, Follow-ups e cartões da Central
- [x] T-020 [P] [TEST-UI] Testes de comportamento preservado em Tarefas, Casos e Follow-ups (~45 min) {AC-004.1,AC-004.2,AC-004.3,AC-004.4} deps: T-019
- [x] T-021 [P] [TEST-UI] Testes dos cartões da Central em linha, com Aprovar e Recusar funcionando (~35 min) {AC-004.1,AC-004.2,AC-004.4} deps: T-019
- [x] T-022 [IMPL] Tarefas, Casos, Follow-ups e cartões da Central desenhando por LinhaDeLista (~60 min) {AC-004.1,AC-004.2,AC-004.3,AC-004.4} deps: T-020,T-021

### Fatia 8 (leva 2): Prova e entrega da leva 2
- [ ] T-023 [TEST-E2E] Jornada da leva 2 na hml: capturas lado a lado e medidas das telas em lista, e funil e agenda com a forma de antes (~60 min) {AC-005.1,AC-007.2} deps: T-022
- [ ] T-024 [CHECK-SMOKE] Implantar a leva 2 na hml e, depois da aprovação do dono, em produção só com autorização escrita; sondas / 200 e /app 307 (~40 min) {AC-007.2} deps: T-023

### Fechamento
- [ ] T-025 [DOCS] Fragmento em .changes/ declarando o efeito no operador (menu nasce recolhido) e doc de arquitetura atualizada (~25 min) deps: T-015
- [ ] T-026 [REFACTOR] Limpeza com testes verdes (~25 min) deps: T-024


## Estimativa

<!-- Gerada por `sdd estimate`. Sempre com a linha TOTALIZADOR GERAL. -->
