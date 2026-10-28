# Grill: Independência do repositório upstream

> Mudança `008-independencia-do-repositorio-upstream` · porte L · 2026-10-28
> Interrogatório técnico antes de qualquer requisito ou código. Uma pergunta por vez, sempre com
> uma resposta recomendada. O que o código responde, o agente descobre sozinho em vez de perguntar.

## Pedido original

Dono, em 2026-10-28: "Não podemos ter nada apontando para outro repositório que não o meu. Utilizamos esse código open source, pois entendemos que já partiríamos de 70% já pronto do que precisávamos, mas não quero dependência nenhuma do dono do DeskcommCRM." e "Precisamos de independência sem perder o que fizemos, sempre seguindo nossa esteira."

## Contexto levantado no código

- **579 ocorrências** de `melgarafael` no repositório (fora `.sdd/archive`, `CHANGELOG.md`, `triagem/`, `docs/audits`), em dezenas de arquivos.
- **A produção já é independente em tempo de execução.** A VPS roda `ghcr.io/douglasdecastroalmeida/*` fixadas por SHA (conferido em `/opt/.../.env`: `APP_IMAGE`, `WORKER_IMAGE`, `SCHEDULER_IMAGE`). O deploy usa as nossas imagens e o nosso repositório.
- **O que ainda aponta para o upstream e EXECUTA** (o risco real):
  - `docker-compose.prod.yml` (linhas 35, 120, 251, 418): o valor padrão das imagens é `ghcr.io/melgarafael/*`. Uma instalação sem `APP_IMAGE` no `.env` baixaria a imagem do dono do upstream.
  - `hostgator-setup-kit/_common.sh` (`IMG_NS="ghcr.io/melgarafael"`, a URL do clone e a consulta `api.github.com/repos/<slug>/releases/latest`), `install.sh`, `comecar.sh`, `diagnostico.sh`, `.env.hostgator.example`.
  - `Dockerfile*` (label `org.opencontainers.image.source`), `scripts/instalar-guias.sh`, `scripts/cortar-release.ts` (já corrigido no PR #22), `scripts/vigia-colisao-de-migration.ts`, `scripts/migration-populacao.sh`.
  - `infra/executor-proprio/*` (instalador do executor, `so-o-que-e-nosso.sh`, `vaga.sh`: repositório esperado).
  - Workflows: `release.yml`, `acolhida.yml`, `e2e.yml` (e a condição `github.repository == 'melgarafael/DeskcommCRM'`), com jobs de release desligados (`if: false`, ADR-004/D-06 da mudança 001) por dependerem de um GitHub App do dono (`RELEASE_APP_ID`).
  - Fora do GitHub: `extensoes.deskcomm.com.br` (origem do catálogo de extensões em `extensao.sh` e `gerar-catalogo-de-extensoes.ts`) e `deskcomm.com.br` (site/LP do upstream).
- **Só documenta:** `README*`, `CONTRIBUTING*`, `public/llms.txt`, `docs/`, as skills em `.agents/` e `.claude/`, `.mailmap`, `AGENTS.md`, `CLAUDE.md`.
- **Histórico a preservar:** `CHANGELOG.md`, `docs/audits`, `evidence/`, `triagem/`, `.sdd/archive`.
- **Testes que cobram a identidade do upstream:** `tests/unit/namespace-das-imagens.test.ts`, `guarda-da-release-confere-identidade.test.ts`, `guarda-da-release-reconhece-o-corte.test.ts`, `release-chega-na-lp.test.ts`, `populacao-do-proximo-nnnn.test.ts`, `tests/shell/deskcomm-contribuir.test.sh`. Trocar a string sem trocar o teste quebra o CI.
- **Licença:** `LICENSE` é MIT, "Copyright (c) 2026 Rafael Melgaço". A MIT exige manter o aviso de copyright e a permissão em todas as cópias substanciais do software.
- **Dependência de terceiro que NÃO é do dono do upstream e fica:** WAHA (devlikeapro), Supabase, Redis, Caddy.
- Constituição e CLAUDE.md: imagens pinadas, `update.sh` nunca exige edição manual de `.env`, upstream licenciado nunca é republicado; o namespace das imagens tem uma única fonte (`IMG_NS`).

## Perguntas e respostas

### P1. O que fazer com o crédito ao autor original (aviso de copyright MIT e menção de origem)?
- Recomendação do agente: **manter o `LICENSE` como está** e acrescentar uma linha com o seu nome ("Copyright (c) 2026 <seu nome> — modificações") abaixo da dele. A MIT obriga a manter o aviso do autor; tirar o nome dele seria descumprir a licença, e não é preciso para ficar independente. Além disso, um parágrafo "Origem" no `README` e no `NOTICE` dizendo que o projeto nasceu como fork do DeskcommCRM, sem link que o sistema siga ou consulte. Todo o resto do código passa a apontar só para o seu repositório.
- Resposta: aceita a recomendação, por enquanto (dono, 2026-10-28). Manter o LICENSE e o crédito ao autor original. Depois da primeira versão em produção, o dono quer revisar tudo o que é do upstream e refatorar para algo próprio, com o objetivo de registrar o sistema como propriedade intelectual dele; "de forma correta e justa", a ser planejado depois de implementado.

### P2. Esta mudança troca já só os ponteiros, ou fica pausada até a primeira versão em produção?
- Recomendação do agente: (a) trocar já só os **ponteiros que executam** para o repositório do dono (imagens padrão, instalador, scripts, workflows, executor de CI), sem refatorar código nem mexer no crédito. Fecha o risco de uma instalação baixar imagem alheia e custa pouco. A refatoração de propriedade intelectual fica para depois da primeira versão.
- Resposta: item (a), dito pelo dono em 2026-10-28.

### P3. O catálogo de extensões e o site (`extensoes.deskcomm.com.br`, `deskcomm.com.br`) são do dono do upstream: o que fazer com eles?
- Recomendação do agente: o instalador de extensões (`extensao.sh`) e o gerador do catálogo passam a ter **origem vazia por padrão** (sem consulta a lugar nenhum) e só usam uma origem se o operador informar uma. O núcleo continua inteiro sem extensão (doutrina de extensões do CLAUDE.md), então nada se perde. O catálogo próprio, num domínio do dono, vira trabalho futuro. Links de documentação para `deskcomm.com.br` ficam como texto, não como dependência de execução.
- Resposta: aceito (dono, 2026-10-28).

### P4. (respondida pelo código, sem perguntar) O que acontece com a produção e como reverter?
- Fonte: `.env` da VPS de produção — `APP_IMAGE`, `WORKER_IMAGE` e `SCHEDULER_IMAGE` já apontam para `ghcr.io/douglasdecastroalmeida/*` fixadas por SHA. O deploy usa `workflow_dispatch` com o SHA. Trocar os padrões do `docker-compose.prod.yml` e do kit não altera o que roda hoje; o rollback é reverter o commit (`git revert`) e reimplantar o SHA anterior.

### P5. (respondida pelo código, sem perguntar) Os nomes das imagens e o namespace têm fonte única?
- Fonte: `hostgator-setup-kit/_common.sh` (`IMG_NS`) é "a ÚNICA fonte do namespace"; `tests/unit/namespace-das-imagens.test.ts` cobra que `docker-compose.prod.yml`, `.env.hostgator.example` e a matriz de `publish-image.yml` digam o mesmo. A troca é, portanto, de um valor em poucos lugares com um teste que a vigia — desde que o teste passe a ler o valor do dono do repositório, e não uma string do upstream. Os nomes `deskcommcrm`, `deskcomm-worker`, `deskcomm-scheduler` e `deskcomm-voice-agent` ficam: renomear a marca é parte da refatoração de propriedade intelectual, que o dono adiou.

## Decisões

- **D-01** Manter `LICENSE` e o crédito ao autor original; acrescentar linha de copyright do dono e um `NOTICE` com a origem do fork, sem link que o sistema siga ou consulte (P1).
- **D-02** Nesta mudança só os **ponteiros que executam ou são vigiados por teste** passam a apontar para o repositório do dono, `DouglasDeCastroAlmeida/SolucaoCRM`, e para o namespace `ghcr.io/douglasdecastroalmeida`. A refatoração de propriedade intelectual fica para depois da primeira versão em produção (P2).
- **D-03** O catálogo de extensões passa a ter origem vazia por padrão; só se usa origem informada pelo operador. Links de documentação ao site do upstream ficam como texto (P3).
- **D-04** Fonte única do repositório e do namespace: os valores moram num só lugar por camada (kit bash e TypeScript) e os testes de identidade leem o dono do repositório em vez de cravar a string do upstream.
- **D-05** Os nomes das imagens e a marca "Deskcomm" não mudam nesta mudança.
- **D-06** Nada que já roda em produção muda: as imagens seguem fixadas por SHA no `.env`; `update.sh` de instalações existentes continua sem exigir edição manual de arquivo.
- **D-07** Histórico (`CHANGELOG.md`, `docs/audits`, `evidence/`, `triagem/`, `.sdd/archive`) não é reescrito: guarda o que aconteceu.
- **D-08** Os jobs de release do upstream (dependentes de um aplicativo do GitHub do dono dele) continuam desligados nesta mudança; o fluxo próprio de release (workflow do fork com o token padrão) entra como requisito separado e pequeno, para o changelog não estourar de novo.

## Fora de escopo

- Reescrever ou renomear código herdado, trocar a marca "Deskcomm", mudar a licença ou registrar o software (INPI): é a refatoração de propriedade intelectual, depois da primeira versão em produção.
- Criar um catálogo de extensões próprio ou um site/LP próprios.
- Reescrever documentação, README, skills, `AGENTS.md` ou `CLAUDE.md` além do mínimo para não mandar o leitor a executar algo do upstream.
- Mexer em dependências de terceiros que não são do dono do upstream (WAHA, Supabase, Redis, Caddy).

## Riscos e premissas

- **Risco: teste de identidade quebra o CI.** Vários testes cravam `melgarafael`. Mitigação: ajustar o teste junto com o valor, na mesma fatia, e provar pelo CI.
- **Risco: `update.sh` de instalação existente.** Instalações antigas com `APP_IMAGE` no `.env` seguem como estão; as sem a variável passariam a puxar a imagem do dono do repositório novo. Mitigação: prova com `pnpm test:shell` e leitura do `update.sh` antes de trocar.
- **Risco: repositório privado.** O repositório hoje é público só por minutos de Actions; ao voltar a privado, comandos `curl` a `raw.githubusercontent.com` e `git clone` anônimos deixam de funcionar para terceiros. Premissa: os clientes usam o CRM hospedado por nós, então instalação pública por `curl | bash` não é caminho de produto agora; os scripts passam a apontar para o repositório do dono e podem exigir acesso.
- **Risco: o executor de CI (`infra/executor-proprio`).** Recusa trabalho de repositório diferente do esperado; trocar o esperado sem trocar a máquina que o registra o deixaria recusando tudo. Mitigação: tratar o executor numa fatia própria, com a variável `EXECUTOR_PROPRIO` desligada durante a troca.
- **Premissa:** a licença MIT permite tudo isto, desde que o aviso de copyright seja mantido (D-01). Registro de propriedade intelectual exige orientação jurídica, fora desta mudança.
