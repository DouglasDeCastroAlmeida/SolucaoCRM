# Tarefas: Agente de IA: provedores, ferramentas e MCP

> Mudança `006-agenda-lembretes-ferramentas-do-agente-mcp-e-openrouter` · porte L · 2026-10-27
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

### Fatia 1: Prova em serviços reais e decisão de segurança, antes de qualquer código (REQ-009)
- [x] T-001 [TEST-INT] Sonda real (credenciais do dono em C:\Users\Douglas\.secrets\): chat com chamada de ferramenta pelo OpenRouter (modelo gratuito) e pelo provedor com endereço próprio, e um servidor MCP de teste respondendo tools/list e tools/call; grava evidência (~60 min) {AC-009.1} **Parcial: OpenRouter provado; provedor próprio e servidor MCP real não provados (ver sonda-fatia-1.md).**
- [x] T-002 [DOCS] Registrar o resultado em docs/solucao-crm/evidencias/006-agente/ e decidir: passou segue; falhou para a esteira e volta ao design (~20 min) {AC-009.1} deps: T-001
- [x] T-003 [DOCS] Obter a confirmação do dono sobre a ADR-004 (abrir o cadastro de servidor MCP ao admin da organização atrás da chave MCP_EXTERNO_ADMIN_DA_ORG) e registrar a resposta; sem confirmação, a T-035 não abre o cadastro (~10 min) {AC-007.1} deps: T-002

### Fatia 2: Destino seguro compartilhado e provedores (REQ-001, REQ-002)
- [x] T-004 [TEST-UNIT] lib/net/destino-seguro: recusa loopback, link-local, metadata, RFC1918, CGNAT, multicast e reservadas; http recusado; IP resolvido fixado na conexão; redirecionamento para destino não validado não é seguido (~50 min) {AC-002.1, AC-002.2, AC-002.3, AC-002.4} deps: T-002
- [x] T-005 [IMPL] lib/net/destino-seguro.ts; se a mudança 005 já tiver criado o núcleo, importar e estender em vez de duplicar (~50 min) {AC-002.1, AC-002.2, AC-002.3, AC-002.4} deps: T-004
- [x] T-006 [TEST-UNIT] Caracterização do provedor OpenRouter e do endereço próprio: escolher o provedor com o endereço já preenchido ou informado, testar com chamada real simulada e causa clara, chave só com 4 últimos caracteres, agente redige e chama ferramentas pelo caminho dos demais (~50 min) {AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5} deps: T-002
- [x] T-007 [TEST-UNIT] Aviso de modelo fraco no teste da chave e conversa vai à fila humana com aviso na Central quando o provedor falha (chave revogada, saldo zerado) (~45 min) {AC-001.6, AC-001.7} deps: T-002 **Parcial: AC-001.6 pronto; AC-001.7 tem o vocabulário (motivo e kind em TypeScript e nos CHECKs da migration 0724, teste tests/unit/agente-006-vocabulario-novo.test.ts), falta o comportamento em runtime: teste e emissão do desvio do provedor para a fila humana.**
- [x] T-008 [IMPL] Provedor com endereço próprio passa a usar lib/net/destino-seguro (https obrigatório, IP fixado), aviso de modelo fraco, motivo de transferência provedor_indisponivel e item da Central (~60 min) {AC-001.6, AC-001.7, AC-002.1, AC-002.2, AC-002.3} deps: T-005, T-007 **Parcial: já entrou IP fixado, https obrigatório, limites de prazo/tamanho e aviso de modelo fraco (AC-001.6, AC-002.1 a 002.3); falta AC-001.7 em runtime (emitir o motivo provedor_indisponivel e abrir o item da Central); o vocabulário e a migration 0724 já existem.**
- [x] T-009 [IMPL] Corrigir o que a caracterização de T-006 revelar de diferente do esperado, sem mudar comportamento já correto (~45 min) {AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5} deps: T-006 **Sem correção: a caracterização passou de primeira. Divergência anotada: o "Testar" faz GET /models, não uma chamada de geração (AC-001.3 diz "chamada real ao modelo").**

### Fatia 3: Banco aditivo e isolamento (REQ-003, REQ-007, REQ-008, REQ-009)
- [x] T-010 [TEST-INT] Invariantes: padrões novos (agente assistido, orçamento armado) valem só para linhas novas e as existentes ficam intactas; tabelas novas isoladas entre 2 organizações; funções novas sem EXECUTE para PUBLIC e anon; migração do servidor MCP atual é idempotente e não apaga o formato antigo (~60 min) {AC-003.1, AC-007.9, AC-008.4, AC-009.2} deps: T-002
- [x] T-011 [SETUP] Reservar o número da migration com pnpm checar:colisao-de-migration e criar o arquivo com cabeçalho -- manifest: (~10 min) deps: T-002
- [x] T-012 [IMPL] Migration aditiva + apêndice idempotente no baseline.sql: padrão assisted, orçamento armado para linhas novas e trigger do orçamento padrão, mcp_servidores_externos com cópia do servidor atual, mcp_acoes_pendentes, ai_falhas_de_ferramenta, kinds novos da Central (~60 min) {AC-003.1, AC-007.9, AC-008.4, AC-009.2} deps: T-010, T-011
- [x] T-013 [CHECK-SMOKE] pnpm test:db verde em instalação nova e em atualização (~20 min) deps: T-012 Provado pelo CI do PR #23 (invariants-majors verde, instalação nova e atualização, depois de corrigir o baseline e 4 invariantes que dependiam do padrão automatico).

