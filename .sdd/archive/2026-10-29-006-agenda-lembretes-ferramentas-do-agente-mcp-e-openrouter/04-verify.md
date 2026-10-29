# Verificação: Agenda, lembretes, ferramentas do agente, MCP e OpenRouter

> Mudança 006-agenda-lembretes-ferramentas-do-agente-mcp-e-openrouter · porte L · 2026-10-29
> Auditoria sobre a branch chore/sp6-fechamento (a partir da main 5c4a3b6b7, já em produção e na hml). Sem evidência executada, o item é "não verificado".

## Evidências

- CI da main no commit 5c4a3b6b7 (informado pelo dono da sessão, não reexecutado aqui): verify, invariants-majors (17), build-and-size e imagens-ok verdes. É a prova de suíte completa, em Linux.
- "sdd run typecheck" falhou por ambiente (não existe pnpm neste Windows). Rodado direto: npx tsc --noEmit -p tsconfig.typecheck.json → exit 0, zero erros.
- "sdd run lint" idem. npx eslint . → 1 erro, mas em .restauracao/2026-10-28_23-46-52-27__agente-006-na-homologacao.spec.ts (pasta ignorada pelo git, backup do editor, fora do diff). Com --ignore-pattern da pasta .restauracao → 0 erros, 660 avisos.
- "sdd run test" idem. Testes novos ou alterados pela 006 (51 arquivos em app, lib, components e tests/unit), com npx vitest run → 51 arquivos passaram, 690 testes passaram, 2 pulados, 0 falhas.
- Suíte completa local (npx vitest run, excluindo .wt-release e .restauracao) → NÃO concluída: parei o processo depois de cerca de 40 min (arquivos levando 12 a 21 min, máquina lenta). Até ali, 38 arquivos vermelhos. Amostrei 5 (agent-version-columns-drift, confianca-do-handoff, rascunho-superado, nome-da-agenda, jev-nunca-cala): as falhas são separador de caminho do Windows (barra invertida contra barra) e timeout de 15 s sob carga, não regressão de comportamento. Os outros 33 (git/bash dos guardas de release, PDF de LGPD, população do próximo NNNN etc.) não foram examinados; a evidência de que passam é o CI Linux da main. Local: "não verificado".
- run e2e: não executado. run coverage: não configurado (quality.coverageMin nulo). run security (pnpm audit): não executado (sem pnpm).
- Jornada pela tela na hml (informada; evidence/006-agente/hml-2026-10-29/, ainda não versionada): 3 defeitos achados, corrigidos pelo PR #28 e repetidos (reprovado antes, aprovado depois). Specs de jornada no working tree: tests/journeys/agente-006-na-homologacao.spec.ts e agente-006-pos-correcao.spec.ts (não rodei).
- Produção, deploy de 29/10/2026 do commit 5c4a3b6b7 (informado): / 200, /app 307, login do dono entra e as 4 telas novas abrem sem erro.

## Rastreabilidade

"sdd trace" marca 52 de 52 critérios com tarefa e teste. Leitura honesta: a coluna de testes está inflada. O trace casa pelo texto do ID, e os IDs AC-00N.M se repetem nas mudanças 002, 004, 007 e 008, então um critério da 006 aparece ligado a testes de marcas, infra e inbox que não são dele; entram também cópias de .restauracao/. Por isso conferi os testes próprios da 006 (51 arquivos, acima), mas não li um a um os 52 critérios. Tabela compacta (nº de arquivos citados pelo trace; a lista completa vem de "sdd trace"):

