# Delta: release-proprio

> Corte de versão e publicação sem aplicativo nem segredo de terceiro. Mudança 008, AC-002.4 e AC-002.5.

## ADICIONADOS

### Requisito: Corte de versão manual com o token padrão

O workflow `corte-de-versao.yml` DEVE ser disparável só por `workflow_dispatch` (input opcional `major`), rodar apenas no repositório do dono, ter permissão de leitura por padrão e conceder escrita de conteúdo e de pull request só ao job `abrir-pr-de-release`. DEVE usar só `GITHUB_TOKEN`, passar entradas por `env` (nunca interpoladas no script), medir o acervo de `.changes/` contra o limite de 30.000 bytes apenas como aviso (`continue-on-error`), rodar `cortar-release.ts --escrever`, empurrar `release/X.Y.Z` e abrir o PR. Nenhuma tag nasce nele.

- Cenário: Dado fragmentos acumulados, quando o dono dispara o corte, então um PR `release/X.Y.Z` consome os fragmentos e o CHANGELOG cabe antes do limite.
- Cenário: Dado a opção de Actions criar pull requests desligada, quando o passo `gh pr create` roda, então ele falha (o branch já foi empurrado e o PR é aberto à mão).
- Cenário: Dado o PR aberto pelo `GITHUB_TOKEN`, então ele nasce sem CI (regra do GitHub) e o dono o fecha e reabre pela tela para os checks obrigatórios rodarem.

### Requisito: Publicação manual da versão cria a tag e dispara o CI

O workflow `publicar-versao.yml` DEVE ser manual (`workflow_dispatch`, input `versao` X.Y.Z), rodar só no repositório do dono e a partir da `main`, com escrita de conteúdo e de actions apenas no job. DEVE validar a versão pela string inteira, exigir a seção `## [X.Y.Z]` no `CHANGELOG.md`, recusar tag existente, tratar falha de consulta (rede, permissão) como erro e não como "tag inexistente", criar a tag anotada `vX.Y.Z` no topo da `main` sem `--force` e disparar `publish-image.yml` com `--ref vX.Y.Z`. Quem constrói e publica as imagens continua sendo o `publish-image.yml`, com `a-tag-veio-da-main` e `imagens-ok`.

- Cenário: Dado uma versão cujo CHANGELOG está na `main` e a tag não existe, quando o dono dispara, então a tag anotada nasce e a publicação das imagens X.Y.Z e X.Y é disparada.
- Cenário: Dado uma versão com quebra de linha ou sem seção no CHANGELOG, quando dispara, então o passo de conferência falha antes de criar qualquer coisa.
- Cenário: Dado o disparo manual, então o canal `stable` não se move (o `promover-stable` roda só em push de tag); limite conhecido e documentado.
