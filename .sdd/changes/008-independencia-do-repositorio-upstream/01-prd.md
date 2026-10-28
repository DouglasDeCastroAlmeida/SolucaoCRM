# PRD: Independência do repositório upstream

> Mudança `008-independencia-do-repositorio-upstream` · porte L · 2026-10-28
> O QUÊ e o PORQUÊ. Nada de como implementar. Derivado de `00-grill.md`.

## Problema

O produto nasceu como fork do DeskcommCRM, e vários pontos que **executam** ainda apontam para o repositório, o registro de imagens e os servidores do dono do projeto original: o valor padrão das imagens no compose de produção, o kit de instalação e atualização, o instalador do executor de CI, os scripts de clone e de consulta de versão, a origem do catálogo de extensões e as condições de workflows. Hoje a produção está a salvo, porque as imagens estão fixadas por SHA no `.env` da VPS. Mas uma instalação nova sem essa variável baixaria código de um terceiro, e o dono do produto não quer nenhuma dependência de execução do dono do upstream. O custo de não resolver é um produto cuja instalação, atualização ou catálogo pode mudar ou parar por decisão alheia.

## Objetivos e métricas

- Zero ponteiro de **execução** (imagem, clone, API de release, runner, catálogo) para `melgarafael` ou `deskcomm.com.br`, medido por uma varredura automática no CI com lista de exceções que só encolhe.
- Produção e homologação inalteradas: as sondas de `/` (200) e `/app` (307) continuam verdes e nenhuma imagem em execução muda.
- Instalações existentes continuam atualizando sem edição manual de arquivo.
- Crédito ao autor original preservado (`LICENSE` e `NOTICE`).

## Personas e cenários

- **Dono do produto:** quer ser dono de toda a cadeia de entrega e não depender de terceiro para instalar, atualizar ou publicar.
- **Operador da VPS (nós, ou cliente de uma instalação própria):** instala ou atualiza e espera puxar apenas imagens do dono do produto.
- **Quem contribui ou audita:** precisa ver de onde veio o código e sob qual licença.

## Requisitos funcionais

### REQ-001: Imagens e instalação apontam para o dono do produto

Como dono do produto, quero que o padrão de toda imagem e de todo clone seja do meu registro e do meu repositório, para que nenhuma instalação baixe código de terceiro por omissão.

- **AC-001.1** Dado o `docker-compose.prod.yml` sem `APP_IMAGE`, `WORKER_IMAGE`, `SCHEDULER_IMAGE` e `VOICE_AGENT_IMAGE` no ambiente, quando a configuração é resolvida, então todas as imagens apontam para `ghcr.io/douglasdecastroalmeida/*`.
- **AC-001.2** QUANDO o kit de instalação monta as imagens e a URL de clone, o sistema DEVE usar o namespace e o repositório do dono do produto, definidos em uma única fonte por camada (bash e TypeScript).
- **AC-001.3** Dado um `.env` existente com as imagens fixadas por SHA, quando o `update.sh` roda, então nenhum valor é trocado nem exige edição manual.
- **AC-001.4** Dado o `.env.hostgator.example`, quando é lido, então as três imagens padrão apontam para o namespace do dono do produto.
- **AC-001.5** QUANDO o kit consulta a última versão publicada, o sistema DEVE consultar o repositório do dono do produto.

### REQ-002: Scripts, workflows e executor de CI apontam para o repositório do dono

Como dono do produto, quero que scripts e workflows reconheçam apenas o meu repositório, para que a esteira de entrega seja minha de ponta a ponta.

- **AC-002.1** Dado `scripts/cortar-release.ts`, `scripts/instalar-guias.sh`, `scripts/vigia-colisao-de-migration.ts` e `scripts/migration-populacao.sh`, quando executados sem configuração extra, então referenciam `DouglasDeCastroAlmeida/SolucaoCRM`.
- **AC-002.2** Dado um workflow condicionado ao repositório (`e2e.yml`, `acolhida.yml`, `release.yml` e afins), quando a condição é avaliada, então ela compara com o repositório do dono do produto.
- **AC-002.3** Dado o executor de CI próprio, quando registrado ou usado, então o repositório esperado é o do dono do produto, e a guarda contra fork continua recusando repositório diferente.
- **AC-002.4** Dado que o fluxo de release do upstream depende de um aplicativo do GitHub que não é do dono do produto, quando o fluxo é revisto, então ele passa a funcionar com o token padrão do repositório, sem aplicativo nem segredo de terceiro, e o corte de versão pode ser disparado manualmente.
- **AC-002.5** Dado o changelog, quando fragmentos se acumulam, então o corte de versão próprio os consome antes de o limite de tamanho ser ultrapassado, e o CI da `main` não reprova por esse motivo.

