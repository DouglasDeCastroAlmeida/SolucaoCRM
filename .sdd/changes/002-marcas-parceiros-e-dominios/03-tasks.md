# Tarefas: Marcas, parceiros e domínios

> Mudança `002-marcas-parceiros-e-dominios` · porte L · 2026-10-25
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

### Fatia 1: Banco aditivo, marca padrão herdada e isolamento (REQ-002, REQ-003)
- [x] T-001 [TEST-INT] Invariante de migração: instalação nova e atualização com dados, idempotência, marca padrão com campos nulos que herda de platform_branding, organizações ligadas, imagem anterior segue funcionando (~45 min) {AC-002.2, AC-002.3, AC-002.4, AC-010.3}
- [x] T-002 [TEST-INT] Invariante de isolamento: 2 marcas, 2 organizações, 1 e-mail nas duas; organização comum não lê domínios nem tabelas de parceiro; admin do parceiro só alcança o parceiro dele; funções novas sem EXECUTE para PUBLIC e anon (~50 min) {AC-003.1, AC-003.2, AC-003.3, AC-003.4}
- [x] T-003 [TEST-INT] Invariante da troca de marca de uma organização: só admin da plataforma, com linha de auditoria (~40 min) {AC-003.5}
- [x] T-004 [SETUP] Reservar o número da migration com pnpm checar:colisao-de-migration e criar o arquivo com cabeçalho -- manifest: (~10 min)
- [x] T-005 [IMPL] Migration aditiva + apêndice idempotente no baseline.sql: partners, partner_members, brands, brand_domains, brand_plans, vertical_packs, brand_email_context, auth_hook_deliveries, organizations.brand_id, funções e políticas RLS (~60 min) {AC-002.2, AC-002.3, AC-002.4, AC-003.1, AC-003.2, AC-003.3, AC-003.4, AC-010.3} deps: T-001, T-002, T-004
- [x] T-006 [IMPL] RPC fn_set_org_brand (security definer, revogada de PUBLIC e anon) e ações novas em lib/audit/actions.ts (~35 min) {AC-003.5} deps: T-003, T-005
- [x] T-007 [CHECK-SMOKE] pnpm test:db verde em instalação nova e em atualização (~15 min) deps: T-005, T-006

### Fatia 2: Resolver a marca pelo endereço, com chave de desligamento (REQ-001, REQ-002, REQ-005 parcial, REQ-010)
- [x] T-008 [TEST-UNIT] Resolvedor host → marca: domínio ativo de marca ativa, host desconhecido, domínio removido, desativado ou de marca inativa (~30 min) {AC-001.1, AC-001.2, AC-001.3}
- [x] T-009 [TEST-UNIT] Degradação sem lançar (banco lento ou fora, cache corrompido) com motivo registrado; cache de 60 s e invalidação no CRUD (~35 min) {AC-001.4, AC-001.5}
- [x] T-010 [TEST-UNIT] MARCAS_POR_DOMINIO=off devolve a marca padrão sem consultar a tabela de domínios (~20 min) {AC-002.1}
- [x] T-011 [TEST-UNIT] Precedência organização > marca > plataforma > padrão; permite_personalizacao = false; antes do login só a marca; PDF de LGPD sem marca (~35 min) {AC-005.5, AC-005.6}
- [x] T-012 [TEST-UNIT] Desempenho do resolvedor (≤ 30 ms p95 com cache quente, ≤ 200 ms frio) e contraste de cor de marca pela régua existente (~30 min) {AC-010.1, AC-010.2}
- [x] T-013 [TEST-UNIT] Catraca de marca (tests/unit/branding.test.ts) passa a conhecer a camada de marca (~30 min) {AC-010.5}
- [x] T-014 [IMPL] lib/branding/marca-do-host.ts, repositório lib/brands com cliente admin, cache em memória, flag e variáveis em lib/env.ts e .env.example (~50 min) {AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-002.1} deps: T-008, T-009, T-010, T-005
- [x] T-015 [IMPL] Camada de marca em resolve.ts e saida.ts, header x-brand-host no proxy.ts, layout raiz e layout público usando a marca do host (~50 min) {AC-005.5, AC-005.6, AC-010.1, AC-010.2, AC-010.5} deps: T-011, T-012, T-013, T-014
- [x] T-016 [CHECK-SMOKE] pnpm typecheck, pnpm lint e pnpm test:unit verdes até aqui (~15 min) deps: T-015

