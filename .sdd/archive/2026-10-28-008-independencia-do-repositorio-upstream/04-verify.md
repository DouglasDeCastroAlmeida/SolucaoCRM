# Verificação: Independência do repositório upstream

> Mudança `008-independencia-do-repositorio-upstream` · porte L · 2026-10-28
> Prova de que o que foi pedido foi entregue, e só isso. Evidência, não opinião.

## Evidências

Regra desta verificação: a suíte completa e o `tsc` completo NÃO foram rodados neste PC (6 GB). A prova da suíte completa é o CI do repositório do dono (`gh ... -R DouglasDeCastroAlmeida/SolucaoCRM`). Os testes pontuais por critério foram rodados aqui.

**CI (suíte completa, typecheck, lint, invariantes, imagens):**
- PR #24 (planejamento + fatias 1 a 7), merge `9daab68c2`: `verify` pass, `verify-parte (1..4)` pass, `invariants` pass, `invariants-majors (17)` pass, `invariants-alcance` pass, `build-and-size` pass, `imagens-ok` pass, `a-tag-veio-da-main` pass, `imagem-do-app-sobe` e `imagens-de-fundo-sobem` (amd64) pass. `build-and-push`, `juntar-manifestos`, `promover-stable` skipping (esperado em PR).
- PR #25 (release 1.89.0, gerado pelo `corte-de-versao`), merge `0cab37875`: `verify`, `verify-parte (1..4)`, `invariants`, `invariants-majors (17)`, `invariants-alcance`, `build-and-size`, `imagens-ok`, `a-tag-veio-da-main` pass; o resto skipping. Na `main` em `0cab37875`: `ci` success, `perf` success, `Publicar imagem Docker (GHCR)` success, `publicar-versao` success, `vigia-de-colisao` success, `Deploy em homologação` success, `release` skipped.
- PR #26 (fechamento), merge `118d6ab0c`: `verify`, `verify-parte (1..4)`, `invariants`, `invariants-majors (17)`, `build-and-size`, `imagens-ok`, `a-tag-veio-da-main` pass. Na `main` em `118d6ab0c`: `perf` success, `Publicar imagem Docker (GHCR)` success, `release` skipped; `ci` ainda `in_progress` quando consultei (o commit só toca documentação e `.sdd`; os mesmos checks obrigatórios passaram no PR); `Deploy em homologação` **failure**: o log mostra `ssh: connect to host *** port ***: Connection timed out` (falha de rede para a VPS, não de código; o deploy do commit anterior `0cab37875` passou). Não houve novo disparo para provar o contrário.
- `test:shell` (inclui `update-guard.test.sh` caso 15 e `extensao-nao-instala.test.sh`) roda dentro do job `verify-parte` do `ci.yml` (linha 425); verde nos três PRs.

**Testes pontuais rodados aqui** (`npx vitest run tests/unit/<arquivo>`):
- `namespace-das-imagens`, `scripts-apontam-para-o-dono`, `credito-ao-autor-original`, `nada-executa-contra-o-upstream`, `corte-de-versao-so-usa-o-token-padrao`, `publicar-versao-so-usa-o-token-padrao`, `gatilho-dos-jobs-de-entrega`, `workflows-tem-permissions`, `gerador-catalogo-sem-origem`, `release-chega-na-lp`, `corte-de-versao-consome-fragmentos` → passam (11 arquivos), mais `executor-proprio-so-roda-o-que-e-nosso` (ver abaixo): 115 de 116 casos.
- `executor-proprio-so-roda-o-que-e-nosso`: 1 caso falha, "aceita pull_request de dentro do repositório". Limitação de ambiente: a guarda lê o payload do `pull_request` com `jq`, que não existe neste PC (`which jq` vazio); os outros 4 eventos e as recusas passam. O CI verde nos PRs #24 a #26 é a prova.
- `guarda-da-release-confere-identidade`, `guarda-da-release-reconhece-o-corte` e `populacao-do-proximo-nnnn`: 27 casos falham aqui (resposta "nenhuma decisão", sem `jq` e sem as fixtures de git do Windows). Classificado como limitação de ambiente; passam no CI. `namespace-das-imagens-runtime-owner`: passa.
- `bash tests/shell/extensao-nao-instala.test.sh`: os casos AC-003.1 e AC-003.3 ficam ok; 2 falhas ("controle positivo: catálogo válido recusado" e "mensagem de falha não explica nada"), ambas dependem de `jq`. `bash tests/shell/update-guard.test.sh`: aborta no caso 9 por causa do `chmod 600` no Windows, antes do caso 15. **AC-001.3 (caso 15) NÃO foi verificado localmente**; a prova é o `test:shell` do CI.
- A pasta `.restauracao/` (cópias de segurança do ambiente de edição) é varrida pelo vitest e pelo `sdd trace` e gera falhas e linhas de ruído; não faz parte do produto e foi ignorada.