| Critério | Tarefas | Testes citados | Status |
| :-- | :-- | :-- | :-: |
| AC-001.1 | T-006, T-009 | 8 arquivos | ✅ |
| AC-001.2 | T-006, T-009 | 8 arquivos | ✅ |
| AC-001.3 | T-006, T-009 | 7 arquivos | ✅ |
| AC-001.4 | T-006, T-009 | 7 arquivos | ✅ |
| AC-001.5 | T-006, T-009 | 7 arquivos | ✅ |
| AC-001.6 | T-007, T-008 | 7 arquivos | ✅ |
| AC-001.7 | T-007, T-008 | 5 arquivos | ✅ |
| AC-002.1 | T-004, T-005, T-008 | 9 arquivos | ✅ |
| AC-002.2 | T-004, T-005, T-008 | 9 arquivos | ✅ |
| AC-002.3 | T-004, T-005, T-008 | 7 arquivos | ✅ |
| AC-002.4 | T-004, T-005 | 10 arquivos | ✅ |
| AC-003.1 | T-010, T-012 | 15 arquivos | ✅ |
| AC-003.2 | T-014, T-016 | 9 arquivos | ✅ |
| AC-003.3 | T-014 | 8 arquivos | ✅ |
| AC-003.4 | T-015, T-016 | 11 arquivos | ✅ |
| AC-003.5 | T-015, T-016 | 3 arquivos | ✅ |
| AC-003.6 | T-015, T-016 | 2 arquivos | ✅ |
| AC-003.7 | T-014 | 1 arquivos | ✅ |
| AC-004.1 | T-019, T-020 | 16 arquivos | ✅ |
| AC-004.2 | T-019, T-020 | 10 arquivos | ✅ |
| AC-004.3 | T-019, T-020 | 5 arquivos | ✅ |
| AC-004.4 | T-021, T-022 | 10 arquivos | ✅ |
| AC-004.5 | T-019, T-020 | 2 arquivos | ✅ |
| AC-004.6 | T-017, T-018 | 6 arquivos | ✅ |
| AC-005.1 | T-023 | 14 arquivos | ✅ |
| AC-005.2 | T-023 | 11 arquivos | ✅ |
| AC-005.3 | T-024, T-025 | 18 arquivos | ✅ |
| AC-005.4 | T-023 | 4 arquivos | ✅ |
| AC-006.1 | T-026, T-027 | 7 arquivos | ✅ |
| AC-006.2 | T-026, T-027 | 9 arquivos | ✅ |
| AC-006.3 | T-026, T-027 | 9 arquivos | ✅ |
| AC-006.4 | T-026, T-027 | 6 arquivos | ✅ |
| AC-006.5 | T-026, T-027 | 3 arquivos | ✅ |
| AC-006.6 | T-026, T-027 | 2 arquivos | ✅ |
| AC-007.1 | T-003, T-028, T-029 | 7 arquivos | ✅ |
| AC-007.2 | T-028, T-029, T-036, T-037 | 11 arquivos | ✅ |
| AC-007.3 | T-032, T-033 | 11 arquivos | ✅ |
| AC-007.4 | T-032, T-033, T-036, T-037 | 11 arquivos | ✅ |
| AC-007.5 | T-030, T-031 | 6 arquivos | ✅ |
| AC-007.6 | T-030, T-031 | 3 arquivos | ✅ |
| AC-007.7 | T-030, T-031 | 4 arquivos | ✅ |
| AC-007.8 | T-028, T-029 | 3 arquivos | ✅ |
| AC-007.9 | T-010, T-012, T-028, T-029 | 4 arquivos | ✅ |
| AC-008.1 | T-034, T-035 | 9 arquivos | ✅ |
| AC-008.2 | T-034, T-035 | 5 arquivos | ✅ |
| AC-008.3 | T-034, T-035 | 9 arquivos | ✅ |
| AC-008.4 | T-010, T-012, T-034, T-035 | 12 arquivos | ✅ |
| AC-009.1 | T-001, T-002 | 1 arquivos | ✅ |
| AC-009.2 | T-010, T-012 | 3 arquivos | ✅ |
| AC-009.3 | T-040 | 6 arquivos | ✅ |
| AC-009.4 | T-041 | 1 arquivos | ✅ |
| AC-009.5 | T-038, T-039 | 2 arquivos | ✅ |

## Revisão de código

Revisão por leitura dirigida (rotas, repositório MCP, migration), não linha a linha do diff de 691 arquivos.
- Sem achado bloqueante.
- Cadastro, atualização e liga/desliga de ferramentas seguem o mesmo molde: Zod estrito, requireSupportWrite antes do efeito, papel via exigirAdminDeServidoresMcp, auditoria, organização da sessão.
- Higiene: .restauracao/ (backups) está fora do git, mas contamina trace e lint se não for excluída; o gate local chama pnpm, que não existe nesta máquina, então "sdd run" não funciona aqui.

## Segurança