### Fatia 3: Painel da plataforma — marcas, domínios, planos, pacotes e contas (REQ-008)
- [x] T-017 [TEST-INT] Rotas admin de marcas: criar, editar, desativar; 403 para quem não é admin da plataforma; auditoria e requireSupportWrite em toda mutação (~50 min) {AC-008.1, AC-008.6, AC-008.7}
- [x] T-018 [TEST-INT] Domínios: duplicado devolve 409 e repetir o clique não duplica; planos por marca sem acionar cobrança (~40 min) {AC-008.2, AC-008.3}
- [x] T-019 [TEST-INT] Pacotes verticais: cópia na criação da organização e independência nos dois sentidos (~45 min) {AC-008.4}
- [x] T-020 [TEST-INT] Lista de todas as contas com a marca de cada uma e acesso de suporte (impersonar) com guarda de efeito e auditoria (~40 min) {AC-008.5}
- [x] T-021 [IMPL] API admin de marcas e domínios (app/api/v1/admin/brands) com invalidação do cache (~55 min) {AC-008.1, AC-008.2, AC-008.6, AC-008.7} deps: T-017, T-018, T-014
- [x] T-022 [IMPL] API admin de planos e pacotes e função de cópia do pacote para a organização (~50 min) {AC-008.3, AC-008.4} deps: T-018, T-019, T-021
- [x] T-023 [IMPL] Lista de contas por marca e troca de marca da organização pela RPC (~35 min) {AC-008.5, AC-003.5} deps: T-020, T-006, T-021
- [x] T-024 [TEST-UI] Telas /admin/marcas (lista, formulário, domínios, planos) com Testing Library e verificação de acessibilidade (~45 min) {AC-008.1, AC-008.2}
- [x] T-025 [IMPL] Páginas de /admin/marcas e item no menu do admin (components/admin/AdminShell.tsx) (~55 min) {AC-008.1, AC-008.2} deps: T-024, T-021, T-022, T-023

### Fatia 4: Cadastro, convite e visão filtrada por marca (REQ-004, REQ-005)
- [x] T-026 [TEST-UNIT] orgPertenceAMarca e filtro do seletor de organizações; link de organização de outra marca devolve 404 sem revelar existência (~35 min) {AC-004.1, AC-004.2}
- [x] T-027 [TEST-INT] Cadastro fechado responde "por convite" sem criar nada; cadastro aberto cria organização ligada à marca com planos e cópia do pacote; convite liga a marca do convite (~50 min) {AC-005.2, AC-005.3, AC-005.4}
- [x] T-028 [TEST-UI] Login, cadastro, recuperar senha e página de erro mostram nome, logo e cor da marca do host (~35 min) {AC-005.1}
- [x] T-029 [TEST-E2E] Sessão é do host: entrar na marca A e abrir a marca B pede novo login (~50 min) {AC-004.3}
- [x] T-030 [IMPL] Guarda orgPertenceAMarca e seletor/cookie de organização ativa filtrados pela marca (~45 min) {AC-004.1, AC-004.2} deps: T-026, T-014
- [x] T-031 [IMPL] signUp, convite e ensureTenantForUser ligando brand_id, honrando cadastro_aberto e copiando o pacote (~50 min) {AC-005.2, AC-005.3, AC-005.4} deps: T-027, T-022, T-030
- [x] T-032 [IMPL] Telas públicas com a marca do host e tela "cadastro por convite" (~40 min) {AC-005.1} deps: T-028, T-015

### Fatia 5: E-mails de acesso com a marca (REQ-006, REQ-010)
- [x] T-033 [TEST-INT] Gancho de e-mail: assinatura inválida devolve 401 e não envia; reentrega com o mesmo webhook-id não duplica; sem contexto usa a marca padrão (~50 min) {AC-006.2, AC-006.5}
- [x] T-034 [TEST-UNIT] Moldes por marca (convite, confirmação, recuperação): remetente, logo, textos e link no domínio da marca; nunca nome ou domínio de outra marca (~40 min) {AC-006.1, AC-006.4}
- [x] T-035 [TEST-INT] Falha de envio: aviso "tente de novo", reenvio travado por 60 s, clique duplo sem e-mail duplicado, alerta no Sentry e linha no log de eventos (~45 min) {AC-006.3}
- [x] T-036 [TEST-INT] Teste shell do kit: variáveis GOTRUE_HOOK_SEND_EMAIL_* com padrão vazio no override, .env antigo continua válido, pnpm test:shell (~40 min) {AC-010.4}
- [x] T-037 [IMPL] brand_email_context, rota /api/hooks/auth/send-email (Standard Webhooks), montagem do e-mail por marca e envio pelo roteador existente (~60 min) {AC-006.1, AC-006.2, AC-006.4, AC-006.5} deps: T-033, T-034, T-005, T-031
- [x] T-038 [IMPL] Falha de envio visível ao usuário, trava de reenvio e alerta (~35 min) {AC-006.3} deps: T-035, T-037
- [x] T-039 [IMPL] Override do kit com as variáveis do gancho, AUTH_HOOK_SECRET em lib/env.ts e documentação da configuração no Supabase Cloud (~35 min) {AC-010.4} deps: T-036

