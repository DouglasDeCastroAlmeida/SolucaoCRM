# Design: Independência do repositório upstream

> Mudança `008-independencia-do-repositorio-upstream` · porte L · 2026-10-28
> O COMO, derivado de `01-prd.md`. Siga os padrões do código existente.

## Abordagem

O repositório já foi desenhado para ter **uma âncora de identidade** que os testes cruzam com as outras declarações do mesmo valor: `tests/unit/_identidade-deste-repo.ts` (`NAMESPACE_DESTE_REPO`, `DONO_DESTE_REPO`), lida por `namespace-das-imagens.test.ts` e `namespace-das-imagens-runtime-owner.test.ts`. Esses testes derivam o resto (compose, `.env.hostgator.example`, `publish-image.yml`, URL de clone) da âncora e reprovam divergência. A troca, portanto, **não é um busca-e-substitui**: é trocar a âncora, trocar cada declaração que ela cobra **na mesma fatia** e deixar o CI provar que as declarações concordam entre si e com o dono do runner.

Por camada, em ordem de risco crescente:
1. **Imagens e kit (REQ-001):** `IMG_NS`, defaults do `docker-compose.prod.yml`, `.env.hostgator.example`, URLs de clone/raw/API em `install.sh`, `comecar.sh`, `diagnostico.sh`, `_common.sh`, label `org.opencontainers.image.source` dos Dockerfiles, e a âncora de teste. Tudo derivado de `ghcr.io/douglasdecastroalmeida` e `DouglasDeCastroAlmeida/SolucaoCRM`.
2. **Scripts e workflows (REQ-002, exceto executor e release):** `scripts/instalar-guias.sh`, `vigia-colisao-de-migration.ts`, `migration-populacao.sh`, `loop/hooks`, a condição `github.repository == ...` de `release.yml` e os testes que a cravam.
3. **Catálogo (REQ-003):** `ORIGEM_PADRAO` vazia em `extensao.sh` e `EXTENSOES_ORIGEM` sem padrão em `gerar-catalogo-de-extensoes.ts`, com mensagem clara.
4. **Crédito (REQ-004):** `LICENSE`, `NOTICE`, parágrafo "Origem" nos três READMEs.
5. **Cerca (REQ-005):** teste novo que varre os arquivos que executam, com lista de exceções que só encolhe.
6. **Executor de CI e release (REQ-002.3 a .5):** por último e em fatias próprias, porque erram de forma silenciosa.

**Alternativas descartadas:** (a) busca-e-substitui global — quebraria testes de identidade, reescreveria histórico e arquivos de auditoria; (b) manter o upstream como segundo remoto "de leitura" — mantém a dependência que o dono quer cortar; (c) mudar também os nomes das imagens agora — é a refatoração de propriedade intelectual, adiada pelo dono.

## Componentes afetados

Novos:
- `NOTICE` (raiz).
- `tests/unit/nada-executa-contra-o-upstream.test.ts`: a cerca do REQ-005.
- `.github/workflows/corte-de-versao.yml`: release próprio (ADR-003).

