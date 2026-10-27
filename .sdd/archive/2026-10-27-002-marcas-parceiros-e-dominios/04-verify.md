# Verificação: Marcas, parceiros e domínios

> Mudança `002-marcas-parceiros-e-dominios` · porte L · 2026-10-27
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.

## Evidências

- `node .sdd/bin/sdd.mjs trace` → 50 critérios (AC-001.1 a AC-010.5), todos ✅ com tarefa e teste.
- `03-tasks.md` → 50/50 tarefas `[x]`.
- `vitest run tests/unit/marcas-tls-ask.test.ts` (auditor) → 9 passed.
- `vitest run lib/auth/gancho-de-email/assinatura.test.ts` (auditor) → 7 passed.
- CI dos PRs #7 a #15 (typecheck, lint, test:unit, cercas, kit bash, test:db instalação/atualização/isolamento RLS, build-and-size, imagens-ok) → verde. Este PC (6 GB) não roda typecheck nem a suíte completa; vale a evidência do CI.
- E2E manual na `main`, run 40432567950 → sucesso.
- Deploy em produção, run 40432290120 (SHA b438011) → sucesso; `/` = 200, `/app` = 307, 1 marca padrão, migrations 0717/0718 aplicadas.
- Homologação (`docs/solucao-crm/evidencias/002-marcas/`): três endereços com a marca certa; e-mail em nome da marca; gancho sem assinatura 401; desligamento em 15 s; endereço sem marca sem certificado.

## Rastreabilidade

Saída completa de `node .sdd/bin/sdd.mjs trace 002-marcas-parceiros-e-dominios`: 50 de 50 critérios ✅. Resumo por requisito:

| Requisito | Critérios | Tarefas | Testes principais |
| :-- | :-- | :-- | :-- |
| REQ-001 | AC-001.1 a .5 | T-008, T-009, T-014 | marcas-resolucao, sondas.sh, mover-vava.test.sh |
| REQ-002 | AC-002.1 a .5 | T-001, T-005, T-010, T-014, T-046 | marcas-migracao, marcas-precedencia, compose-solucao |
| REQ-003 | AC-003.1 a .5 | T-002, T-003, T-005, T-006, T-023 | marcas-isolamento, marcas-pacote-atomico, marcas-troca-de-marca |
| REQ-004 | AC-004.1 a .3 | T-026, T-029, T-030 | marcas-troca-de-org, marcas-visao, marcas-sessao-por-host.spec |
| REQ-005 | AC-005.1 a .6 | T-011, T-015, T-027, T-028, T-031, T-032 | marcas-telas-publicas, marcas-cadastro-rota, auth/confirm |
| REQ-006 | AC-006.1 a .5 | T-033 a T-035, T-037, T-038 | gancho-de-email, acesso-da-marca |
| REQ-007 | AC-007.1 a .6 | T-040 a T-043 | marcas-tls-ask, caddy-on-demand.test.sh |
| REQ-008 | AC-008.1 a .7 | T-017 a T-025 | PainelDeMarcas, marcas-admin-api |
| REQ-009 | AC-009.1 a .4 | T-044, T-046, T-048 | sondas.sh, compose-solucao |
| REQ-010 | AC-010.1 a .5 | T-001, T-005, T-012, T-013, T-015, T-036, T-039 | marcas-desempenho, branding.test.ts |

## Revisão de código

Revisão por fatia (`sdd-reviewer`) feita em cada uma das 7 fatias durante a implementação; achados corrigidos antes do merge. Auditor final por amostragem: nenhum bloqueante.

## Segurança

- RLS ligada nas 8 tabelas novas; `brand_email_context` e `auth_hook_deliveries` sem policy e só `service_role`.
- Funções novas com `revoke` de PUBLIC/anon (0717 e 0718, e apêndices do baseline antes da varredura anon).
- Gancho de e-mail: corpo ≤ 64 KB, assinatura em tempo constante com janela, fecha por padrão (segredo vazio ⇒ 401).
- `tls-ask`: token por hash em tempo constante, erro de banco ⇒ 503 (nunca aprova), limite por hora, DNS conferido.
- Rotas mutantes de admin chamam `requireSupportWrite(` antes do efeito. Sem segredo no repositório.
- Limite do auditor: leu o código, não rodou contra um banco; o banco é provado pelo `test:db` do CI.

## Desvios de escopo

Nenhum desvio. Dívidas declaradas e aceitas: plano inicial por marca (parte de AC-005.3) vai ao subprojeto 2; `tests/e2e/marcas*.spec.ts` seguem em `FORA_DO_CI` (rodada manual na main foi verde); HTTPS sob demanda de ponta a ponta só quando o dono ligar `marcas.caddy`, `TLS_ASK_TOKEN` e `VPS_PUBLIC_IP` na produção. Ajuste menor: `.restauracao/` entrou no `.gitignore` (o `trace` listava cópias de segurança como se fossem testes).

## Specs vivas

- `specs/marcas-parceiros-e-dominios.md` (8 requisitos ADICIONADOS).

## Parecer

**APROVADO.** Os 50 critérios têm tarefa e teste, as 50 tarefas estão concluídas, o CI e a prova em homologação e produção estão verdes, a amostra de segurança não achou falha e as dívidas estão declaradas e fora do escopo.