### Fatia 6: HTTPS sob demanda controlado (REQ-007)
- [x] T-040 [TEST-INT] Rota tls-ask: sim só para domínio ativo de marca ativa com DNS na VPS; não para desconhecido, inativo, removido, marca inativa, sem DNS, sem token, com x-forwarded-for ou acima do limite por hora (~55 min) {AC-007.1, AC-007.2, AC-007.3, AC-007.4, AC-007.5}
- [x] T-041 [TEST-INT] Teste shell dos Caddyfiles: on_demand_tls com ask global, /api/internal/* bloqueado ao público, site com on_demand só via caddy-sites/marcas.caddy (opt-in) e ausente na produção (~45 min) {AC-007.6}
- [x] T-042 [IMPL] Rota /api/internal/tls-ask com token em tempo constante, conferência de DNS e limite por hora (~45 min) {AC-007.1, AC-007.2, AC-007.3, AC-007.4, AC-007.5} deps: T-040, T-014
- [x] T-043 [IMPL] Caddyfile e Caddyfile.single-server (ask global e bloqueio público), caddy-sites/marcas.caddy.exemplo e entradas em public-paths.ts (~40 min) {AC-007.6} deps: T-041, T-042

### Fatia 7: Prova pela tela e liberação segura (REQ-009, REQ-002)
- [ ] T-044 [TEST-E2E] marcas.spec.ts em ambiente fresco: três hosts mostram login com a marca certa e e-mail capturado com o link no mesmo host (~60 min) {AC-009.1}
- [ ] T-045 [CHECK-SMOKE] Implantar na homologação; criar marca de teste, subdomínio e domínio próprio de teste; configurar o gancho no Supabase Cloud e o Resend com o dono (~40 min) deps: T-025, T-032, T-038, T-039, T-043
- [ ] T-046 [TEST-INT] Sondas na homologação (tests/infra/vps): três endereços com marcas distintas e e-mail recebido, domínio removido volta à marca padrão sem certificado, evidências em docs/solucao-crm/evidencias/002-marcas/, chave off e recriar o app em menos de 2 minutos (~50 min) {AC-002.5, AC-009.1, AC-009.2, AC-009.4} deps: T-044, T-045
- [ ] T-047 [CHECK-SMOKE] Implantar em produção só com a marca padrão (HTTPS sob demanda desligado) pelo clique do dono (~25 min) deps: T-046
- [ ] T-048 [TEST-INT] Sonda em produção: app.corretora.io responde / = 200 e /app = 307 com a aparência de antes (~35 min) {AC-009.3} deps: T-047

### Fechamento
- [ ] T-049 [DOCS] Runbook das marcas: criar marca e domínio, ligar o HTTPS sob demanda, configurar o gancho, desligar com MARCAS_POR_DOMINIO=off (~20 min) deps: T-046
- [ ] T-050 [REFACTOR] Limpeza com pnpm typecheck, lint, test:unit, test:db e test:shell verdes e e2e disparado à mão (~30 min) deps: T-048, T-049

## Estimativa

| Tarefa | Tipo | Descrição | Status | Estimativa |
| :-- | :-- | :-- | :-: | --: |
| T-001 | TEST-INT | Invariante de migração: instalação nova e atualização com dados, idempotência, marca padrão com campos nulos que herda de platform_branding, organizações ligadas, imagem anterior segue funcionando | ⬜ | 45min |
| T-002 | TEST-INT | Invariante de isolamento: 2 marcas, 2 organizações, 1 e-mail nas duas; organização comum não lê domínios nem tabelas de parceiro; admin do parceiro só alcança o parceiro dele; funções novas sem EXECUTE para PUBLIC e anon | ⬜ | 50min |
| T-003 | TEST-INT | Invariante da troca de marca de uma organização: só admin da plataforma, com linha de auditoria | ⬜ | 40min |
| T-004 | SETUP | Reservar o número da migration com pnpm checar:colisao-de-migration e criar o arquivo com cabeçalho -- manifest: | ⬜ | 10min |
| T-005 | IMPL | Migration aditiva + apêndice idempotente no baseline.sql: partners, partner_members, brands, brand_domains, brand_plans, vertical_packs, brand_email_context, auth_hook_deliveries, organizations.brand_id, funções e políticas RLS | ⬜ | 1h |
| T-006 | IMPL | RPC fn_set_org_brand (security definer, revogada de PUBLIC e anon) e ações novas em lib/audit/actions.ts | ⬜ | 35min |
| T-007 | CHECK-SMOKE | pnpm test:db verde em instalação nova e em atualização | ⬜ | 15min |
| T-008 | TEST-UNIT | Resolvedor host → marca: domínio ativo de marca ativa, host desconhecido, domínio removido, desativado ou de marca inativa | ⬜ | 30min |
| T-009 | TEST-UNIT | Degradação sem lançar (banco lento ou fora, cache corrompido) com motivo registrado; cache de 60 s e invalidação no CRUD | ⬜ | 35min |
| T-010 | TEST-UNIT | MARCAS_POR_DOMINIO=off devolve a marca padrão sem consultar a tabela de domínios | ⬜ | 20min |
| T-011 | TEST-UNIT | Precedência organização > marca > plataforma > padrão; permite_personalizacao = false; antes do login só a marca; PDF de LGPD sem marca | ⬜ | 35min |
| T-012 | TEST-UNIT | Desempenho do resolvedor (≤ 30 ms p95 com cache quente, ≤ 200 ms frio) e contraste de cor de marca pela régua existente | ⬜ | 30min |
| T-013 | TEST-UNIT | Catraca de marca (tests/unit/branding.test.ts) passa a conhecer a camada de marca | ⬜ | 30min |
| T-014 | IMPL | lib/branding/marca-do-host.ts, repositório lib/brands com cliente admin, cache em memória, flag e variáveis em lib/env.ts e .env.example | ⬜ | 50min |
| T-015 | IMPL | Camada de marca em resolve.ts e saida.ts, header x-brand-host no proxy.ts, layout raiz e layout público usando a marca do host | ⬜ | 50min |
| T-016 | CHECK-SMOKE | pnpm typecheck, pnpm lint e pnpm test:unit verdes até aqui | ⬜ | 15min |
| T-017 | TEST-INT | Rotas admin de marcas: criar, editar, desativar; 403 para quem não é admin da plataforma; auditoria e requireSupportWrite em toda mutação | ⬜ | 50min |
| T-018 | TEST-INT | Domínios: duplicado devolve 409 e repetir o clique não duplica; planos por marca sem acionar cobrança | ⬜ | 40min |
| T-019 | TEST-INT | Pacotes verticais: cópia na criação da organização e independência nos dois sentidos | ⬜ | 45min |
| T-020 | TEST-INT | Lista de todas as contas com a marca de cada uma e acesso de suporte (impersonar) com guarda de efeito e auditoria | ⬜ | 40min |
| T-021 | IMPL | API admin de marcas e domínios (app/api/v1/admin/brands) com invalidação do cache | ⬜ | 55min |
| T-022 | IMPL | API admin de planos e pacotes e função de cópia do pacote para a organização | ⬜ | 50min |
| T-023 | IMPL | Lista de contas por marca e troca de marca da organização pela RPC | ⬜ | 35min |
| T-024 | TEST-UI | Telas /admin/marcas (lista, formulário, domínios, planos) com Testing Library e verificação de acessibilidade | ⬜ | 45min |
| T-025 | IMPL | Páginas de /admin/marcas e item no menu do admin (components/admin/AdminShell.tsx) | ⬜ | 55min |
| T-026 | TEST-UNIT | orgPertenceAMarca e filtro do seletor de organizações; link de organização de outra marca devolve 404 sem revelar existência | ⬜ | 35min |
| T-027 | TEST-INT | Cadastro fechado responde "por convite" sem criar nada; cadastro aberto cria organização ligada à marca com planos e cópia do pacote; convite liga a marca do convite | ⬜ | 50min |
| T-028 | TEST-UI | Login, cadastro, recuperar senha e página de erro mostram nome, logo e cor da marca do host | ⬜ | 35min |
| T-029 | TEST-E2E | Sessão é do host: entrar na marca A e abrir a marca B pede novo login | ⬜ | 50min |
| T-030 | IMPL | Guarda orgPertenceAMarca e seletor/cookie de organização ativa filtrados pela marca | ⬜ | 45min |
| T-031 | IMPL | signUp, convite e ensureTenantForUser ligando brand_id, honrando cadastro_aberto e copiando o pacote | ⬜ | 50min |
| T-032 | IMPL | Telas públicas com a marca do host e tela "cadastro por convite" | ⬜ | 40min |
| T-033 | TEST-INT | Gancho de e-mail: assinatura inválida devolve 401 e não envia; reentrega com o mesmo webhook-id não duplica; sem contexto usa a marca padrão | ⬜ | 50min |
| T-034 | TEST-UNIT | Moldes por marca (convite, confirmação, recuperação): remetente, logo, textos e link no domínio da marca; nunca nome ou domínio de outra marca | ⬜ | 40min |
| T-035 | TEST-INT | Falha de envio: aviso "tente de novo", reenvio travado por 60 s, clique duplo sem e-mail duplicado, alerta no Sentry e linha no log de eventos | ⬜ | 45min |
| T-036 | TEST-INT | Teste shell do kit: variáveis GOTRUE_HOOK_SEND_EMAIL_* com padrão vazio no override, .env antigo continua válido, pnpm test:shell | ⬜ | 40min |
| T-037 | IMPL | brand_email_context, rota /api/hooks/auth/send-email (Standard Webhooks), montagem do e-mail por marca e envio pelo roteador existente | ⬜ | 1h |
| T-038 | IMPL | Falha de envio visível ao usuário, trava de reenvio e alerta | ⬜ | 35min |
| T-039 | IMPL | Override do kit com as variáveis do gancho, AUTH_HOOK_SECRET em lib/env.ts e documentação da configuração no Supabase Cloud | ⬜ | 35min |
| T-040 | TEST-INT | Rota tls-ask: sim só para domínio ativo de marca ativa com DNS na VPS; não para desconhecido, inativo, removido, marca inativa, sem DNS, sem token, com x-forwarded-for ou acima do limite por hora | ⬜ | 55min |
| T-041 | TEST-INT | Teste shell dos Caddyfiles: on_demand_tls com ask global, /api/internal/* bloqueado ao público, site com on_demand só via caddy-sites/marcas.caddy (opt-in) e ausente na produção | ⬜ | 45min |
| T-042 | IMPL | Rota /api/internal/tls-ask com token em tempo constante, conferência de DNS e limite por hora | ⬜ | 45min |
| T-043 | IMPL | Caddyfile e Caddyfile.single-server (ask global e bloqueio público), caddy-sites/marcas.caddy.exemplo e entradas em public-paths.ts | ⬜ | 40min |
| T-044 | TEST-E2E | marcas.spec.ts em ambiente fresco: três hosts mostram login com a marca certa e e-mail capturado com o link no mesmo host | ⬜ | 1h |
| T-045 | CHECK-SMOKE | Implantar na homologação; criar marca de teste, subdomínio e domínio próprio de teste; configurar o gancho no Supabase Cloud e o Resend com o dono | ⬜ | 40min |
| T-046 | TEST-INT | Sondas na homologação (tests/infra/vps): três endereços com marcas distintas e e-mail recebido, domínio removido volta à marca padrão sem certificado, evidências em docs/solucao-crm/evidencias/002-marcas/, chave off e recriar o app em menos de 2 minutos | ⬜ | 50min |
| T-047 | CHECK-SMOKE | Implantar em produção só com a marca padrão (HTTPS sob demanda desligado) pelo clique do dono | ⬜ | 25min |
| T-048 | TEST-INT | Sonda em produção: app.corretora.io responde / = 200 e /app = 307 com a aparência de antes | ⬜ | 35min |
| T-049 | DOCS | Runbook das marcas: criar marca e domínio, ligar o HTTPS sob demanda, configurar o gancho, desligar com MARCAS_POR_DOMINIO=off | ⬜ | 20min |
| T-050 | REFACTOR | Limpeza com pnpm typecheck, lint, test:unit, test:db e test:shell verdes e e2e disparado à mão | ⬜ | 30min |
| **TOTALIZADOR GERAL** | | **50 tarefas (0 concluídas, 0%)** | | **33h 40min** (restante: 33h 40min) |
