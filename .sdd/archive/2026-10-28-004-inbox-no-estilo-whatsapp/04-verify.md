# Verificação: Inbox no estilo WhatsApp

> Mudança `004-inbox-no-estilo-whatsapp` · porte M · 2026-10-27
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.

## Evidências

Este PC tem 6 GB de RAM; typecheck, lint, suíte e `test:db` rodam no CI, que é o juiz.

- `gh pr checks 20` (PR mesclado, commit `1fe1d8c`) → verify-parte 1 a 4, verify, invariants, invariants-majors (17), invariants-alcance, build-and-size, imagem-do-app-sobe, imagens-de-fundo-sobem e imagens-ok **passaram**. Ficaram "skipping" `juntar-manifestos`, `build-and-push` e `promover-stable`, o que é normal em PR.
- `npx vitest run components/inbox/Composer.respostas.test.tsx lib/branding/contraste-do-inbox.test.ts` (auditor) → 2 arquivos, 14 testes, todos passaram.
- Deploy em produção (`workflow_dispatch`, run 40582452402) → sucesso. Sonda: `/` = 200, `/app` = 307.
- **Não executado:** a spec `tests/e2e/inbox-desempenho-e-celular.spec.ts` (está em `FORA_DO_CI`, escrita e nunca rodada). O CI verde **não** prova os critérios AC-007.2 e AC-007.3.

## Rastreabilidade

`sdd trace` marca os 33 critérios (AC-001.1 a AC-007.5) com ✅, mas a matriz é ruidosa: lista testes de outras mudanças. O mapeamento real, conferido pelos IDs citados nos testes:

| Critérios | Teste |
| :-- | :-- |
| AC-001.1 a 001.6, AC-006.3 | `components/inbox/ConversationListItem.lista.test.tsx` |
| AC-001.2, 001.3, 001.5 | `lib/inbox/formato-da-lista.test.ts` |
| AC-001.7 | `components/inbox/InboxFilters.abas.test.tsx` |
| AC-002.1, 002.2 | `lib/inbox/agrupar-mensagens.test.ts` |
| AC-002.1, 002.3 a 002.5, AC-006.1, 006.2 | `components/inbox/MessageBubble.recibos.test.tsx` |
| AC-002.6 | `components/inbox/ConversationHeader.assumir.test.tsx` |
| AC-003.1, 003.3 | `components/inbox/MessageBubble.tema.test.tsx` |
| AC-003.2 a 003.4 | `lib/branding/contraste-do-inbox.test.ts` |
| AC-004.1 a 004.4 | `components/inbox/Composer.respostas.test.tsx` |
| AC-005.1 a 005.3 | `tests/unit/inbox-painel-do-contato-estado.test.tsx` |
| AC-007.1 | `components/inbox/inbox-so-pelo-teclado.test.tsx` |
| AC-007.4, 007.5 | `lib/inbox/textos-do-inbox-i18n.test.ts` e a varredura de marca existente (`tests/unit/branding.test.ts`) |
| **AC-007.2, 007.3** | `tests/e2e/inbox-desempenho-e-celular.spec.ts` — **escrita, NÃO executada** |

## Revisão de código

Revisão por fatia (sdd-reviewer) feita nas Fatias 1 a 5; achado relevante tratado: o executor da Fatia 1 criou `lib/inbox/tema-do-balao.ts` sem consumidor e com cores copiadas, e o arquivo foi apagado (o contraste passou a ser provado com `derivarMarca`, `extrairRegua` e `melhorFrenteSobre` reais). Por isso a tarefa T-002 está marcada [x] **sem** o arquivo que ela descrevia: o comportamento está coberto, o artefato prometido não existe.

## Segurança

- A permissão `message-templates.view` governa o menu "/": `hooks/inbox/useMessageTemplates.ts` consulta só com `podeConsultar`, e `Composer.tsx` exige `podeConsultar !== false` para abrir o menu (AC-004.4, com teste).
- É controle de interface. A autorização real segue na rota `/api/v1/message-templates`, **não alterada**.
- Sem rota, tabela, migration, dependência nova, `console.log` nem `dangerouslySetInnerHTML` no diff.

## Desvios de escopo

- Nenhum escopo extra. Mudou só componentes e libs do inbox, o dicionário, o `e2e.yml` (spec em `FORA_DO_CI`) e testes.
- **Aquém da spec (lacunas declaradas):**
  1. T-026 (jornada pela tela com capturas e medidas por ferramenta) **adiada pelo dono**; `evidence/004-inbox/` só tem `.gitkeep`. A prova pela tela foi feita pelo dono em produção (2026-10-27), por relato: receber, responder, ✓ e menu "/".
  2. Spec de desempenho e celular escrita e não executada (AC-007.2 e AC-007.3 **não verificados**).
  3. Ícone de status em "Você:" da lista: a listagem não traz o status da última mensagem e trazê-lo mudaria o contrato.
  4. "Tentar de novo" na mensagem que falhou **não existe no código**; o AC-002.4 partiu dessa premissa errada e fica atendido só na parte da falha visível.
  5. Lista não virtualizada (50 por vez e "Carregar mais"): o objetivo "500 conversas rolam sem travar" não tem prova.
  6. Cor do ✓✓ de lido segue azul fixo, como já era.
  7. A aba "Fila" mantém o rótulo, com "Não atribuídas" como dica.

## Specs vivas

`specs/inbox.md` desta mudança descreve o comportamento entregue (tema pela marca, lista, conversa, menu "/" e painel do contato, idiomas).

## Parecer

**APROVADO COM RESSALVAS.** Todos os critérios têm teste que os cita, o CI do PR #20 passou inteiro, a produção responde 200 e 307, e o dono aprovou o visual pela tela. Nenhum achado bloqueante. As ressalvas são as lacunas acima, em especial AC-007.2 e AC-007.3, que continuam **não verificados** e viram trabalho de uma próxima rodada (capturas e medidas com conta de teste; virtualização se a medição falhar).
