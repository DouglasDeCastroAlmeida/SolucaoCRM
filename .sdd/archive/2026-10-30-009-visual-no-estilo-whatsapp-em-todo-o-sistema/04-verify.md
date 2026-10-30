# Verificação: Visual no estilo WhatsApp em todo o sistema

> Mudança `009-visual-no-estilo-whatsapp-em-todo-o-sistema` · porte L · 2026-10-30
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.
> Base verificada: branch `chore/009-limpeza` (main ea1c2258f + PR #40, só comentários e tarefas). Leva 1 (8bc1140d9, 29/10) e leva 2 (ea1c2258f, 30/10) já em produção.

## Evidências

Executadas nesta verificação (Windows, `npx`, sem pnpm):
- `npx tsc --noEmit -p tsconfig.typecheck.json` → exit 0, sem erros.
- `npx eslint` nos 31 arquivos .ts/.tsx alterados entre 5c4a3b6b7 e ea1c2258f → 0 erros, 3 avisos (Sidebar.tsx:70 `react-hooks/set-state-in-effect`; um `eslint-disable` sem uso e um `<img>` em outro arquivo). Avisos, não bloqueiam.
- `npx vitest run` (components/shell, components/ui, components/contacts, app/app/tasks, app/app/ai, mais os 5 testes nomeados da 009, `--testTimeout=200000`) → 61 arquivos, 493 testes passados, 0 falhas, sem linha `Errors`.
- `git diff --name-only 5c4a3b6b7..ea1c2258f -- app/api supabase lib/auth` → vazio (nenhuma rota, migration ou código de auth mudou).
- `run test` completo, `e2e`, `coverage`, `security` (pnpm audit): NÃO VERIFICADOS aqui. `coverageMin` não definido. A suíte completa local não concluiu no Windows; a prova é o CI Linux.

Fatos medidos antes, registrados pelo solicitante (não reexecutados por mim):
- CI da main verde nos commits 8bc1140d9 (leva 1), 03284b9d1 (leva 2), 16259bde6 e ea1c2258f.
- Leva 1 na hml (`evidence/009-visual-whatsapp/leva-1`): menu 64 px/240 px, TopBar 56 px, rolagem lateral 0 em 36/36, alvo 44 px, contraste; sino do escuro corrigido de 3,48 para cerca de 5,26 (PR #34).
- Volta (rollback) provada na hml: 240 px com a imagem anterior e 64 px com a leva 1.
- Leva 2 na hml em duas rodadas (`evidence/009-visual-whatsapp/leva-2`): a primeira achou 6 defeitos no celular (corrigidos nos PRs #37 e #38); a final passou 32 combinações de tela/tema/tamanho e 7 passos de comportamento.
- Deploys em produção com autorização escrita do dono (leva 1 8bc1140d9; leva 2 ea1c2258f); sondas / 200, /app 307, /login 200; login do dono entra e telas abrem sem erro nem erro de rede.

## Rastreabilidade

Saída de `sdd trace` (26 critérios, todos ✅, mas inflada): os IDs AC-00N.M repetem em outras mudanças arquivadas e o trace também conta cópias de `.restauracao/`, então cada critério lista dezenas de testes alheios (ex.: `tests/infra/vps/sondas.sh`, testes de agenda e marcas). Não conto isso como cobertura. Conferi por grep nos arquivos da própria 009:

| Critério | Prova real da 009 |
| :-- | :-- |
| AC-001.1, .3, .4 | `tests/unit/sidebar-preferencia-por-usuario.test.ts` (.3 também `tests/journeys/visual-whatsapp-leva-1.spec.ts`) |
| AC-001.2, .5, .6 | `components/shell/Sidebar.recolhida.test.tsx` (.5 também `tests/unit/navegacao-destino-alcancavel.test.tsx`) |
| AC-002.1, .2 | `components/shell/BarraInferior.gaveta.test.tsx` |
| AC-002.3, .4 | `tests/journeys/celular-390.spec.ts` (Playwright, hml; teclado real só aproximado) |
| AC-003.1, .3 | `tests/unit/casca-whatsapp-009.test.ts` |
| AC-003.2 | `casca-whatsapp-009.test.ts`, `tests/journeys/casca-009-contraste.spec.ts`, `visual-whatsapp-leva-2.spec.ts` |
| AC-003.4 | `components/inbox/CaixaDeConversas.casca.test.tsx` |
| AC-004.1, .2, .4 | `ListaDeTarefas.test.tsx`, `AgentInboxList.test.tsx`, `ContactsTable.test.tsx`, `linha-de-lista.test.tsx`, `linha-de-lista-casos-e-followups.test.tsx`, `CaseList.mobile.test.tsx` |
| AC-004.3 | só `CaixaDeConversas.casca.test.tsx` cita o ID; rolagem/paginação das outras listas não têm teste com este ID (paginação preservada por não ter sido tocada e pelas provas na hml) |
| AC-005.1, .2 | `tests/journeys/visual-whatsapp-leva-1.spec.ts` e capturas na hml; funil em quadro NÃO provado (hml sem funil) |
| AC-006.1, .2 | sem teste com o ID: provados por suíte verde no CI e pelo diff vazio de `app/api supabase lib/auth` |
| AC-006.3 | `tests/unit/navegacao-destino-alcancavel.test.tsx` |
| AC-007.1, .2, .3 | evidência operacional: `visual-whatsapp-leva-1/2.spec.ts`, capturas aprovadas pelo dono, rollback na hml, deploys autorizados |

## Revisão de código

Conformidade com a spec: todos os critérios têm implementação e prova (testes ou evidência de hml), com as lacunas abaixo. Sem funcionalidade, rota, permissão ou dado alterado (diff vazio em api/supabase/auth; nenhum `package.json`/lockfile mudou). Nenhum `console.log` nem `getSession` nas linhas adicionadas.

Achados, nenhum bloqueante:
1. Aviso eslint `react-hooks/set-state-in-effect` em `components/shell/Sidebar.tsx:70` (leitura de localStorage em efeito). Baixo.
2. AC-004.3 (rolagem fluida e paginação) sem teste dedicado com o ID.
3. Linha de Contatos no celular com 161 px, mais alta que uma conversa do WhatsApp. Melhoria futura.

## Segurança

- Cookie `sidebar_collapsed_<userId>`: gravado por `app/actions/shell/toggleSidebar.ts` com `userId` de `supabase.auth.getUser()` no servidor; sem usuário não grava; `httpOnly`, `sameSite: "strict"`, `secure` via `cookieSecure()`, `path=/`, 1 ano. Leitura em `app/app/layout.tsx` por `lerSidebarRecolhida(…, user.id)`. Nenhum `getSession`. Conteúdo do cookie é só "0"/"1" (sem dado sensível).
- Sem hex novo em componente. Em `app/globals.css` só mudaram valores de tokens existentes por contraste (`--color-text-subtle` claro #7d786c→#6b675c e escuro #605e54→#8f8c80; `--destructive-foreground` #ffffff→#161510, agora ligado ao token). Sem verde, logo ou ícone do WhatsApp (varredura de linhas adicionadas vazia; `casca-whatsapp-009` e `branding.test.ts` cobrem).
- Nenhuma rota, permissão ou migration mudou; nenhuma dependência nova; sem segredos. Isolamento de dados inalterado.

## Desvios de escopo

Nenhum funcional. Extras de baixo risco: ajustes de tokens de contraste (sino do escuro, texto discreto, texto sobre destrutivo) e correções de celular dos PRs #34, #37 e #38, todos dentro de AC-002.3/AC-003.2. Alterações em `tests/journeys/agente-006-*.spec.ts` são ajustes de teste de outra mudança (006), sem efeito no produto.

NÃO PROVADO ou limitado (ressalvas): quadro do funil com colunas e cartões (hml sem funil); Casos e Fila de follow-up só medidos vazios; WhatsApp Web não capturado por nós (referência do dono, que aprovou as capturas); linha de Contatos no celular com 161 px; avatares só de iniciais; suíte completa local não concluída no Windows (prova é o CI Linux); teclado real do celular só aproximado; `test:db` e e2e do CI cobrem o resto.

## Specs vivas

Em `specs/` desta mudança:
- `navegacao-e-casca.md` (nova capacidade): menu recolhido por padrão e por usuário, acessibilidade do recolhido, barra de baixo e gaveta, casca por tokens com contraste e marca.
- `listas-como-conversa.md` (nova capacidade): LinhaDeLista, comportamento preservado, funil e agenda mantêm a forma.
- `inbox.md` (existente, ADICIONADO um requisito): caixa de conversas dentro da casca nova. Nenhum requisito existente de inbox foi alterado.

## Parecer

APROVADO com ressalvas. Typecheck, eslint (0 erros) e 493 testes focados passam, nenhuma rota, permissão ou migration mudou, o cookie é por usuário vindo do servidor, e as duas levas têm prova na hml e CI da main verde. As ressalvas são lacunas de prova declaradas acima (funil, vazios, referência WhatsApp Web, suíte completa só no CI), nenhuma bloqueante.