- Segredos: chave de IA e credencial de MCP cifradas; a API devolve no máximo os 4 últimos caracteres (chave_last4). Na migration 0724 o authenticated só recebe grant select por coluna em mcp_servidores_externos e mcp_acoes_pendentes, sem a coluna cifrada nem os argumentos (só argumentos_hash). Verificado por leitura.
- RLS: as 3 tabelas novas (mcp_servidores_externos, mcp_acoes_pendentes, ai_falhas_de_ferramenta) têm RLS ligada, política tenant_isolation e revoke all de anon e authenticated; a função fn_arma_teto_ao_publicar_agente é security definer com revoke de public, anon e authenticated. Migration 0724 presente no baseline. O isolamento entre duas organizações está em tests/invariants/agente-padroes-e-mcp-multi-servidor.test.ts, que NÃO foi executado aqui (precisa de Postgres); a prova é o job invariants do CI.
- Autorização: as rotas mutantes de mcp-servidores, mcp-acoes e agents automatico declaram requireSupportWrite; o cadastro de servidor exige admin da instalação (ou admin da organização só com MCP_EXTERNO_ADMIN_DA_ORG, padrão desligado). organization_id vem da sessão. Conferi por leitura as rotas POST de mcp-servidores e atualizar-ferramentas; as demais, por contagem de grep (requireSupportWrite, Zod, papel, auditoria presentes).
- Dado externo: o retorno do servidor entra no envelope DADO EXTERNO com fechamento FIM DO DADO EXTERNO, limite de 8.000 caracteres, credencial trocada se repetida (resultado-como-dado.test.ts e seguranca-do-retorno.test.ts passaram). Descrição de ferramenta saneada; atualizar ferramentas é ação explícita do admin e revoga liberação de escrita alterada.
- SSRF: lib/net/destino-seguro.ts compartilhado entre provedor e MCP (testes passaram).
- Auditoria: mcp.server_added, mcp.tools_refreshed e mcp.action_* gravam só contagens, host e slug; sem credencial nem texto do servidor.
- Dependências novas: não identifiquei; pnpm audit não rodou. console.log em código novo: nenhum. Gitleaks: 3 achados de fixture no .gitleaksignore com impressão digital exata e cerca contra crescimento.
- Não verificado: servidor MCP real que mente sobre ser somente leitura; varredura de segredo em logs em execução (só testes).

## Desvios de escopo

- Pasta e título falam de agenda e lembretes, mas a agenda foi para a 007 (registrado no PRD). A 006 entregou provedores, agente, teto, ferramentas e MCP. É nome desatualizado, não desvio.
- Ajustes de PRD por decisão do dono em 29/10: AC-003.1 (nasce sem versão publicada, no modo que só redige) e AC-003.6 (só administrador).
- Fora do escopo no working tree: .sdd/bin/lib.mjs (arquivo de estado do gate renomeado para .gate-state-repo.json). Não é da 006; não deve ir no mesmo commit sem decisão do dono.
- Limitações conhecidas, aceitas e não corrigidas: (1) aviso_modelo_fraco (AC-001.6) existe no motor mas não chega à tela; (3) a "Chave de acesso" é obrigatória no cadastro de MCP, mesmo para servidor sem autenticação. O defeito 2 (frase do teto) e o contraste escuro foram corrigidos pelo PR #28.

## Specs vivas

Escritas em specs/ desta mudança, todas ADICIONADOS (não existe spec viva anterior dessas capacidades em .sdd/specs/; a Central ganhou só um cartão novo, coberto por mcp-servidores-externos, então não modifiquei inbox):
- agente-provedores-e-destino-seguro.md
- agente-padroes-seguros-e-teto-de-custo.md
- agente-transferencia-e-ferramentas.md
- mcp-servidores-externos.md

## Ressalvas (NÃO PROVADO)

- Ponta a ponta com WhatsApp e celular reais.
- Aprovação de ação de escrita pela Central com servidor MCP real (só testes automatizados).
- Publicar agente (exige canal conectado).
- Teto com gasto real e selo "estimado" na tela.
- Papel menor que admin pela tela (só a rota, por teste).
- Espanhol sem revisão por falante nativo.
- Resumos de handoff gravados em português.
- Corrida em ai_agents.config (escrita concorrente).
- Suíte completa local e invariantes (Postgres) não executados nesta máquina.
- Evidência da hml ainda fora do git.

## Parecer

APROVADO com ressalvas: typecheck limpo, lint sem erro no código versionado, 51 arquivos de teste da 006 (690 testes) verdes, CI Linux verde na main e segurança lida sem achado bloqueante; as lacunas acima ficam declaradas e nenhuma foi tratada como aprovada.
