# identidade-do-repositorio

## Requisitos

### Requisito: Imagens padrão e instalação são do dono do produto

O sistema DEVE resolver todo valor padrão de imagem (`APP_IMAGE`, `WORKER_IMAGE`, `SCHEDULER_IMAGE`, `VOICE_AGENT_IMAGE`) para `ghcr.io/douglasdecastroalmeida/*` no `docker-compose.prod.yml` e no `.env.hostgator.example`. O kit de instalação (`_common.sh`: `IMG_NS` e URL de clone; `install.sh`, `comecar.sh`, `diagnostico.sh`) e a consulta da última versão DEVEM usar `DouglasDeCastroAlmeida/SolucaoCRM`. Na camada TypeScript a fonte única é `tests/unit/_identidade-deste-repo.ts`; os testes de identidade leem o dono do repositório em vez de cravar a string do upstream. Os nomes das imagens e a marca "Deskcomm" não mudaram.

- Cenário: Dado o compose sem variáveis de imagem, quando a configuração é resolvida, então todas as imagens apontam para `ghcr.io/douglasdecastroalmeida/*`.
- Cenário: Dado um `.env` com imagens fixadas por SHA e um `update.sh` sem versão nova (nada a atualizar ou recusa de versão anterior), quando roda, então o `.env` não muda um byte.
- Cenário: Dado um `update.sh` que aplica uma versão nova, quando termina, então as quatro imagens passam à tag da versão no namespace do dono, sem edição manual.

### Requisito: Scripts e workflows reconhecem só o repositório do dono

Os scripts `cortar-release.ts`, `instalar-guias.sh`, `vigia-colisao-de-migration.ts` e `migration-populacao.sh` DEVEM referenciar `DouglasDeCastroAlmeida/SolucaoCRM` sem configuração extra (TypeScript lê `GITHUB_REPOSITORY` com esse fallback). As condições de repositório dos workflows (`e2e.yml`, `acolhida.yml`, `release.yml` e os novos) DEVEM comparar com o repositório do dono. Os jobs de release herdados do upstream seguem desligados, com o porquê comentado.

- Cenário: Dado um workflow condicionado ao repositório, quando a condição é avaliada num fork ou no upstream, então o job não roda.

### Requisito: Executor de CI espera o repositório do dono

A guarda da máquina (`infra/executor-proprio/so-o-que-e-nosso.sh`), o `instalar.sh` e o `vaga.sh` DEVEM ter o repositório do dono como esperado, e DEVEM recusar repositório alheio, o upstream e `pull_request` de fork (inclusive fork apagado e payload ilegível).

- Cenário: Dado um evento do repositório do dono, quando a guarda roda, então aceita.
- Cenário: Dado um evento do upstream ou de um fork, quando a guarda roda, então recusa com código diferente de zero.

### Requisito: Cerca contra regressão de dependência do upstream

O CI DEVE reprovar, apontando arquivo e linha, quando `melgarafael` ou `deskcomm.com.br` aparecer em arquivo que executa (compose, Dockerfiles, kit, scripts, infra, workflows, exemplos de `.env`, loop, skills) fora de `EXCECOES`. Cada exceção DEVE ter motivo escrito e caminho único que ainda casa; o tamanho da lista DEVE ser igual ao `TETO_DE_EXCECOES` gravado (só pode encolher, e ao encolher o teto é baixado junto). Teto na entrega: 11.

- Cenário: Dado um script que ganha `melgarafael` fora da lista, quando o teste roda, então reprova nomeando arquivo e linha.
- Cenário: Dado uma exceção nova, quando o teste roda, então reprova por exceder o teto.