Alterados (a lista exata sai de `git grep melgarafael` na hora da fatia):
- `docker-compose.prod.yml`, `.env.hostgator.example`, `Dockerfile`, `Dockerfile.worker`, `Dockerfile.scheduler`, `Dockerfile.voice-agent`.
- `hostgator-setup-kit/_common.sh`, `install.sh`, `comecar.sh`, `diagnostico.sh`, `extensao.sh`.
- `scripts/instalar-guias.sh`, `scripts/vigia-colisao-de-migration.ts`, `scripts/migration-populacao.sh`, `scripts/gerar-catalogo-de-extensoes.ts`, `scripts/cortar-release.ts` (já feito no PR #22).
- `infra/executor-proprio/instalar.sh`, `so-o-que-e-nosso.sh`, `vaga.sh`.
- `.github/workflows/release.yml`, `e2e.yml`, `acolhida.yml`.
- `tests/unit/_identidade-deste-repo.ts`, `namespace-das-imagens*.test.ts`, `guarda-da-release-*.test.ts`, `release-chega-na-lp.test.ts`, `populacao-do-proximo-nnnn.test.ts`, `tests/shell/deskcomm-contribuir.test.sh`.
- `LICENSE`, `README.md`, `README.en.md`, `README.es.md`.

Intocados de propósito: `CHANGELOG.md`, `docs/audits`, `evidence/`, `triagem/`, `.sdd/archive`, nomes de imagens, marca "Deskcomm".

## Fluxo

Entrega em sete fatias; cada uma termina com o CI verde antes da seguinte:
1. Âncora + imagens + kit (REQ-001) — a mais valiosa, fecha o risco de puxar imagem alheia.
2. Scripts e condições de workflow (REQ-002.1, .2).
3. Catálogo de extensões (REQ-003).
4. Crédito: `LICENSE`, `NOTICE`, READMEs (REQ-004).
5. Cerca de regressão (REQ-005), já com as fatias 1 a 4 aplicadas, para nascer verde.
6. Release próprio (REQ-002.4 e .5).
7. Executor de CI (REQ-002.3), com `EXECUTOR_PROPRIO` desligada durante a troca.

## Contratos e interfaces

- **Fonte única, por camada:** bash `IMG_NS` e `REPO_URL` em `_common.sh`; TypeScript `NAMESPACE_DESTE_REPO` e `DONO_DESTE_REPO` em `_identidade-deste-repo.ts`; os scripts de TypeScript do repositório leem `process.env.GITHUB_REPOSITORY` e usam o repositório do dono como fallback. Não há constante nova espalhada.
- **Origem do catálogo:** `EXTENSOES_ORIGEM` (TypeScript) e `EXTENSOES_ORIGEM` / argumento (bash) sem padrão. Sem valor, o comando termina com código de saída 0 e a mensagem "nenhuma origem de catálogo configurada; nada foi consultado". Com valor, comporta-se como hoje.
- **Cerca (REQ-005):** o teste varre `git ls-files` filtrando por caminhos de execução (`docker-compose*.yml`, `Dockerfile*`, `hostgator-setup-kit/**`, `scripts/**`, `infra/**`, `.github/workflows/**`, `.env*example`, `loop/**`) e reprova em `melgarafael` ou `deskcomm.com.br`, salvo as entradas de `EXCECOES` (arquivo + motivo). A lista só pode encolher: o teste compara o tamanho com um teto gravado e reprova se a lista crescer.
- **Workflow de corte:** `workflow_dispatch` com `permissions: contents: write, pull-requests: write`, usa `GITHUB_TOKEN`, roda `tsx scripts/cortar-release.ts --escrever` e abre o PR `release/vX.Y.Z`. Não usa aplicativo nem segredo novo.

## Modelo de dados

N/A — sem banco, sem migration. Nada de tenant.

## Decisões (ADRs)

### ADR-001: Trocar a âncora de identidade e as declarações dela na mesma fatia
- Contexto: `namespace-das-imagens.test.ts` cruza a âncora com o compose, o `.env` de exemplo, a matriz de `publish-image.yml` e as URLs; trocar uma só reprova (e foi desenhado assim para o dono do upstream não poder afrouxar a guarda sozinho).
- Decisão: trocar a âncora e todas as declarações dela num único commit por fatia, e não relaxar nenhum teste de identidade; eles passam a vigiar o nosso valor.
- Consequências: a fatia 1 é grande em arquivos mas pequena em decisão; o CI é o juiz.

### ADR-002: Cerca por varredura de arquivos que executam, não por palavra no repositório inteiro
- Contexto: 579 ocorrências, a maioria em documentação, histórico e testes.
- Decisão: a cerca só vigia os caminhos que executam e tem uma lista de exceções com motivo que só encolhe.
- Consequências: documentação e histórico ficam livres; qualquer ponteiro de execução novo para o upstream reprova.

### ADR-003: Release próprio por `workflow_dispatch` com o token padrão
- Contexto: os jobs do upstream usam um aplicativo do GitHub do dono e estão desligados; sem corte, o changelog estourou o limite de 30.000 bytes e a `main` reprovou.
- Decisão: um workflow novo, manual, que roda o corte e abre o PR de release com `GITHUB_TOKEN`. Os jobs do upstream seguem desligados e ganham o comentário do porquê. A tag nasce quando o PR de release é mesclado, por um passo no mesmo workflow.
- Consequências: o dono dispara o corte quando quiser (ou agenda); nada depende de terceiro. O PR criado por `GITHUB_TOKEN` não dispara outros workflows, então o CI do PR de release precisa ser disparado por um push ou pelo próprio `workflow_dispatch`; isso é verificado na fatia 6.

## Riscos e casos extremos

- **Teste de identidade derruba o CI.** Mitigação: a fatia 1 troca âncora e declarações juntas, e a prova é o CI das duas pernas (`verify` e `test:shell`).
- **`update.sh` de instalação existente.** Instalações com `APP_IMAGE` no `.env` não mudam. As sem a variável passam a puxar do namespace do dono; isso é o comportamento desejado. Prova: `pnpm test:shell` (kit) e leitura do `update.sh` antes da troca.
- **Repositório privado.** `curl` e `git clone` anônimos deixam de funcionar para terceiros; os scripts apontam para o repositório do dono e passam a exigir acesso. Registrar no `NOTICE`/README que a instalação é feita pelo dono.
- **Executor de CI.** Trocar o repositório esperado sem trocar quem registra a máquina faz o executor recusar todo trabalho. Mitigação: desligar `EXECUTOR_PROPRIO` (os jobs voltam ao GitHub), trocar, religar, e provar com um PR de teste. Botão de emergência já existe.
- **Falso positivo da cerca.** Ocorrência legítima em comentário de código que executa. Mitigação: entrada na lista de exceções com motivo.
- **Fluxo de release e `GITHUB_TOKEN`.** O PR aberto pelo token padrão não dispara CI; se o repositório exigir checks, o PR de release fica pendente. Mitigação: o workflow dispara os checks por `workflow_dispatch` ou o dono mescla com o administrador.

## Estratégia de testes

| Critério | Camada | Teste |
| :-- | :-- | :-- |
| AC-001.1, .4 | unitário (leitura de arquivo) | `namespace-das-imagens.test.ts` com a âncora nova |
| AC-001.2, .5 | shell | `pnpm test:shell` (`test-validators.sh`, `update-guard.test.sh`) |
| AC-001.3 | shell | caso novo em `update-guard.test.sh`: `.env` com SHA fixado não é alterado |
| AC-002.1 | unitário | teste novo que lê as constantes dos scripts |
| AC-002.2 | unitário | `release-chega-na-lp.test.ts` e `guarda-da-release-*` ajustados |
| AC-002.3 | shell | caso novo em `tests/shell` para `so-o-que-e-nosso.sh` com o repositório do dono e com um alheio |
| AC-002.4, .5 | unitário + CI | teste do YAML do workflow de corte; execução manual e conferência do PR gerado |
| AC-003.1 a .3 | shell | caso novo em `test-validators.sh` para `extensao.sh` sem origem, com origem e com extensão instalada |
| AC-004.1 a .3 | unitário | teste novo lê `LICENSE`, `NOTICE` e os três READMEs |
| AC-005.1 a .3 | unitário | `nada-executa-contra-o-upstream.test.ts`, com sabotagem (acrescentar `melgarafael` num script) para provar que reprova |

Cada teste cita o ID: `it('AC-001.1: ...')`. A prova final é o CI verde e as sondas de produção (`/` = 200, `/app` = 307) após o deploy.