### Fatia 4: Agente desligado de fábrica e automático com confirmação (REQ-003)
- [x] T-014 [TEST-UNIT] Caracterização: modo assistido redige e fica pendente, só sai após aprovação, texto mudado exige nova aprovação, desligar para o envio e preserva as respostas pendentes (~45 min) {AC-003.2, AC-003.3, AC-003.7}
- [x] T-015 [TEST-UNIT] Rota de confirmação do automático: exige confirmar_automatico, só admin, auditoria com quem, quando e qual agente, e diálogo na tela explicando o custo na chave da pessoa (~50 min) {AC-003.4, AC-003.5, AC-003.6}
- [x] T-016 [IMPL] Onboarding e primeira publicação nascem assisted; rota /ai/agents/[id]/automatico, diálogo em AgentOperation e PATCH que recusa trocar para automático sem a confirmação (~60 min) {AC-003.2, AC-003.4, AC-003.5, AC-003.6} deps: T-013, T-014, T-015

### Fatia 5: Teto de custo que protege (REQ-004)
- [x] T-017 [TEST-UNIT] Preço estimado para modelo sem preço: conservador, sempre marcado como estimado, nunca inventa preço real (~35 min) {AC-004.6}
- [x] T-018 [IMPL] lib/ai/orcamento/preco-estimado.ts usado no cálculo de custo e no gate do orçamento (~45 min) {AC-004.6} deps: T-017
- [x] T-019 [TEST-INT] Orçamento: existe teto ao ativar o agente, aviso em 80% na Central e por e-mail uma vez no período, em 100% o agente para e a conversa vai à fila humana com aviso, novo período zera o contador (~55 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.5} deps: T-013
- [x] T-020 [IMPL] Orçamento padrão ao publicar o primeiro agente, e-mail de 80% pela marca, banner "sem teto" para organizações antigas (~55 min) {AC-004.1, AC-004.2, AC-004.3, AC-004.5} deps: T-018, T-019
- [x] T-021 [TEST-UI] Tela de uso: tokens, custo estimado e teto do período, por agente e total, com "estimado" quando o provedor não informa o custo (~40 min) {AC-004.4}
- [x] T-022 [IMPL] Tokens e custo por agente em app/app/ai/usage (~45 min) {AC-004.4} deps: T-021, T-018

### Fatia 6: Transferência para humano e ferramentas do agente (REQ-005, REQ-006)
- [x] T-023 [TEST-UNIT] Caracterização do handoff: cliente pede uma pessoa, agente sem segurança transfere, a pessoa que assume vê histórico e motivo (~40 min) {AC-005.1, AC-005.2, AC-005.4}
- [x] T-024 [TEST-UNIT] Contador de erros de ferramenta: dois seguidos na mesma conversa transferem com motivo erro_de_ferramenta, um sucesso reinicia a contagem (~40 min) {AC-005.3}
- [x] T-025 [IMPL] lib/ai/handoff/falhas-de-ferramenta.ts, stopWhen em run-model-call, motivo novo em HandoffReason e MOTIVOS_DA_PASSAGEM e texto da Central (~60 min) {AC-005.3} deps: T-013, T-024
- [x] T-026 [TEST-UNIT] Ferramentas: marcar horário e mover etapa sem efeito duplicado na repetição, criar tarefa vinculada ao contato com idempotência, buscar na base citando a fonte e só da organização, argumentos inválidos devolvem erro e não gravam, nenhuma atua fora da organização (~60 min) {AC-006.1, AC-006.2, AC-006.3, AC-006.4, AC-006.5, AC-006.6}
- [x] T-027 [IMPL] lib/mcp/tools/tarefas.ts (crm_create_task com idempotencyKey), registro nos ids de ferramenta e os ajustes que T-026 revelar (~60 min) {AC-006.1, AC-006.2, AC-006.3, AC-006.4, AC-006.5, AC-006.6} deps: T-013, T-026