## Rastreabilidade

Saída de `node .sdd/bin/sdd.mjs trace 008-independencia-do-repositorio-upstream`: **19 de 19 critérios com tarefa e ao menos um teste (status ✅)**. A coluna de testes do `trace` é RUIDOSA: ela casa qualquer arquivo de teste que cite o mesmo ID `AC-00N.N`, inclusive os de outras mudanças (agenda, inbox, marcas). Abaixo, a matriz com o teste que de fato prova cada critério (confirmado lendo o arquivo):

| Critério | Tarefas | Teste que prova | Onde roda |
| :-- | :-- | :-- | :-- |
| AC-001.1 | T-001, T-002, T-004 | `tests/unit/namespace-das-imagens.test.ts` (compose sem variáveis resolve ao namespace do dono) | aqui + CI |
| AC-001.2 | T-001, T-003, T-004 | `tests/shell/update-guard.test.sh` caso 15 + `hostgator-setup-kit/test-validators.sh` | CI (`test:shell`) |
| AC-001.3 | T-003, T-005 | `update-guard.test.sh` caso 15: sem versão nova o `.env` fixado por SHA fica intacto (`cmp -s`); com versão nova as 4 imagens passam à tag no namespace do dono. Texto REESCRITO pelo dono em 2026-10-28 (ver 01-prd) | CI apenas |
| AC-001.4 | T-002, T-004 | `namespace-das-imagens.test.ts` (`.env.hostgator.example`) | aqui + CI |
| AC-001.5 | T-003, T-004 | `update-guard.test.sh` caso 15 (consulta da última versão) | CI |
| AC-002.1 | T-006, T-008 | `tests/unit/scripts-apontam-para-o-dono.test.ts` | aqui + CI |
| AC-002.2 | T-007, T-008 | `release-chega-na-lp.test.ts`, `guarda-da-release-*`, `workflows-tem-permissions`, `gatilho-dos-jobs-de-entrega` | `release-chega-na-lp` e os dois últimos aqui; `guarda-da-release-*` só no CI |
| AC-002.3 | T-019, T-020, T-021 | `executor-proprio-so-roda-o-que-e-nosso.test.ts` (aceita o dono, recusa upstream, fork, fork apagado, payload ilegível). Smoke T-021 NÃO APLICÁVEL (sem `EXECUTOR_PROPRIO` nem runner) | CI; 1 caso precisa de `jq` |
| AC-002.4 | T-015, T-017, T-018, T-025 | `corte-de-versao-so-usa-o-token-padrao.test.ts`, `publicar-versao-so-usa-o-token-padrao.test.ts` + execução real (corte gerou `release/1.89.0`, PR #25; `publicar-versao` success em `0cab37875`) | aqui + CI + execução real |
| AC-002.5 | T-016, T-017 | `corte-de-versao-consome-fragmentos.test.ts` (mede o acervo antes de cortar; aviso antes do estouro; seção cabe no teto); `ci` da `main` success em `0cab37875`, depois do corte | aqui + CI |
| AC-003.1 | T-009, T-010 | `gerador-catalogo-sem-origem.test.ts` (gerador) e `extensao-nao-instala.test.sh` (`listar`/`baixar` sem origem: sai 0, sem `curl`, avisa) | aqui (ok) + CI |
| AC-003.2 | T-009, T-010 | os mesmos, com `EXTENSOES_ORIGEM` informada | gerador aqui; shell completo só no CI (precisa de `jq`) |
| AC-003.3 | T-009, T-010 | `extensao-nao-instala.test.sh`: o script não usa `extension_installs`, `delete from` nem `/api/v1/extensions` (asserção estática de ausência de remoção) | aqui (ok) + CI |
| AC-004.1 | T-011, T-012 | `credito-ao-autor-original.test.ts` | aqui + CI |
| AC-004.2 | T-011, T-012 | idem (sem URL no `NOTICE`) | aqui + CI |
| AC-004.3 | T-011, T-012 | idem (três READMEs, parágrafo Origem, sem comando que baixe do upstream) | aqui + CI |
| AC-005.1 | T-013, T-014 | `nada-executa-contra-o-upstream.test.ts` (aponta arquivo e linha) | aqui + CI |
| AC-005.2 | T-013, T-014 | idem (`TETO_DE_EXCECOES = 11`, lista deve igualar o teto, motivo obrigatório) | aqui + CI |
| AC-005.3 | T-007, T-008 | `guarda-da-release-*`, `release-chega-na-lp`, `populacao-do-proximo-nnnn`, `namespace-das-imagens*`, `deskcomm-contribuir.test.sh` leem o dono | `release-chega-na-lp` e `namespace-*` aqui; os demais só no CI |

## Revisão de código

Revisão feita por leitura do diff dos commits `sdd(008)` (`bc7ae5253` a `19ea1bc2f`) e dos dois workflows novos (sem subagente `sdd-reviewer` à parte).

- Conformidade com o PRD: REQ-001 a REQ-005 têm implementação e teste (matriz acima). A cerca vigia só arquivos que executam, como o ADR-002 pedia, e foi estendida às skills (`.agents`, `.claude`).
- Achado não bloqueante 1: o totalizador de `03-tasks.md` está desatualizado ("24 tarefas (0 concluídas, 0%)"; são 25, todas marcadas `[x]`). Cosmético; a lista de tarefas é a autoridade.
- Achado não bloqueante 2: a saída do `sdd trace` mistura testes de outras mudanças (casa só por ID). A matriz acima corrige o ruído; nenhum critério depende de teste alheio.
- Achado não bloqueante 3: AC-003.3 é provado por ausência de comandos de remoção no script, não por um cenário com extensão instalada e origem removida. Aceitável porque a extensão instalada mora no banco e o script não a toca, mas é prova indireta.
- Sem `console.log` esquecido nem env var nova; sem migration (sem banco).

## Segurança

- `corte-de-versao.yml`: gatilho só `workflow_dispatch`; permissão de leitura no topo e escrita (`contents`, `pull-requests`) só no job; condição de repositório do dono; apenas `GITHUB_TOKEN`; o input `major` (booleano) e a versão entram no script por `env:`, não interpolados em `run:`. Sem `pull_request_target` e sem checkout de código de fork.
- `publicar-versao.yml`: `workflow_dispatch`; escrita (`contents`, `actions`) só no job; condição de repositório e `github.ref == refs/heads/main`; o input `versao` entra por `env:` e é validado por regex de string inteira (`[[ =~ ]]`, bloqueia quebra de linha e metacaracteres) antes de qualquer uso; a consulta de tag distingue "não existe" (código 2) de falha; tag anotada, nunca `--force`. Risco residual aceito: quem tem escrita no repositório pode disparar o publicar (é o desenho: ato do dono).
- Segredos: nenhum segredo novo. `git grep` por `ghp_`, `github_pat_`, `sk-`, `AKIA`, chave privada, `xox`, JWT nos 106 arquivos acrescentados ou alterados pelos commits `sdd(008)` achou só padrões de detecção (`pre-voo.sh`) e uma fixture sintética (`test-validators.sh:136`); nenhum valor real.
- Cerca: `git grep` de `melgarafael` e `deskcomm.com.br` nos caminhos que executam só devolve `hostgator-setup-kit/test-validators.sh` (asserção negativa e fixture de crontab de vizinho), já na lista de exceções com motivo.
- Dependências novas: nenhuma. Autorização e isolamento de dados: N/A (sem banco, sem tenant).
- Riscos do design, aceitos pelo dono: o PR de release aberto pelo `GITHUB_TOKEN` nasce sem CI (D1: fechar e reabrir pela tela); a tag criada pelo `GITHUB_TOKEN` não dispara `publish-image.yml` (D2), daí o `publicar-versao`.

## Desvios de escopo

Além do PRD, e se está coberto:
1. `publicar-versao.yml` (T-025) e a doutrina `docs/doctrine/versionamento.md` atualizada: coberto pelo Adendo D2 do design (2026-10-28) e pela aprovação do dono; sem ele o AC-002.4 geraria tag sem imagem, em silêncio.
2. Remoção do passo da LP no fluxo de release (o `release-chega-na-lp` passa a ler o dono): consequência de AC-002.2, AC-005.3 e do D-08 do grill; o PRD não a descreve em detalhe.
3. Templates de issue (`.github/ISSUE_TEMPLATE/*`), `SECURITY.md`, `CONTRIBUTING.md` e `CONTRIBUTING.en.md`: ponteiros de documentação ao upstream trocados para o repositório do dono. Coberto de forma ampla por D-02 do grill e pela exceção documental do PRD (não mandar o leitor a executar algo do upstream); não há AC específico. Sem efeito em execução.
4. Skills (`.agents/`, `.claude/`), `AGENTS.md`, `CLAUDE.md`, `public/llms.txt` e `hostgator-setup-kit/README.md`: coberto por T-023 (DOCS) e pela cerca, que vigia skills; só tiraram comando que baixa do upstream.
5. `docs/solucao-crm/inventario-de-propriedade-intelectual.md`: coberto por T-023.
6. `scripts/check-user.ts`, `scripts/probe-redirect.ts`, `ubuntu-local-installer.sh`, `loop/hooks/check-migration-triple.sh`: acompanham as constantes de repositório (AC-002.1 e afins); coberto pelo design (a lista exata sai do git grep).
7. Fragmento `.changes/independencia-do-repositorio-upstream.md`: exigido pela doutrina de versionamento (item 17 da DoD).
8. Aquém do PRD: T-021 (smoke do executor próprio) NÃO APLICÁVEL, porque o repositório do dono não tem executor; AC-002.3 fica provado só por teste unitário e CI.
- Nada de produção foi alterado: nenhuma imagem em execução mudou (afirmado em T-005 e T-022; as sondas de `/` = 200 e `/app` = 307 estão declaradas em 03-tasks, e eu não as repeti).

## Specs vivas

Escritas em `specs/` desta mudança (mescladas em `.sdd/specs/` no /sdd:archive):
- `specs/identidade-do-repositorio.md` (ADICIONADOS: imagens e instalação do dono; scripts e workflows; executor de CI; cerca contra regressão)
- `specs/release-proprio.md` (ADICIONADOS: corte de versão manual; publicação manual da versão)
- `specs/credito-ao-autor-original.md` (ADICIONADOS)
- `specs/catalogo-de-extensoes.md` (ADICIONADOS)
- `specs/ci-cd.md` (MODIFICADOS: "CI enxuto dentro da cota gratuita", com o corte e a publicação próprios)

## Parecer

**APROVADO**, com ressalvas declaradas. Os 19 critérios têm implementação e teste, o CI dos três PRs (#24, #25, #26) passou nos checks obrigatórios, o corte e a publicação próprios foram exercitados de verdade (PR #25, tag e publicação 1.89.0 verdes), e a revisão de segurança não achou injeção, permissão excessiva nem segredo.

NÃO PROVADO (sem maquiar): (1) AC-002.3 sem smoke em executor real (T-021 não aplicável); (2) a existência das tags e imagens 1.89.0 no registro não foi conferida (o `gh` não tem `read:packages`; só o sucesso dos workflows); (3) o canal `stable` não se move pelo caminho do `publicar-versao` (limite documentado); (4) AC-001.2, AC-001.3, AC-001.5, AC-003.2 e parte de AC-002.2/AC-005.3 só têm prova no CI, não neste PC (faltam `jq` e permissões do Windows); (5) AC-003.3 é prova indireta; (6) o `ci` do commit `118d6ab0c` estava `in_progress` e o `Deploy em homologação` dele falhou por timeout de SSH (infra), sem novo disparo; (7) as sondas de produção e homologação vêm de 03-tasks, não foram repetidas aqui.