### REQ-003: Catálogo de extensões sem servidor de terceiro

Como operador, quero que o sistema não consulte o servidor do upstream para extensões, para que nada dependa de um domínio que não é meu.

- **AC-003.1** Dado o instalador de extensões e o gerador de catálogo sem origem informada, quando executados, então não fazem nenhuma consulta de rede e dizem que não há origem configurada.
- **AC-003.2** Dado uma origem informada pelo operador, quando o instalador roda, então usa essa origem normalmente.
- **AC-003.3** Dado uma extensão já instalada, quando a origem padrão é removida, então a extensão continua instalada e funcionando.

### REQ-004: Crédito ao autor original e origem do projeto

Como dono do produto, quero manter o crédito exigido pela licença, para estar em conformidade sem prender o sistema ao upstream.

- **AC-004.1** Dado o `LICENSE`, quando é lido, então mantém o aviso de copyright original e acrescenta uma linha de copyright do dono do produto.
- **AC-004.2** Dado o `NOTICE` na raiz, quando é lido, então diz que o projeto nasceu de um fork do DeskcommCRM sob a licença MIT, sem URL que o sistema consulte.
- **AC-004.3** Dado o `README`, quando é lido, então tem um parágrafo "Origem" nos três idiomas e nenhum comando de instalação que baixe algo do upstream.

### REQ-005: Cerca contra regressão

Como dono do produto, quero que o CI impeça a volta de um ponteiro de execução ao upstream, para a independência não se perder numa atualização.

- **AC-005.1** Dado uma varredura automática dos arquivos que executam (compose, Dockerfiles, scripts, workflows, kit, `.env.*example`), quando encontra `melgarafael` ou `deskcomm.com.br` fora da lista de exceções, então o CI reprova e aponta o arquivo e a linha.
- **AC-005.2** Dado a lista de exceções (histórico, crédito, documentação), quando alguém tenta ampliá-la, então um teste só aceita que ela encolha ou fique igual.
- **AC-005.3** Dado os testes de identidade existentes (`namespace-das-imagens`, `guarda-da-release-*`, `release-chega-na-lp`, `populacao-do-proximo-nnnn`, `deskcomm-contribuir`), quando o valor do repositório muda, então eles passam a ler o dono do repositório e continuam vigiando o mesmo comportamento.

## Requisitos não funcionais

- **Compatibilidade:** nenhuma instalação em andamento muda de versão ou de imagem por causa desta mudança; o `update.sh` segue sem exigir edição manual.
- **Segurança:** nenhum segredo novo; o fluxo de release usa só o token padrão do repositório com o menor escopo possível.
- **Reversão:** reverter o commit e reimplantar o SHA anterior volta ao estado de antes em menos de 2 minutos; a produção não é tocada.
- **Observabilidade:** a varredura do REQ-005 aponta arquivo e linha de cada ocorrência proibida.

## Fora de escopo

- Reescrever ou renomear código herdado, trocar a marca "Deskcomm" ou os nomes das imagens, mudar a licença ou registrar o software no INPI: é a refatoração de propriedade intelectual, depois da primeira versão em produção.
- Catálogo de extensões próprio e site/LP próprios.
- Reescrever a documentação além do necessário para não mandar o leitor a executar algo do upstream.
- Dependências de terceiros que não são do dono do upstream (WAHA, Supabase, Redis, Caddy).
- Reescrever o histórico (`CHANGELOG.md`, `docs/audits`, `evidence/`, `triagem/`, `.sdd/archive`).

## Dependências e riscos

- **Testes de identidade:** trocam junto com o valor, na mesma fatia, e o CI prova.
- **Executor de CI:** recusa repositório diferente do esperado; trocar o esperado sem trocar quem o registra faria a máquina recusar tudo. Fatia própria, com `EXECUTOR_PROPRIO` desligada durante a troca.
- **Repositório privado:** quando o repositório voltar a ser privado, `curl` e `git clone` anônimos deixam de funcionar para terceiros. Premissa: os clientes usam o CRM hospedado por nós.
- **Fluxo de release próprio:** precisa de permissão de escrita no repositório para abrir o PR de release; confirmar nas configurações de Actions.
- **Jurídico:** a conformidade da licença está mantida pelo REQ-004; o registro de propriedade intelectual exige orientação jurídica e está fora desta mudança.