### Fatia 7: MCP externo com vários servidores (REQ-007, REQ-008)
- [x] T-028 [TEST-UNIT] Repositório de servidores: cadastrar valida o destino, testa e lista as ferramentas, todas nascem desligadas e se ligam por agente, o agente só vê as ligadas de qualquer servidor, id no formato antigo continua apontando para o servidor migrado (~55 min) {AC-007.1, AC-007.2, AC-007.8, AC-007.9} deps: T-005
- [x] T-029 [IMPL] repositorio.ts, ids novos e antigos, VALID_TOOL_IDS aceitando os dois, lista de ferramentas guardada com expiração de 10 minutos (~60 min) {AC-007.1, AC-007.2, AC-007.8, AC-007.9} deps: T-013, T-028 **Nota (AC-007.9): a migration 0724 copia o servidor com ferramentas = [] e NAO mantem ligadas as ferramentas em uso; esse comportamento fica aqui: id no formato antigo continua valido e aponta para o servidor padrao, e o repositorio deve resolver as ferramentas do servidor migrado ao primeiro uso.**
- [x] T-030 [TEST-UNIT] Retorno do servidor como dado externo, com limite de tamanho no corpo e no resultado, prazo de 10 segundos com erro claro, auditoria com servidor, ferramenta, argumentos e resultado resumidos e sem a credencial (~50 min) {AC-007.5, AC-007.6, AC-007.7}
- [x] T-031 [IMPL] chamada.ts com destino seguro e IP fixado, embrulho em resultado-como-dado.ts, limites e prazo (~55 min) {AC-007.5, AC-007.6, AC-007.7} deps: T-005, T-030
- [ ] T-032 [TEST-UNIT] Ação de escrita: no modo assistido não executa e vira ação pendente com item na Central, aprovar executa com os argumentos guardados, no automático só roda sem aprovação se o admin marcou a ferramenta, leitura sempre roda (~55 min) {AC-007.3, AC-007.4}
- [ ] T-033 [IMPL] aprovacao.ts, rota /api/v1/mcp-acoes/[id] e item da Central (~60 min) {AC-007.3, AC-007.4} deps: T-029, T-032
- [ ] T-034 [TEST-UNIT] Rotas de servidores: Zod, papel, requireSupportWrite antes do efeito, auditoria, isolamento entre organizações, credencial nunca em resposta, log ou auditoria (~55 min) {AC-008.1, AC-008.2, AC-008.3, AC-008.4}
- [ ] T-035 [IMPL] Rotas /api/v1/mcp-servidores e chave MCP_EXTERNO_ADMIN_DA_ORG em lib/env.ts e .env.example (cadastro pelo admin da organização só se a T-003 foi confirmada) e atualização da cerca do platform admin (~60 min) {AC-008.1, AC-008.2, AC-008.3, AC-008.4} deps: T-029, T-031, T-034, T-003
- [ ] T-036 [TEST-UI] Tela de servidores e ferramentas por agente: cadastrar, listar ferramentas desligadas, ligar por agente, marcar "pode rodar sem aprovação" com aviso (~45 min) {AC-007.2, AC-007.4}
- [ ] T-037 [IMPL] Tela em app/app/settings/servidor-mcp-externo e seleção por agente (~60 min) {AC-007.2, AC-007.4} deps: T-035, T-036

### Fechamento
- [ ] T-038 [TEST-UNIT] Textos novos em pt-BR, en e es pelo dicionário e varredura de marca sem nome ou cor fixos (~30 min) {AC-009.5}
- [ ] T-039 [IMPL] Entradas do dicionário com a chave en/es até a varredura passar (~30 min) {AC-009.5} deps: T-038, T-016, T-022, T-037
- [ ] T-040 [TEST-E2E] Jornada pela tela na homologação com serviços reais: conectar chave, testar, ligar em aprovar antes de enviar, aprovar uma resposta, estourar o teto, cadastrar MCP, ligar uma ferramenta (~60 min) {AC-009.3} deps: T-016, T-020, T-037
- [ ] T-041 [TEST-E2E] Sonda de produção sem agente ligado e sem MCP: resultado igual ao de antes e nenhum provedor novo chamado (~30 min) {AC-009.4}
- [ ] T-042 [DOCS] Runbook e roteiro do dono: chave do OpenRouter, endereço próprio, teto de custo, modos do agente, cadastro de servidor MCP e a chave MCP_EXTERNO_ADMIN_DA_ORG (~40 min) deps: T-040
- [ ] T-043 [CHECK-SMOKE] Implantar na homologação e rodar a jornada (~30 min) deps: T-040
- [ ] T-044 [CHECK-SMOKE] Implantar em produção com padrões novos só para linhas novas e rodar a sonda (~30 min) deps: T-043, T-041
- [ ] T-045 [REFACTOR] Limpeza com testes verdes (~25 min) deps: T-044

## Estimativa

<!-- Gerada por `sdd estimate`. Sempre com a linha TOTALIZADOR GERAL. -->
